import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { freshApp } from './testApp.js';

let ctx;
let benchId;
let workoutId;

beforeAll(async () => {
  ctx = await freshApp('sessions');
  const bench = await request(ctx.app).post('/api/exercises').send({ name: 'Barbell Bench Press', category: 'Push' });
  benchId = bench.body.id;
  const w = await request(ctx.app)
    .post('/api/workouts')
    .send({
      title: 'Push Day A',
      category: 'Push',
      exercises: [{ exercise_id: benchId, sets: 3, reps: '8-10', rest: 90 }],
    });
  workoutId = w.body.id;
});

afterAll(() => {
  ctx.cleanup();
});

describe('Session creation — derived totals', () => {
  it('requires workout_id (or a workout_title snapshot)', async () => {
    const res = await request(ctx.app).post('/api/sessions').send({ entries: [] });
    expect(res.status).toBe(400);
  });

  it('404s for an unknown workout_id', async () => {
    const res = await request(ctx.app).post('/api/sessions').send({ workout_id: 'nope', entries: [] });
    expect(res.status).toBe(404);
  });

  it('creates a session and derives total_sets/total_volume, ignoring unchecked sets', async () => {
    const res = await request(ctx.app)
      .post('/api/sessions')
      .send({
        workout_id: workoutId,
        date: '2026-07-08T10:00:00.000Z',
        duration_sec: 3000,
        entries: [
          {
            exercise_id: benchId,
            sets: [
              { weight: 135, reps: 8, completed: true },
              { weight: 135, reps: 8, completed: true },
              { weight: 135, reps: 6, completed: false }, // unchecked -> excluded
            ],
          },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.workout_title).toBe('Push Day A'); // snapshot from the workout
    expect(res.body.workout_category).toBe('Push');
    expect(res.body.total_sets).toBe(2);
    expect(res.body.total_volume).toBe(135 * 8 * 2);
    expect(res.body.entries[0].exercise_name).toBe('Barbell Bench Press'); // filled from library
    expect(res.body.prs).toEqual([]); // first time logging this exercise -> no prior best to beat
  });

  it('computes duration_sec from started_at/ended_at when provided instead of a raw duration_sec', async () => {
    const res = await request(ctx.app)
      .post('/api/sessions')
      .send({
        workout_id: workoutId,
        date: '2026-07-09T10:00:00.000Z',
        started_at: '2026-07-09T10:00:00.000Z',
        ended_at: '2026-07-09T10:20:00.000Z',
        entries: [],
      });
    expect(res.status).toBe(201);
    expect(res.body.duration_sec).toBe(1200);
    expect(res.body.total_sets).toBe(0);
    expect(res.body.total_volume).toBe(0);
  });
});

describe('PR detection (decision #10: exceeds prior best weight ever, any reps)', () => {
  it('flags a PR when a later session beats the prior best, and not when it does not', async () => {
    // Session A: 140 lb (this is the second session ever for this exercise in
    // this describe-local sequence, but PR logic looks at all prior sessions
    // across the whole file — 135 lb was already logged above).
    const higher = await request(ctx.app)
      .post('/api/sessions')
      .send({
        workout_id: workoutId,
        date: '2026-07-10T10:00:00.000Z',
        duration_sec: 100,
        entries: [{ exercise_id: benchId, sets: [{ weight: 140, reps: 8, completed: true }] }],
      });
    expect(higher.body.prs).toEqual([
      { exercise_id: benchId, exercise_name: 'Barbell Bench Press', prior_best: 135, new_best: 140, delta: 5 },
    ]);

    const lower = await request(ctx.app)
      .post('/api/sessions')
      .send({
        workout_id: workoutId,
        date: '2026-07-11T10:00:00.000Z',
        duration_sec: 100,
        entries: [{ exercise_id: benchId, sets: [{ weight: 130, reps: 8, completed: true }] }],
      });
    expect(lower.body.prs).toEqual([]);
  });
});

describe('GET /api/sessions — history ordering + pagination', () => {
  it('returns sessions most-recent-first', async () => {
    const res = await request(ctx.app).get('/api/sessions');
    expect(res.status).toBe(200);
    const dates = res.body.sessions.map((s) => s.date);
    const sorted = [...dates].sort().reverse();
    expect(dates).toEqual(sorted);
    expect(res.body.total).toBe(dates.length);
  });

  it('respects ?limit=', async () => {
    const res = await request(ctx.app).get('/api/sessions?limit=1');
    expect(res.body.sessions.length).toBe(1);
  });
});

describe('PUT /api/sessions/:id — edit a logged session (decision #22)', () => {
  it('404s for an unknown id', async () => {
    const res = await request(ctx.app).put('/api/sessions/nope').send({ entries: [] });
    expect(res.status).toBe(404);
  });

  it('edits entries and recomputes total_sets/total_volume, reflected on GET /:id', async () => {
    const created = await request(ctx.app)
      .post('/api/sessions')
      .send({
        workout_id: workoutId,
        date: '2026-07-13T10:00:00.000Z',
        duration_sec: 500,
        entries: [{ exercise_id: benchId, sets: [{ weight: 100, reps: 10, completed: true }] }],
      });
    const sessionId = created.body.id;
    expect(created.body.total_volume).toBe(1000);

    const edited = await request(ctx.app)
      .put(`/api/sessions/${sessionId}`)
      .send({
        entries: [{ exercise_id: benchId, sets: [{ weight: 120, reps: 10, completed: true }] }],
      });
    expect(edited.status).toBe(200);
    expect(edited.body.id).toBe(sessionId);
    expect(edited.body.total_sets).toBe(1);
    expect(edited.body.total_volume).toBe(1200);
    expect(edited.body.workout_title).toBe('Push Day A'); // snapshot kept, not touched by the edit

    const fetched = await request(ctx.app).get(`/api/sessions/${sessionId}`);
    expect(fetched.body.total_volume).toBe(1200);
    expect(fetched.body.entries[0].sets[0].weight).toBe(120);
  });

  it('recomputes PRs excluding this session from its own prior-best: raising a weight above every OTHER session creates a PR, lowering it back removes it, and re-saving unchanged data is not spurious', async () => {
    const exA = await request(ctx.app).post('/api/exercises').send({ name: 'Overhead Press', category: 'Push' });
    const exerciseId = exA.body.id;

    // Session 1: establishes a prior best of 50.
    const first = await request(ctx.app)
      .post('/api/sessions')
      .send({
        workout_id: workoutId,
        date: '2026-07-14T10:00:00.000Z',
        duration_sec: 100,
        entries: [{ exercise_id: exerciseId, sets: [{ weight: 50, reps: 8, completed: true }] }],
      });
    expect(first.body.prs).toEqual([]); // first time ever -> no prior best to beat

    // Session 2: logs 45 (below 50) -> not a PR at creation.
    const second = await request(ctx.app)
      .post('/api/sessions')
      .send({
        workout_id: workoutId,
        date: '2026-07-15T10:00:00.000Z',
        duration_sec: 100,
        entries: [{ exercise_id: exerciseId, sets: [{ weight: 45, reps: 8, completed: true }] }],
      });
    expect(second.body.prs).toEqual([]);
    const secondId = second.body.id;

    // Re-saving session 2 UNCHANGED must not spuriously add a PR (its own prior
    // entries are excluded from the "best of other sessions" scan, so this must
    // compare 45 against session 1's 50 only — still not a PR).
    const resaved = await request(ctx.app)
      .put(`/api/sessions/${secondId}`)
      .send({ entries: [{ exercise_id: exerciseId, sets: [{ weight: 45, reps: 8, completed: true }] }] });
    expect(resaved.body.prs).toEqual([]);

    // Editing session 2's weight UP above every other session's best (50) creates a PR.
    const raised = await request(ctx.app)
      .put(`/api/sessions/${secondId}`)
      .send({ entries: [{ exercise_id: exerciseId, sets: [{ weight: 55, reps: 8, completed: true }] }] });
    expect(raised.body.prs).toEqual([
      { exercise_id: exerciseId, exercise_name: 'Overhead Press', prior_best: 50, new_best: 55, delta: 5 },
    ]);

    // Editing it back down below 50 removes the PR again.
    const lowered = await request(ctx.app)
      .put(`/api/sessions/${secondId}`)
      .send({ entries: [{ exercise_id: exerciseId, sets: [{ weight: 40, reps: 8, completed: true }] }] });
    expect(lowered.body.prs).toEqual([]);
  });

  it('allows re-pointing workout_id, which re-snapshots workout_title/workout_category', async () => {
    const other = await request(ctx.app)
      .post('/api/workouts')
      .send({
        title: 'Pull Day A',
        category: 'Pull',
        exercises: [{ exercise_id: benchId, sets: 3, reps: '8-10', rest: 90 }],
      });
    const created = await request(ctx.app)
      .post('/api/sessions')
      .send({ workout_id: workoutId, date: '2026-07-16T10:00:00.000Z', duration_sec: 60, entries: [] });

    const edited = await request(ctx.app)
      .put(`/api/sessions/${created.body.id}`)
      .send({ workout_id: other.body.id });
    expect(edited.status).toBe(200);
    expect(edited.body.workout_id).toBe(other.body.id);
    expect(edited.body.workout_title).toBe('Pull Day A');
    expect(edited.body.workout_category).toBe('Pull');
  });

  it('404s when re-pointed workout_id does not exist', async () => {
    const created = await request(ctx.app)
      .post('/api/sessions')
      .send({ workout_id: workoutId, date: '2026-07-17T10:00:00.000Z', duration_sec: 60, entries: [] });
    const edited = await request(ctx.app).put(`/api/sessions/${created.body.id}`).send({ workout_id: 'nope' });
    expect(edited.status).toBe(404);
  });

  it('editing one session never mutates another session stored prs (decision #10 — a PR is a historical fact)', async () => {
    const ex = await request(ctx.app).post('/api/exercises').send({ name: 'Front Squat', category: 'Legs' });
    const exId = ex.body.id;

    // Session 1: first log of 100 -> no prior best, no PR.
    const s1 = await request(ctx.app).post('/api/sessions').send({
      workout_id: workoutId,
      date: '2026-06-01T10:00:00.000Z',
      duration_sec: 100,
      entries: [{ exercise_id: exId, sets: [{ weight: 100, reps: 5, completed: true }] }],
    });
    expect(s1.body.prs).toEqual([]);

    // Session 2: logs 130 -> a legitimate PR over session 1's 100.
    const s2 = await request(ctx.app).post('/api/sessions').send({
      workout_id: workoutId,
      date: '2026-06-02T10:00:00.000Z',
      duration_sec: 100,
      entries: [{ exercise_id: exId, sets: [{ weight: 130, reps: 5, completed: true }] }],
    });
    expect(s2.body.prs).toHaveLength(1);
    expect(s2.body.prs[0]).toMatchObject({ exercise_id: exId, prior_best: 100, new_best: 130 });

    // Edit session 1 (an UNRELATED, earlier session) — its own prs recompute,
    // but session 2's stored prs (a historical fact) must remain untouched.
    await request(ctx.app)
      .put(`/api/sessions/${s1.body.id}`)
      .send({ entries: [{ exercise_id: exId, sets: [{ weight: 90, reps: 5, completed: true }] }] });

    const s2After = await request(ctx.app).get(`/api/sessions/${s2.body.id}`);
    expect(s2After.body.prs).toEqual(s2.body.prs); // unchanged by the edit to session 1
  });

  it('re-saving a session that holds a legitimate PR unchanged keeps that PR (exclude-self is not over-eager)', async () => {
    const ex = await request(ctx.app).post('/api/exercises').send({ name: 'Romanian Deadlift', category: 'Legs' });
    const exId = ex.body.id;

    await request(ctx.app).post('/api/sessions').send({
      workout_id: workoutId,
      date: '2026-06-03T10:00:00.000Z',
      duration_sec: 100,
      entries: [{ exercise_id: exId, sets: [{ weight: 200, reps: 5, completed: true }] }],
    });
    const pr = await request(ctx.app).post('/api/sessions').send({
      workout_id: workoutId,
      date: '2026-06-04T10:00:00.000Z',
      duration_sec: 100,
      entries: [{ exercise_id: exId, sets: [{ weight: 250, reps: 5, completed: true }] }],
    });
    expect(pr.body.prs).toHaveLength(1);

    // Re-save the PR-holding session UNCHANGED. Excluding self from prior-best means
    // it is still compared against the other session's 200 -> the PR survives.
    const resaved = await request(ctx.app)
      .put(`/api/sessions/${pr.body.id}`)
      .send({ entries: [{ exercise_id: exId, sets: [{ weight: 250, reps: 5, completed: true }] }] });
    expect(resaved.body.prs).toHaveLength(1);
    expect(resaved.body.prs[0]).toMatchObject({ prior_best: 200, new_best: 250 });
  });
});

describe('Orphaned session (workout deleted after completion)', () => {
  it('keeps the snapshot fields and still renders after the workout is deleted', async () => {
    const created = await request(ctx.app)
      .post('/api/sessions')
      .send({ workout_id: workoutId, date: '2026-07-12T10:00:00.000Z', duration_sec: 60, entries: [] });
    const sessionId = created.body.id;

    await request(ctx.app).delete(`/api/workouts/${workoutId}`);

    const fetched = await request(ctx.app).get(`/api/sessions/${sessionId}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.workout_title).toBe('Push Day A');
    expect(fetched.body.workout_category).toBe('Push');
    expect(fetched.body.workout_id).toBe(workoutId); // id retained even though the workout is gone

    const workoutGone = await request(ctx.app).get(`/api/workouts/${workoutId}`);
    expect(workoutGone.status).toBe(404);
  });
});
