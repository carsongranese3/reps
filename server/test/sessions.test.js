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
