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
      equipment_groups: [['Barbell'], ['Bench']],
      difficulty: 'Intermediate',
      muscles_worked: ['Chest', 'Triceps', 'Front delts'],
      how_to: ['Step 1', 'Step 2'],
    });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Barbell Bench Press');
    expect(res.body.muscles_worked).toEqual(['Chest', 'Triceps', 'Front delts']);
    expect(res.body.has_demo).toBe(false);
    expect(res.body).not.toHaveProperty('demo_file');
    // equipment_groups (decision #28) is the source of truth (AND-of-ORs);
    // `equipment` is a derived, read-only summary string.
    expect(res.body.equipment_groups).toEqual([['Barbell'], ['Bench']]);
    expect(res.body.equipment).toBe('Barbell + Bench');
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
    // Patch semantics: equipment_groups survives a PUT that doesn't mention it
    // (decision #28 — equipment is a grouped JSON string[][] column).
    expect(res.body.equipment_groups).toEqual([['Barbell'], ['Bench']]);
    expect(res.body.equipment).toBe('Barbell + Bench');

    const list = await request(ctx.app).get('/api/exercises');
    expect(list.body.length).toBe(3); // still 3, not duplicated
  });

  it('PUT with new equipment_groups replaces the old value entirely', async () => {
    const res = await request(ctx.app).put(`/api/exercises/${id}`).send({ equipment_groups: [['Dumbbell']] });
    expect(res.status).toBe(200);
    expect(res.body.equipment_groups).toEqual([['Dumbbell']]);
    expect(res.body.equipment).toBe('Dumbbell');

    // Restore for subsequent tests in this file.
    await request(ctx.app).put(`/api/exercises/${id}`).send({ equipment_groups: [['Barbell'], ['Bench']] });
  });

  it('a name-only PUT does not wipe equipment_groups', async () => {
    const res = await request(ctx.app).put(`/api/exercises/${id}`).send({ name: 'Barbell Bench Press (Flat)' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Barbell Bench Press (Flat)');
    expect(res.body.equipment_groups).toEqual([['Barbell'], ['Bench']]);

    // Restore the name for subsequent tests in this file.
    await request(ctx.app).put(`/api/exercises/${id}`).send({ name: 'Barbell Bench Press' });
  });

  it('round-trips video_url through create and edit (unverified demo link)', async () => {
    const created = await request(ctx.app).post('/api/exercises').send({
      name: 'Incline Dumbbell Press',
      category: 'Push',
      video_url: '  https://www.youtube.com/watch?v=abc123  ',
    });
    expect(created.status).toBe(201);
    expect(created.body.video_url).toBe('https://www.youtube.com/watch?v=abc123');

    const fetched = await request(ctx.app).get(`/api/exercises/${created.body.id}`);
    expect(fetched.body.video_url).toBe('https://www.youtube.com/watch?v=abc123');

    // A non-http(s) value is dropped to null rather than stored as garbage.
    const updated = await request(ctx.app)
      .put(`/api/exercises/${created.body.id}`)
      .send({ video_url: 'not a real url' });
    expect(updated.status).toBe(200);
    expect(updated.body.video_url).toBeNull();

    // Omitting video_url on a PUT preserves the existing value (patch semantics).
    await request(ctx.app).put(`/api/exercises/${created.body.id}`).send({ video_url: 'https://youtu.be/xyz' });
    const patched = await request(ctx.app).put(`/api/exercises/${created.body.id}`).send({ difficulty: 'Advanced' });
    expect(patched.body.video_url).toBe('https://youtu.be/xyz');

    await request(ctx.app).delete(`/api/exercises/${created.body.id}`);
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
