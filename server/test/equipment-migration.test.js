// Verifies the boot data migration (decision #28, reverses #26) that upgrades
// exercises.equipment to a grouped string[][] (AND-of-ORs), from ANY prior shape:
//   - a legacy bare scalar ("Barbell")        -> [["Barbell"]]
//   - decision #26's flat string[]            -> each item its own required group,
//                                                 e.g. ["Barbell","Bench"] -> [["Barbell"],["Bench"]]
//   - an already-grouped string[][]           -> left untouched (idempotent)
// The idempotent ADD-COLUMN migration in db.js never transforms existing values,
// so this exercises the separate one-time data migration in migrate().
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

let dbPath;
let mediaDir;
let dbMod;

beforeAll(async () => {
  const id = `equipment-migration-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  dbPath = path.join(os.tmpdir(), `reps-test-${id}.db`);
  mediaDir = path.join(os.tmpdir(), `reps-test-${id}-media`);
  process.env.REPS_DB_PATH = dbPath;
  process.env.REPS_MEDIA_DIR = mediaDir;

  dbMod = await import('../db.js');
  // migrate() already ran once as a module-level side effect isn't guaranteed —
  // db.js only opens the connection at import time; index.js/seed.js call
  // migrate() explicitly. Call it here directly to drive the scenario.
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

function insertRawExercise(db, { id, name, equipment }) {
  const ts = new Date().toISOString();
  db.prepare(
    `INSERT INTO exercises (id, name, category, equipment, difficulty, muscles_worked, how_to, step_times, tags, created_at, updated_at)
     VALUES (?, ?, NULL, ?, NULL, '[]', '[]', '[]', '[]', ?, ?)`
  ).run(id, name, equipment, ts, ts);
}

describe('Boot migration: any prior equipment shape -> grouped string[][] (decision #28)', () => {
  it('upgrades a legacy bare scalar row to [["Barbell"]] on migrate()', () => {
    dbMod.migrate();
    const id = crypto.randomUUID();
    insertRawExercise(dbMod.db, { id, name: 'Legacy Barbell Row', equipment: 'Barbell' });

    dbMod.migrate();

    const row = dbMod.db.prepare('SELECT equipment FROM exercises WHERE id = ?').get(id);
    expect(JSON.parse(row.equipment)).toEqual([['Barbell']]);
  });

  it('upgrades legacy "Bodyweight"/"None"/blank/null scalars to []', () => {
    const cases = [
      ['Legacy Bodyweight A', 'Bodyweight'],
      ['Legacy Bodyweight B', 'None'],
      ['Legacy Bodyweight C', ''],
      ['Legacy Bodyweight D', null],
    ];
    const ids = cases.map(([name, equipment]) => {
      const id = crypto.randomUUID();
      insertRawExercise(dbMod.db, { id, name, equipment });
      return id;
    });

    dbMod.migrate();

    for (const id of ids) {
      const row = dbMod.db.prepare('SELECT equipment FROM exercises WHERE id = ?').get(id);
      expect(JSON.parse(row.equipment)).toEqual([]);
    }
  });

  it('upgrades a decision #26 flat string[] row to per-item single groups, preserving order', () => {
    const id = crypto.randomUUID();
    insertRawExercise(dbMod.db, {
      id,
      name: 'Flat Bench Press',
      equipment: JSON.stringify(['Barbell', 'Bench']),
    });

    dbMod.migrate();

    const row = dbMod.db.prepare('SELECT equipment FROM exercises WHERE id = ?').get(id);
    expect(JSON.parse(row.equipment)).toEqual([['Barbell'], ['Bench']]);
  });

  it('leaves an already-grouped string[][] row untouched (e.g. a genuine OR group)', () => {
    const id = crypto.randomUUID();
    insertRawExercise(dbMod.db, {
      id,
      name: 'Already Grouped Dips',
      equipment: JSON.stringify([['Dip Station', 'Bench']]),
    });

    dbMod.migrate();

    const row = dbMod.db.prepare('SELECT equipment FROM exercises WHERE id = ?').get(id);
    expect(JSON.parse(row.equipment)).toEqual([['Dip Station', 'Bench']]);
  });

  it('is idempotent: an already-grouped row is left untouched on re-run', () => {
    const id = crypto.randomUUID();
    insertRawExercise(dbMod.db, {
      id,
      name: 'Already Grouped Bench',
      equipment: JSON.stringify([['Barbell'], ['Bench']]),
    });

    dbMod.migrate();
    dbMod.migrate(); // run twice — must not re-wrap or otherwise mutate a grouped array

    const row = dbMod.db.prepare('SELECT equipment FROM exercises WHERE id = ?').get(id);
    expect(JSON.parse(row.equipment)).toEqual([['Barbell'], ['Bench']]);
  });

  it('leaves an already-grouped empty-array row ([]) untouched', () => {
    const id = crypto.randomUUID();
    insertRawExercise(dbMod.db, { id, name: 'Already Bodyweight', equipment: '[]' });

    dbMod.migrate();

    const row = dbMod.db.prepare('SELECT equipment FROM exercises WHERE id = ?').get(id);
    expect(JSON.parse(row.equipment)).toEqual([]);
  });
});
