// QA verification for decision #23 (Equipment managed entity). Covers the gaps not
// already exercised by equipment.test.js / equipment-seed.test.js:
//  - DELETE has NO cascade: exercises/gyms that stored the equipment *string* are
//    left completely untouched (the entity is a suggestion source, not a FK).
//  - the seeded list surfaces via GET /api/equipment as 18 items, name-ascending.
//  - light injection pass: a SQL-ish ?q value is treated as a literal, never executed.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { freshApp } from './testApp.js';

let ctx;

beforeAll(async () => {
  ctx = await freshApp('equipment-qa');
});

afterAll(() => {
  ctx.cleanup();
});

describe('Equipment DELETE has no cascade onto exercises/gyms (decision #23)', () => {
  it('deleting an equipment row leaves an exercise/gym that stored that string intact', async () => {
    // Create an equipment row whose name matches strings we store elsewhere.
    const eq = await request(ctx.app).post('/api/equipment').send({ name: 'Barbell' });
    expect(eq.status).toBe(201);

    // An exercise that stores the equipment as a free string.
    const ex = await request(ctx.app)
      .post('/api/exercises')
      .send({ name: 'Bench Press', equipment: 'Barbell' });
    expect(ex.status).toBe(201);

    // A gym whose equipment[] string list includes the same name.
    const gym = await request(ctx.app)
      .post('/api/gyms')
      .send({ name: 'Iron Temple', equipment: ['Barbell', 'Dumbbells'] });
    expect(gym.status).toBe(201);

    // Delete the managed equipment row.
    const del = await request(ctx.app).delete(`/api/equipment/${eq.body.id}`);
    expect(del.status).toBe(200);
    expect(del.body).toEqual({ deleted: true, id: eq.body.id });

    // Exercise string is unchanged.
    const exAfter = await request(ctx.app).get(`/api/exercises/${ex.body.id}`);
    expect(exAfter.status).toBe(200);
    expect(exAfter.body.equipment).toBe('Barbell');

    // Gym equipment[] is unchanged.
    const gymAfter = await request(ctx.app).get(`/api/gyms/${gym.body.id}`);
    expect(gymAfter.status).toBe(200);
    expect(gymAfter.body.equipment).toEqual(['Barbell', 'Dumbbells']);
  });
});

describe('Equipment seed surfaces through the API', () => {
  it('GET /api/equipment returns the 18 seeded items, name-ascending', async () => {
    // freshApp starts empty; seed against the same db module instance.
    const seedMod = await import('../seed.js');
    seedMod.seed();

    const res = await request(ctx.app).get('/api/equipment');
    expect(res.status).toBe(200);
    // 18 seeded + any rows created earlier in this file (Barbell was deleted; the
    // exercise/gym rows are not equipment). Assert the 18 canonical names are present.
    const names = res.body.map((e) => e.name);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
    for (const expected of [
      'Barbell', 'Dumbbells', 'Kettlebells', 'Cable machine', 'Squat rack',
      'Bench', 'Adjustable bench', 'Smith machine', 'Leg press', 'Leg curl machine',
      'Treadmill', 'Rowing machine', 'Elliptical', 'Pull-up bar', 'Dip station',
      'Resistance bands', 'Medicine ball', 'Battle ropes',
    ]) {
      expect(names).toContain(expected);
    }
  });
});

describe('Equipment ?q injection safety (prepared statements)', () => {
  it("treats a SQL-injection-ish ?q as a literal substring, never executing it", async () => {
    const res = await request(ctx.app).get(`/api/equipment?q=${encodeURIComponent("' OR 1=1--")}`);
    expect(res.status).toBe(200);
    // The literal never matches any equipment name -> empty result (NOT the whole
    // table, which is what a successful injection would return).
    expect(res.body).toEqual([]);

    // And the table is still intact afterwards (nothing dropped/mutated).
    const all = await request(ctx.app).get('/api/equipment');
    expect(all.body.length).toBeGreaterThanOrEqual(18);
  });

  it("a raw '%' in ?q acts as a LIKE wildcard (unescaped) — documented, harmless", async () => {
    // LIKE special chars (% / _) are NOT escaped before being bound into the '%...%'
    // pattern, so ?q=% matches every row. This is *safe* (still fully parameterized —
    // no SQL is executed), and it's the identical pre-existing behavior on the
    // exercises/gyms ?q endpoints — a cosmetic search quirk, not an injection.
    const res = await request(ctx.app).get(`/api/equipment?q=${encodeURIComponent('%')}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(18);
  });
});
