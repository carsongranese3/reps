// QA edge-case coverage for the Gym section (decision #17). Complements
// gyms.test.js: focuses on the failure/messy states the spec calls out —
// PUT-to-blank-name, equipment cleaning through the REAL API, and SQL-injection
// safety on the ?q= filter.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { freshApp } from './testApp.js';

let ctx;

beforeAll(async () => {
  ctx = await freshApp('gyms-edge');
});

afterAll(() => {
  ctx.cleanup();
});

describe('Gym PUT name validation', () => {
  it('400s when a PUT would blank out the name (whitespace-only)', async () => {
    const created = await request(ctx.app).post('/api/gyms').send({ name: 'Keeper', equipment: ['Barbell'] });
    expect(created.status).toBe(201);
    const id = created.body.id;

    const res = await request(ctx.app).put(`/api/gyms/${id}`).send({ name: '   ' });
    expect(res.status).toBe(400);

    // The row is untouched by the rejected patch.
    const after = await request(ctx.app).get(`/api/gyms/${id}`);
    expect(after.body.name).toBe('Keeper');
    expect(after.body.equipment).toEqual(['Barbell']);
  });

  it('400s when a PUT sends an empty-string name', async () => {
    const created = await request(ctx.app).post('/api/gyms').send({ name: 'Keeper2' });
    const id = created.body.id;
    const res = await request(ctx.app).put(`/api/gyms/${id}`).send({ name: '' });
    expect(res.status).toBe(400);
  });
});

describe('Gym equipment cleaning through the real API', () => {
  it('trims, dedupes, and drops non-string/blank garbage on POST', async () => {
    const messy = [
      '  Dumbbells  ', // trimmed
      'Dumbbells', // dedupe (post-trim)
      'Barbell',
      '', // blank dropped
      '   ', // whitespace dropped
      42, // non-string dropped
      null, // dropped
      { name: 'Rack' }, // object dropped
      ['nested'], // array dropped
      'Barbell', // dedupe
      'Kettlebells',
    ];
    const res = await request(ctx.app).post('/api/gyms').send({ name: 'Messy Gym', equipment: messy });
    expect(res.status).toBe(201);
    expect(res.body.equipment).toEqual(['Dumbbells', 'Barbell', 'Kettlebells']);

    // Round-trips identically from storage on GET.
    const got = await request(ctx.app).get(`/api/gyms/${res.body.id}`);
    expect(got.body.equipment).toEqual(['Dumbbells', 'Barbell', 'Kettlebells']);
  });

  it('cleans equipment the same way on PUT', async () => {
    const created = await request(ctx.app).post('/api/gyms').send({ name: 'PutClean' });
    const id = created.body.id;
    const res = await request(ctx.app)
      .put(`/api/gyms/${id}`)
      .send({ equipment: ['  Bench  ', 'Bench', 7, '', 'Cable'] });
    expect(res.status).toBe(200);
    expect(res.body.equipment).toEqual(['Bench', 'Cable']);
  });
});

describe('Gym ?q= is injection-safe (bound params)', () => {
  it('treats a classic SQLi payload as a literal substring, not SQL', async () => {
    // Seed two gyms so a successful injection would leak both.
    await request(ctx.app).post('/api/gyms').send({ name: 'Alpha Fitness' });
    await request(ctx.app).post('/api/gyms').send({ name: 'Beta Fitness' });

    const res = await request(ctx.app).get(`/api/gyms?q=${encodeURIComponent("' OR 1=1--")}`);
    expect(res.status).toBe(200);
    // A literal match on that string matches no gym name -> empty result.
    // If the payload had been interpolated into SQL, it would return ALL rows.
    expect(res.body).toEqual([]);
  });

  it('still filters correctly for a normal query after the injection attempt', async () => {
    const res = await request(ctx.app).get('/api/gyms?q=alpha');
    expect(res.body.every((g) => g.name.toLowerCase().includes('alpha'))).toBe(true);
    expect(res.body.some((g) => g.name === 'Alpha Fitness')).toBe(true);
  });
});
