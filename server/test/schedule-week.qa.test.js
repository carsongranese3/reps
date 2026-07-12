// QA-added coverage (qa-agent) for specs/schedule.md §5 risk areas the existing
// suites don't pin down directly:
//   1. This Week single-workout behaviour is unchanged by the workout->workouts[] shape.
//   2. A past Missed day converted to an explicit Rest override PASSES THROUGH and
//      extends the streak (spec §2.2 "planning the past" + §5.3).
//   3. streak stays identical between /api/week and /api/stats WHILE overrides are active.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { freshApp } from './testApp.js';

let ctx;
let exId;
let wMon;

async function makeWorkout(title) {
  const res = await request(ctx.app)
    .post('/api/workouts')
    .send({ title, category: 'Strength', exercises: [{ exercise_id: exId, sets: 1, reps: 1, rest: 0 }] });
  return res.body.id;
}
async function session(workout_id, date) {
  return request(ctx.app).post('/api/sessions').send({ workout_id, date, duration_sec: 60, entries: [] });
}

beforeAll(async () => {
  ctx = await freshApp('schedule-week-qa');
  const ex = await request(ctx.app).post('/api/exercises').send({ name: 'Back Squat', category: 'Legs' });
  exId = ex.body.id;
  wMon = await makeWorkout('Mon Workout');
  // Template: only Monday planned. Everything else Rest. M(template) = 1/week.
  await request(ctx.app).put('/api/plan/mon').send({ workout_id: wMon });
});

afterAll(() => ctx.cleanup());

describe('This Week single-workout regression (workouts[] shape, spec §5.4)', () => {
  it('a single-planned template day exposes exactly one workout and today.workouts mirrors it', async () => {
    // Mon 2026-07-06 is the only planned day; today=Mon.
    const res = await request(ctx.app).get('/api/week?today=2026-07-06');
    expect(res.status).toBe(200);
    const byDay = Object.fromEntries(res.body.days.map((d) => [d.day, d]));

    // Single-workout day: array of length 1 (not a bare object, not >1).
    expect(byDay.mon.workouts.map((w) => w.id)).toEqual([wMon]);
    expect(byDay.mon.status).toBe('planned');
    // A genuine Rest day is an empty array.
    expect(byDay.tue.workouts).toEqual([]);
    expect(byDay.tue.status).toBe('rest');

    // today mirror is present and is the same single-entry array.
    expect(res.body.today).not.toBeNull();
    expect(res.body.today.is_today).toBe(true);
    expect(res.body.today.workouts.map((w) => w.id)).toEqual([wMon]);

    // M counts the one planned entry; nothing done yet.
    expect(res.body.m).toBe(1);
    expect(res.body.n).toBe(0);
  });
});

describe('Planning the past: a Rest override on a past Missed day extends the streak (§2.2 / §5.3)', () => {
  // Use an isolated week far from other state. Mon 2026-09-07 .. Sun 2026-09-13.
  // Template plans Monday (wMon). today = Wed 2026-09-09.
  it('before override: past planned Monday with no session is Missed and breaks the streak back-walk', async () => {
    // Log Tuesday (off-plan) so the day immediately before "today" is Done — this
    // isolates Monday as the thing that breaks/extends the streak.
    await session(wMon, '2026-09-08T09:00:00.000Z'); // Tue -> Done (off-plan)
    const res = await request(ctx.app).get('/api/week?today=2026-09-09');
    const byDate = Object.fromEntries(res.body.days.map((d) => [d.date, d]));
    expect(byDate['2026-09-07'].status).toBe('missed'); // Mon planned, no session
    expect(byDate['2026-09-08'].status).toBe('done');
    // Walk back from Wed(skip, planned-not-done) -> Tue done(+1) -> Mon missed(break). streak = 1.
    expect(res.body.streak).toBe(1);
  });

  it('after marking that past Monday as an explicit Rest override, it passes through and the streak reaches back further', async () => {
    // Make the Monday BEFORE (2026-08-31, prior week) Done so there is something to reach.
    await session(wMon, '2026-08-31T09:00:00.000Z');
    // Now convert the missed Monday 2026-09-07 into an explicit Rest override.
    const put = await request(ctx.app).put('/api/schedule/2026-09-07').send({ rest: true });
    expect(put.body.source).toBe('rest');

    const res = await request(ctx.app).get('/api/week?today=2026-09-09');
    const byDate = Object.fromEntries(res.body.days.map((d) => [d.date, d]));
    // The formerly-Missed Monday is now Rest (no session, empty planned).
    expect(byDate['2026-09-07'].status).toBe('rest');
    // Streak now: Wed(skip) -> Tue done(+1) -> Mon rest(pass) -> Sun..Mon prior week all
    // Rest(pass) -> prior Monday 2026-08-31 done(+1) -> before that template Monday missed(break).
    expect(res.body.streak).toBe(2);
  });
});

describe('streak parity between /api/week and /api/stats WITH overrides active', () => {
  it('both shared computations agree while schedule overrides are in play', async () => {
    const week = await request(ctx.app).get('/api/week?today=2026-09-09');
    const stats = await request(ctx.app).get('/api/stats?today=2026-09-09');
    expect(stats.body.current_streak).toBe(week.body.streak);
    expect(week.body.streak).toBe(2);
  });
});
