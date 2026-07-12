import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { freshApp } from './testApp.js';

let ctx;

beforeAll(async () => {
  ctx = await freshApp('exercises');
});

afterAll(() => {
  ctx.cleanup();
});

describe('Exercises CRUD', () => {
  let id;

  it('rejects a name-less exercise', async () => {
    const res = await request(ctx.app).post('/api/exercises').send({ category: 'Push' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/name/i);
  });

  it('creates an exercise', async () => {
    const res = await request(ctx.app).post('/api/exercises').send({
      name: '  Barbell Bench Press ',
      category: 'Push',
      equipment: 'Barbell',
      difficulty: 'Intermediate',
      muscles_worked: ['Chest', 'Triceps', 'Front delts'],
      how_to: ['Step 1', 'Step 2'],
    });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Barbell Bench Press');
    expect(res.body.muscles_worked).toEqual(['Chest', 'Triceps', 'Front delts']);
    expect(res.body.has_demo).toBe(false);
    expect(res.body).not.toHaveProperty('demo_file');
    id = res.body.id;
  });

  it('gets the exercise by id, including a null last_time (no sessions yet)', async () => {
    const res = await request(ctx.app).get(`/api/exercises/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Barbell Bench Press');
    expect(res.body.last_time).toBeNull();
  });

  it('404s for an unknown exercise id', async () => {
    const res = await request(ctx.app).get('/api/exercises/does-not-exist');
    expect(res.status).toBe(404);
  });

  it('lists exercises and supports ?q= search', async () => {
    await request(ctx.app).post('/api/exercises').send({ name: 'Overhead Press', category: 'Push' });
    const all = await request(ctx.app).get('/api/exercises');
    expect(all.body.length).toBe(2);

    const q = await request(ctx.app).get('/api/exercises?q=bench');
    expect(q.body.length).toBe(1);
    expect(q.body[0].name).toBe('Barbell Bench Press');
  });

  it('supports ?category= filter', async () => {
    await request(ctx.app).post('/api/exercises').send({ name: 'Back Squat', category: 'Legs' });
    const res = await request(ctx.app).get('/api/exercises?category=Legs');
    expect(res.body.length).toBe(1);
    expect(res.body[0].name).toBe('Back Squat');
  });

  it('rejects an invalid category', async () => {
    const res = await request(ctx.app).post('/api/exercises').send({ name: 'Bogus', category: 'NotACategory' });
    expect(res.status).toBe(400);
  });

  it('updates an exercise in place (no duplicate)', async () => {
    const res = await request(ctx.app).put(`/api/exercises/${id}`).send({ difficulty: 'Advanced' });
    expect(res.status).toBe(200);
    expect(res.body.difficulty).toBe('Advanced');
    expect(res.body.name).toBe('Barbell Bench Press'); // unspecified fields preserved

    const list = await request(ctx.app).get('/api/exercises');
    expect(list.body.length).toBe(3); // still 3, not duplicated
  });

  it('GET demo 404s when the exercise has no demo file', async () => {
    const res = await request(ctx.app).get(`/api/exercises/${id}/demo`);
    expect(res.status).toBe(404);
  });

  it('deletes an exercise', async () => {
    const res = await request(ctx.app).delete(`/api/exercises/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);

    const after = await request(ctx.app).get(`/api/exercises/${id}`);
    expect(after.status).toBe(404);
  });

  it('404s deleting an already-deleted exercise', async () => {
    const res = await request(ctx.app).delete(`/api/exercises/${id}`);
    expect(res.status).toBe(404);
  });
});
