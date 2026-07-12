import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { freshApp } from './testApp.js';

let ctx;
let workoutId;

beforeAll(async () => {
  ctx = await freshApp('plan');
  const ex = await request(ctx.app).post('/api/exercises').send({ name: 'Back Squat', category: 'Legs' });
  const w = await request(ctx.app)
    .post('/api/workouts')
    .send({ title: 'Leg Day', category: 'Legs', exercises: [{ exercise_id: ex.body.id, sets: 3, reps: 8, rest: 60 }] });
  workoutId = w.body.id;
});

afterAll(() => {
  ctx.cleanup();
});

describe('Plan (fixed Mon-Sun template)', () => {
  it('starts as all-Rest (7 days, all null)', async () => {
    const res = await request(ctx.app).get('/api/plan');
    expect(res.status).toBe(200);
    expect(res.body.map((d) => d.day)).toEqual(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
    expect(res.body.every((d) => d.workout === null)).toBe(true);
  });

  it('rejects an invalid day', async () => {
    const res = await request(ctx.app).put('/api/plan/someday').send({ workout_id: workoutId });
    expect(res.status).toBe(400);
  });

  it('rejects a nonexistent workout_id', async () => {
    const res = await request(ctx.app).put('/api/plan/mon').send({ workout_id: 'nope' });
    expect(res.status).toBe(404);
  });

  it('sets a day to a workout', async () => {
    const res = await request(ctx.app).put('/api/plan/thu').send({ workout_id: workoutId });
    expect(res.status).toBe(200);
    expect(res.body.workout.id).toBe(workoutId);

    const plan = await request(ctx.app).get('/api/plan');
    const thu = plan.body.find((d) => d.day === 'thu');
    expect(thu.workout.title).toBe('Leg Day');
  });

  it('clears a day back to Rest', async () => {
    const res = await request(ctx.app).put('/api/plan/thu').send({ workout_id: null });
    expect(res.status).toBe(200);
    expect(res.body.workout).toBeNull();
  });
});
