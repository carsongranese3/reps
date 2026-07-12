import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { freshApp } from './testApp.js';

let ctx;
let exId;
let wA;
let wB;

async function makeWorkout(title) {
  const res = await request(ctx.app)
    .post('/api/workouts')
    .send({ title, category: 'Strength', exercises: [{ exercise_id: exId, sets: 1, reps: 1, rest: 0 }] });
  return res.body.id;
}

beforeAll(async () => {
  ctx = await freshApp('schedule');
  const ex = await request(ctx.app).post('/api/exercises').send({ name: 'Back Squat', category: 'Legs' });
  exId = ex.body.id;
  wA = await makeWorkout('Workout A');
  wB = await makeWorkout('Workout B');

  // Weekly template: Monday -> Workout A, everything else Rest.
  await request(ctx.app).put('/api/plan/mon').send({ workout_id: wA });
});

afterAll(() => {
  ctx.cleanup();
});

describe('GET /api/schedule — validation', () => {
  it('400s when from/to are missing or malformed', async () => {
    expect((await request(ctx.app).get('/api/schedule')).status).toBe(400);
    expect((await request(ctx.app).get('/api/schedule?from=2026-07-01')).status).toBe(400);
    expect((await request(ctx.app).get('/api/schedule?from=nope&to=2026-07-31')).status).toBe(400);
  });

  it('400s when to < from', async () => {
    const res = await request(ctx.app).get('/api/schedule?from=2026-07-10&to=2026-07-01');
    expect(res.status).toBe(400);
  });

  it('400s when the range exceeds the cap', async () => {
    const res = await request(ctx.app).get('/api/schedule?from=2026-01-01&to=2026-12-31');
    expect(res.status).toBe(400);
  });
});

describe('GET /api/schedule — unset dates fall back to the weekly template (§4)', () => {
  it('resolves a Monday->Workout A, everything-else-Rest week with source "template"', async () => {
    // Mon 2026-07-06 .. Sun 2026-07-12
    const res = await request(ctx.app).get('/api/schedule?from=2026-07-06&to=2026-07-12&today=2026-07-06');
    expect(res.status).toBe(200);
    expect(res.body.schedule.length).toBe(7);
    const byDate = Object.fromEntries(res.body.schedule.map((e) => [e.date, e]));

    expect(byDate['2026-07-06'].source).toBe('template');
    expect(byDate['2026-07-06'].is_set).toBe(false);
    expect(byDate['2026-07-06'].workouts.map((w) => w.id)).toEqual([wA]);

    expect(byDate['2026-07-07'].source).toBe('template');
    expect(byDate['2026-07-07'].is_set).toBe(false);
    expect(byDate['2026-07-07'].workouts).toEqual([]);
  });
});

describe('PUT /api/schedule/:date — set multiple workouts (override, §2.2/§3)', () => {
  it('replaces the date with an ordered, non-deduped list and marks it "set"', async () => {
    const res = await request(ctx.app).put('/api/schedule/2026-07-06').send({ workout_ids: [wB, wA, wB] });
    expect(res.status).toBe(200);
    expect(res.body.date).toBe('2026-07-06');
    expect(res.body.source).toBe('schedule');
    expect(res.body.is_set).toBe(true);
    // Order preserved, duplicates allowed (spec §2.2 edge case).
    expect(res.body.workouts.map((w) => w.id)).toEqual([wB, wA, wB]);
  });

  it('a later GET reflects the override, not the template', async () => {
    const res = await request(ctx.app).get('/api/schedule?from=2026-07-06&to=2026-07-06');
    const entry = res.body.schedule[0];
    expect(entry.source).toBe('schedule');
    expect(entry.workouts.map((w) => w.id)).toEqual([wB, wA, wB]);
  });

  it('404s on an unknown workout_id and does not mutate the date', async () => {
    const before = await request(ctx.app).get('/api/schedule?from=2026-07-06&to=2026-07-06');
    const res = await request(ctx.app).put('/api/schedule/2026-07-06').send({ workout_ids: ['nope'] });
    expect(res.status).toBe(404);
    const after = await request(ctx.app).get('/api/schedule?from=2026-07-06&to=2026-07-06');
    expect(after.body.schedule[0]).toEqual(before.body.schedule[0]);
  });

  it('400s on an invalid :date', async () => {
    const res = await request(ctx.app).put('/api/schedule/not-a-date').send({ workout_ids: [wA] });
    expect(res.status).toBe(400);
  });

  it('400s on a malformed body (no recognized key)', async () => {
    const res = await request(ctx.app).put('/api/schedule/2026-07-06').send({ foo: 'bar' });
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/schedule/:date — Mark Rest (explicit Rest-marker, §3)', () => {
  it('sets a single NULL-marker row that overrides the template with nothing', async () => {
    const res = await request(ctx.app).put('/api/schedule/2026-07-06').send({ rest: true });
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('rest');
    expect(res.body.is_set).toBe(true);
    expect(res.body.workouts).toEqual([]);
  });

  it('is distinguishable from an unset template-Rest day (is_set true vs false)', async () => {
    const rested = await request(ctx.app).get('/api/schedule?from=2026-07-06&to=2026-07-06');
    const templateRest = await request(ctx.app).get('/api/schedule?from=2026-07-07&to=2026-07-07');
    expect(rested.body.schedule[0].source).toBe('rest');
    expect(rested.body.schedule[0].is_set).toBe(true);
    expect(templateRest.body.schedule[0].source).toBe('template');
    expect(templateRest.body.schedule[0].is_set).toBe(false);
  });

  it('adding a workout after Rest removes the marker (a date cannot be both)', async () => {
    const res = await request(ctx.app).put('/api/schedule/2026-07-06').send({ workout_ids: [wA] });
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('schedule');
    expect(res.body.workouts.map((w) => w.id)).toEqual([wA]);
  });
});

describe('PUT /api/schedule/:date — Clear (revert to template, §2.2)', () => {
  it('deletes the override entirely, falling back to the template again', async () => {
    const res = await request(ctx.app).put('/api/schedule/2026-07-06').send({ clear: true });
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('template');
    expect(res.body.is_set).toBe(false);
    expect(res.body.workouts.map((w) => w.id)).toEqual([wA]); // Monday's template workout
  });

  it('an empty workout_ids array behaves like clear (zero rows -> unset)', async () => {
    await request(ctx.app).put('/api/schedule/2026-07-06').send({ workout_ids: [wA, wB] });
    const res = await request(ctx.app).put('/api/schedule/2026-07-06').send({ workout_ids: [] });
    expect(res.status).toBe(200);
    expect(res.body.is_set).toBe(false);
    expect(res.body.source).toBe('template');
  });
});

describe('Resolution rule — dangling workout_id is defensively skipped on read (§7)', () => {
  it('a schedule row pointing at a workout that no longer exists in the workouts table renders as if absent', async () => {
    // Simulate a not-yet-cascaded dangling reference directly (the normal API
    // path always cascades on delete — see the cascade test below).
    ctx.db
      .prepare('INSERT INTO schedule (id, date, workout_id, sort_order, created_at) VALUES (?, ?, ?, ?, ?)')
      .run('dangling-row-1', '2026-09-01', 'not-a-real-workout-id', 0, new Date().toISOString());

    const res = await request(ctx.app).get('/api/schedule?from=2026-09-01&to=2026-09-01');
    expect(res.status).toBe(200);
    const entry = res.body.schedule[0];
    // The row exists (date is "set") but the dangling workout is skipped, not crashed on.
    expect(entry.is_set).toBe(true);
    expect(entry.source).toBe('schedule');
    expect(entry.workouts).toEqual([]);
  });
});

describe('DELETE /api/workouts/:id — cascades to schedule rows (§7, decision #21)', () => {
  it('deletes (never nulls) schedule rows referencing the deleted workout', async () => {
    const w = await makeWorkout('Doomed Workout');
    // 2026-10-06 is a Tuesday — Rest in the fixed template (only Monday is set).
    await request(ctx.app).put('/api/schedule/2026-10-06').send({ workout_ids: [w] });

    const before = await request(ctx.app).get('/api/schedule?from=2026-10-06&to=2026-10-06');
    expect(before.body.schedule[0].is_set).toBe(true);

    await request(ctx.app).delete(`/api/workouts/${w}`);

    const after = await request(ctx.app).get('/api/schedule?from=2026-10-06&to=2026-10-06&today=2026-10-06');
    // Zero rows now -> unset -> template fallback (Tue in the fixed template is Rest).
    expect(after.body.schedule[0].is_set).toBe(false);
    expect(after.body.schedule[0].source).toBe('template');
    expect(after.body.schedule[0].workouts).toEqual([]);
  });

  it('leaves a mixed date with other workouts intact, dropping only the deleted one', async () => {
    const wKeep = await makeWorkout('Keeper Workout');
    const wGone = await makeWorkout('Gone Workout');
    await request(ctx.app).put('/api/schedule/2026-10-07').send({ workout_ids: [wKeep, wGone] });

    await request(ctx.app).delete(`/api/workouts/${wGone}`);

    const res = await request(ctx.app).get('/api/schedule?from=2026-10-07&to=2026-10-07');
    expect(res.body.schedule[0].is_set).toBe(true);
    expect(res.body.schedule[0].source).toBe('schedule');
    expect(res.body.schedule[0].workouts.map((w) => w.id)).toEqual([wKeep]);
  });
});

describe('GET /api/schedule — status overlay (optional completion cue)', () => {
  it('marks a past planned-but-unsatisfied date missed, and a Rest date rest', async () => {
    await request(ctx.app).put('/api/schedule/2026-11-02').send({ workout_ids: [wA] });
    const res = await request(ctx.app).get('/api/schedule?from=2026-11-02&to=2026-11-03&today=2026-11-10');
    const byDate = Object.fromEntries(res.body.schedule.map((e) => [e.date, e]));
    expect(byDate['2026-11-02'].status).toBe('missed');
    expect(byDate['2026-11-03'].status).toBe('rest');
  });

  it('marks a future planned date "planned"', async () => {
    await request(ctx.app).put('/api/schedule/2026-11-20').send({ workout_ids: [wA] });
    const res = await request(ctx.app).get('/api/schedule?from=2026-11-20&to=2026-11-20&today=2026-11-10');
    expect(res.body.schedule[0].status).toBe('planned');
  });

  it('a completed session on the date marks it done regardless of the plan', async () => {
    await request(ctx.app)
      .post('/api/sessions')
      .send({ workout_id: wA, date: '2026-11-20T09:00:00.000Z', duration_sec: 60, entries: [] });
    const res = await request(ctx.app).get('/api/schedule?from=2026-11-20&to=2026-11-20&today=2026-11-25');
    expect(res.body.schedule[0].status).toBe('done');
  });
});
