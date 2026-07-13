import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { freshApp } from './testApp.js';

let ctx;

beforeAll(async () => {
  ctx = await freshApp('equipment');
});

afterAll(() => {
  ctx.cleanup();
});

describe('Equipment validation', () => {
  it('rejects equipment with no name', async () => {
    const res = await request(ctx.app).post('/api/equipment').send({});
    expect(res.status).toBe(400);
  });

  it('rejects equipment with a blank/whitespace-only name', async () => {
    const res = await request(ctx.app).post('/api/equipment').send({ name: '   ' });
    expect(res.status).toBe(400);
  });
});

describe('Equipment CRUD', () => {
  let id;

  it('creates an equipment item', async () => {
    const res = await request(ctx.app).post('/api/equipment').send({ name: '  Foam Roller  ' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Foam Roller');
    expect(res.body.id).toBeTruthy();
    expect(res.body.created_at).toBeTruthy();
    expect(res.body.updated_at).toBeTruthy();
    id = res.body.id;
  });

  it('gets an equipment item by id', async () => {
    const res = await request(ctx.app).get(`/api/equipment/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Foam Roller');
  });

  it('lists equipment ordered by name ascending', async () => {
    await request(ctx.app).post('/api/equipment').send({ name: 'Ab Wheel' });
    const res = await request(ctx.app).get('/api/equipment');
    expect(res.status).toBe(200);
    const names = res.body.map((e) => e.name);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
    expect(res.body.some((e) => e.id === id)).toBe(true);
  });

  it('updates equipment in place (same id, no duplicate)', async () => {
    const res = await request(ctx.app).put(`/api/equipment/${id}`).send({ name: 'Foam Roller Pro' });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(id);
    expect(res.body.name).toBe('Foam Roller Pro');

    const list = await request(ctx.app).get('/api/equipment');
    expect(list.body.filter((e) => e.id === id).length).toBe(1);
  });

  it('a PUT with no name field is a no-op patch (keeps existing name)', async () => {
    const res = await request(ctx.app).put(`/api/equipment/${id}`).send({});
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Foam Roller Pro');
  });

  it('filters by q', async () => {
    const res = await request(ctx.app).get('/api/equipment?q=foam');
    expect(res.body.some((e) => e.id === id)).toBe(true);
    expect(res.body.every((e) => e.name.toLowerCase().includes('foam'))).toBe(true);
  });

  it('404s for get/put/delete on an unknown equipment id', async () => {
    expect((await request(ctx.app).get('/api/equipment/nope')).status).toBe(404);
    expect((await request(ctx.app).put('/api/equipment/nope').send({ name: 'x' })).status).toBe(404);
    expect((await request(ctx.app).delete('/api/equipment/nope')).status).toBe(404);
  });

  it('deletes an equipment item', async () => {
    const res = await request(ctx.app).delete(`/api/equipment/${id}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: true, id });
    const after = await request(ctx.app).get(`/api/equipment/${id}`);
    expect(after.status).toBe(404);
  });
});

describe('Equipment substitutes ("also counts as" — decision #24)', () => {
  let id;

  it('creates an equipment item with substitutes, cleaned/deduped', async () => {
    const res = await request(ctx.app)
      .post('/api/equipment')
      .send({ name: 'Adjustable bench 2', substitutes: ['  Bench  ', 'Bench', '', '  '] });
    expect(res.status).toBe(201);
    expect(res.body.substitutes).toEqual(['Bench']);
    id = res.body.id;
  });

  it('defaults substitutes to [] when omitted', async () => {
    const res = await request(ctx.app).post('/api/equipment').send({ name: 'Kettlebell 2' });
    expect(res.status).toBe(201);
    expect(res.body.substitutes).toEqual([]);
  });

  it('gets an equipment item with its substitutes intact', async () => {
    const res = await request(ctx.app).get(`/api/equipment/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.substitutes).toEqual(['Bench']);
  });

  it('lists equipment with substitutes surfaced', async () => {
    const res = await request(ctx.app).get('/api/equipment');
    const row = res.body.find((e) => e.id === id);
    expect(row.substitutes).toEqual(['Bench']);
  });

  it('a PUT that omits substitutes preserves them (patch semantics)', async () => {
    const res = await request(ctx.app).put(`/api/equipment/${id}`).send({ name: 'Adjustable bench 2 renamed' });
    expect(res.status).toBe(200);
    expect(res.body.substitutes).toEqual(['Bench']);
  });

  it('a PUT with substitutes replaces the prior list', async () => {
    const res = await request(ctx.app)
      .put(`/api/equipment/${id}`)
      .send({ substitutes: ['Bench', 'Squat rack'] });
    expect(res.status).toBe(200);
    expect(res.body.substitutes).toEqual(['Bench', 'Squat rack']);
  });

  it('a PUT with substitutes: [] clears the list', async () => {
    const res = await request(ctx.app).put(`/api/equipment/${id}`).send({ substitutes: [] });
    expect(res.status).toBe(200);
    expect(res.body.substitutes).toEqual([]);
  });

  it('cleans/dedupes on PUT the same way as create', async () => {
    const res = await request(ctx.app)
      .put(`/api/equipment/${id}`)
      .send({ substitutes: ['Bench', ' bench-ish ', 'Bench', 42, null] });
    expect(res.status).toBe(200);
    // non-strings are dropped, strings trimmed, exact dupes removed (case-sensitive,
    // mirrors gym equipment's stringArrayStrict/dedupeStrings behavior).
    expect(res.body.substitutes).toEqual(['Bench', 'bench-ish']);
  });
});

describe('Equipment duplicate-name rejection (case-insensitive)', () => {
  it('400s creating a second item with the same name', async () => {
    const first = await request(ctx.app).post('/api/equipment').send({ name: 'Chalk' });
    expect(first.status).toBe(201);

    const dup = await request(ctx.app).post('/api/equipment').send({ name: 'Chalk' });
    expect(dup.status).toBe(400);

    // A differently-cased duplicate is rejected too.
    const dupCI = await request(ctx.app).post('/api/equipment').send({ name: 'CHALK' });
    expect(dupCI.status).toBe(400);

    // Only the original row exists.
    const list = await request(ctx.app).get('/api/equipment?q=chalk');
    expect(list.body.length).toBe(1);
  });

  it('400s renaming (PUT) an item to collide with another existing name', async () => {
    const a = await request(ctx.app).post('/api/equipment').send({ name: 'Sled' });
    const b = await request(ctx.app).post('/api/equipment').send({ name: 'Prowler' });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);

    const res = await request(ctx.app).put(`/api/equipment/${b.body.id}`).send({ name: 'sled' });
    expect(res.status).toBe(400);

    // b is untouched.
    const after = await request(ctx.app).get(`/api/equipment/${b.body.id}`);
    expect(after.body.name).toBe('Prowler');
  });

  it('allows a PUT that keeps an item at its own (unchanged) name', async () => {
    const created = await request(ctx.app).post('/api/equipment').send({ name: 'Slam Ball' });
    const id2 = created.body.id;
    const res = await request(ctx.app).put(`/api/equipment/${id2}`).send({ name: 'Slam Ball' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Slam Ball');
  });
});
