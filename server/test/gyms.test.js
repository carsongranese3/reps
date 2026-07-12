import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { freshApp } from './testApp.js';

let ctx;

beforeAll(async () => {
  ctx = await freshApp('gyms');
});

afterAll(() => {
  ctx.cleanup();
});

describe('Gym validation', () => {
  it('rejects a gym with no name', async () => {
    const res = await request(ctx.app).post('/api/gyms').send({ equipment: ['Barbell'] });
    expect(res.status).toBe(400);
  });

  it('rejects a gym with a blank/whitespace-only name', async () => {
    const res = await request(ctx.app).post('/api/gyms').send({ name: '   ' });
    expect(res.status).toBe(400);
  });
});

describe('Gym CRUD', () => {
  let id;

  it('creates a gym', async () => {
    const res = await request(ctx.app)
      .post('/api/gyms')
      .send({ name: '  Home Gym  ', equipment: ['Dumbbells', 'Kettlebells'] });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Home Gym');
    expect(res.body.equipment).toEqual(['Dumbbells', 'Kettlebells']);
    expect(res.body.favorite).toBe(false);
    expect(res.body.id).toBeTruthy();
    expect(res.body.created_at).toBeTruthy();
    expect(res.body.updated_at).toBeTruthy();
    id = res.body.id;
  });

  it('gets a gym by id', async () => {
    const res = await request(ctx.app).get(`/api/gyms/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Home Gym');
  });

  it('lists gyms', async () => {
    const res = await request(ctx.app).get('/api/gyms');
    expect(res.status).toBe(200);
    expect(res.body.some((g) => g.id === id)).toBe(true);
  });

  it('updates a gym in place (same id, no duplicate)', async () => {
    const res = await request(ctx.app)
      .put(`/api/gyms/${id}`)
      .send({ name: 'Home Gym V2', equipment: ['Dumbbells', 'Pull-up bar'] });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(id);
    expect(res.body.name).toBe('Home Gym V2');
    expect(res.body.equipment).toEqual(['Dumbbells', 'Pull-up bar']);

    const list = await request(ctx.app).get('/api/gyms');
    expect(list.body.filter((g) => g.id === id).length).toBe(1);
  });

  it('toggles favorite via a partial PUT without needing the full payload', async () => {
    const res = await request(ctx.app).put(`/api/gyms/${id}`).send({ favorite: true });
    expect(res.status).toBe(200);
    expect(res.body.favorite).toBe(true);
    expect(res.body.name).toBe('Home Gym V2'); // untouched by the partial update
    expect(res.body.equipment).toEqual(['Dumbbells', 'Pull-up bar']); // untouched
  });

  it('filters by favorite and q', async () => {
    await request(ctx.app).post('/api/gyms').send({ name: 'Commercial Gym', equipment: ['Barbell'] });

    const byFavorite = await request(ctx.app).get('/api/gyms?favorite=1');
    expect(byFavorite.body.some((g) => g.id === id)).toBe(true);
    expect(byFavorite.body.every((g) => g.favorite)).toBe(true);

    const byQ = await request(ctx.app).get('/api/gyms?q=commercial');
    expect(byQ.body.some((g) => g.name === 'Commercial Gym')).toBe(true);
    expect(byQ.body.every((g) => g.name.toLowerCase().includes('commercial'))).toBe(true);
  });

  it('404s for get/put/delete on an unknown gym id', async () => {
    expect((await request(ctx.app).get('/api/gyms/nope')).status).toBe(404);
    expect((await request(ctx.app).put('/api/gyms/nope').send({ name: 'x' })).status).toBe(404);
    expect((await request(ctx.app).delete('/api/gyms/nope')).status).toBe(404);
  });

  it('deletes a gym', async () => {
    const res = await request(ctx.app).delete(`/api/gyms/${id}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: true, id });
    const after = await request(ctx.app).get(`/api/gyms/${id}`);
    expect(after.status).toBe(404);
  });
});
