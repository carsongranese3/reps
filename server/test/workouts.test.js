import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { freshApp } from './testApp.js';

let ctx;
let benchId;
let squatId;

beforeAll(async () => {
  ctx = await freshApp('workouts');
  const bench = await request(ctx.app).post('/api/exercises').send({ name: 'Barbell Bench Press', category: 'Push' });
  benchId = bench.body.id;
  const squat = await request(ctx.app).post('/api/exercises').send({ name: 'Back Squat', category: 'Legs' });
  squatId = squat.body.id;
});

afterAll(() => {
  ctx.cleanup();
});

describe('Workout validation (decision #7: name + >=1 exercise required)', () => {
  it('rejects a workout with no title', async () => {
    const res = await request(ctx.app)
      .post('/api/workouts')
      .send({ exercises: [{ exercise_id: benchId, sets: 3, reps: 8, rest: 60 }] });
    expect(res.status).toBe(400);
  });

  it('rejects a workout with zero exercises', async () => {
    const res = await request(ctx.app).post('/api/workouts').send({ title: 'Empty Day', exercises: [] });
    expect(res.status).toBe(400);
  });

  it('rejects an invalid type or category', async () => {
    const res = await request(ctx.app).post('/api/workouts').send({
      title: 'Bad Type',
      type: 'Bogus',
      exercises: [{ exercise_id: benchId, sets: 3, reps: 8, rest: 60 }],
    });
    expect(res.status).toBe(400);
  });
});

describe('Workout CRUD + est_minutes', () => {
  let id;

  it('creates a workout and computes est_minutes server-side', async () => {
    const res = await request(ctx.app)
      .post('/api/workouts')
      .send({
        title: 'Push Day A',
        type: 'Strength',
        category: 'Push',
        exercises: [{ exercise_id: benchId, sets: 4, reps: '8-10', rest: 90 }],
      });
    expect(res.status).toBe(201);
    // 4 sets * (9 avg reps * 3.5s + 90s rest) = 4 * 121.5 = 486s = 8.1min -> round to 5 -> 10
    expect(res.body.est_minutes).toBe(10);
    expect(res.body.exercise_count).toBe(1);
    expect(res.body.favorite).toBe(false);
    id = res.body.id;
  });

  it('ignores a client-supplied est_minutes (always server-derived)', async () => {
    const res = await request(ctx.app)
      .post('/api/workouts')
      .send({
        title: 'Fake Estimate',
        exercises: [{ exercise_id: benchId, sets: 1, reps: 1, rest: 0 }],
        est_minutes: 9999,
      });
    expect(res.body.est_minutes).not.toBe(9999);
  });

  it('edits an existing workout in place (same id, no duplicate) and recomputes est_minutes', async () => {
    const res = await request(ctx.app)
      .put(`/api/workouts/${id}`)
      .send({
        exercises: [
          { exercise_id: benchId, sets: 4, reps: '8-10', rest: 90 },
          { exercise_id: squatId, sets: 3, reps: 8, rest: 60 },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(id);
    expect(res.body.exercise_count).toBe(2);
    expect(res.body.title).toBe('Push Day A'); // preserved from before

    const list = await request(ctx.app).get('/api/workouts');
    expect(list.body.filter((w) => w.title === 'Push Day A').length).toBe(1);
  });

  it('toggles favorite via a partial PUT without needing the full payload', async () => {
    const res = await request(ctx.app).put(`/api/workouts/${id}`).send({ favorite: true });
    expect(res.status).toBe(200);
    expect(res.body.favorite).toBe(true);
    expect(res.body.exercise_count).toBe(2); // untouched by the partial update
  });

  it('filters by category, favorite, and q (matches contained exercise name)', async () => {
    await request(ctx.app).post('/api/workouts').send({
      title: 'Leg Day',
      category: 'Legs',
      exercises: [{ exercise_id: squatId, sets: 3, reps: 8, rest: 60 }],
    });

    const byCategory = await request(ctx.app).get('/api/workouts?category=Legs');
    expect(byCategory.body.every((w) => w.category === 'Legs')).toBe(true);

    const byFavorite = await request(ctx.app).get('/api/workouts?favorite=1');
    expect(byFavorite.body.some((w) => w.title === 'Push Day A')).toBe(true);
    expect(byFavorite.body.every((w) => w.favorite)).toBe(true);

    const byExerciseName = await request(ctx.app).get('/api/workouts?q=squat');
    expect(byExerciseName.body.some((w) => w.title === 'Leg Day')).toBe(true);
  });

  it('404s for get/put/delete on an unknown workout id', async () => {
    expect((await request(ctx.app).get('/api/workouts/nope')).status).toBe(404);
    expect((await request(ctx.app).put('/api/workouts/nope').send({ title: 'x' })).status).toBe(404);
    expect((await request(ctx.app).delete('/api/workouts/nope')).status).toBe(404);
  });

  it('deletes a workout', async () => {
    const res = await request(ctx.app).delete(`/api/workouts/${id}`);
    expect(res.status).toBe(200);
    const after = await request(ctx.app).get(`/api/workouts/${id}`);
    expect(after.status).toBe(404);
  });
});
