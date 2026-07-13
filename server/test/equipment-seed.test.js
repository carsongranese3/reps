// Verifies server/seed.js seeds the 18 COMMON_EQUIPMENT items idempotently —
// re-running seed() must never duplicate rows (mirrors the exercises/workouts/
// gyms upsert-by-name pattern already covered informally elsewhere).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let dbPath;
let mediaDir;
let dbMod;
let seedMod;

beforeAll(async () => {
  const id = `equipment-seed-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  dbPath = path.join(os.tmpdir(), `reps-test-${id}.db`);
  mediaDir = path.join(os.tmpdir(), `reps-test-${id}-media`);
  process.env.REPS_DB_PATH = dbPath;
  process.env.REPS_MEDIA_DIR = mediaDir;

  dbMod = await import('../db.js');
  seedMod = await import('../seed.js');
});

afterAll(() => {
  try {
    dbMod.db.close();
  } catch {
    /* ignore */
  }
  for (const f of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    try {
      fs.unlinkSync(f);
    } catch {
      /* ignore */
    }
  }
  try {
    fs.rmSync(mediaDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

describe('Equipment seed idempotency', () => {
  it('seeds exactly 18 equipment rows', () => {
    seedMod.seed();
    const count = dbMod.db.prepare('SELECT COUNT(*) as c FROM equipment').get().c;
    expect(count).toBe(18);
  });

  it('re-running seed() does not duplicate equipment rows', () => {
    seedMod.seed();
    seedMod.seed();
    const count = dbMod.db.prepare('SELECT COUNT(*) as c FROM equipment').get().c;
    expect(count).toBe(18);
  });

  it('includes the expected named items', () => {
    const names = dbMod.db.prepare('SELECT name FROM equipment ORDER BY name').all().map((r) => r.name);
    for (const expected of ['Barbell', 'Dumbbells', 'Kettlebells', 'Battle ropes', 'Medicine ball']) {
      expect(names).toContain(expected);
    }
  });

  it('gives "Adjustable bench" a default substitutes of ["Bench"], others default to []', () => {
    const bench = dbMod.db.prepare('SELECT substitutes FROM equipment WHERE name = ?').get('Adjustable bench');
    expect(JSON.parse(bench.substitutes)).toEqual(['Bench']);

    const barbell = dbMod.db.prepare('SELECT substitutes FROM equipment WHERE name = ?').get('Barbell');
    expect(JSON.parse(barbell.substitutes)).toEqual([]);
  });
});

describe('Equipment substitutes backfill (decision #24, idempotent)', () => {
  it('re-seeding does not clobber a non-empty substitutes list the user set themselves', () => {
    dbMod.db
      .prepare('UPDATE equipment SET substitutes = ? WHERE name = ?')
      .run(JSON.stringify(['Squat rack']), 'Adjustable bench');

    seedMod.seed();

    const row = dbMod.db.prepare('SELECT substitutes FROM equipment WHERE name = ?').get('Adjustable bench');
    expect(JSON.parse(row.substitutes)).toEqual(['Squat rack']);
  });

  it('backfills the default onto an existing "Adjustable bench" row whose substitutes are empty', () => {
    dbMod.db.prepare('UPDATE equipment SET substitutes = ? WHERE name = ?').run('[]', 'Adjustable bench');

    seedMod.seed();

    const row = dbMod.db.prepare('SELECT substitutes FROM equipment WHERE name = ?').get('Adjustable bench');
    expect(JSON.parse(row.substitutes)).toEqual(['Bench']);
  });
});
