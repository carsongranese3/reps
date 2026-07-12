// Test helper: spins up an isolated Express app + SQLite DB per test file.
// Relies on vitest's default per-file module isolation (a fresh module
// registry per test file) so that setting REPS_DB_PATH/REPS_MEDIA_DIR before
// dynamically importing db.js/index.js gives each file its own scratch DB —
// call this ONCE per test file (e.g. in a top-level beforeAll).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export async function freshApp(name) {
  const id = `${name}-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const dbPath = path.join(os.tmpdir(), `reps-test-${id}.db`);
  const mediaDir = path.join(os.tmpdir(), `reps-test-${id}-media`);

  process.env.REPS_DB_PATH = dbPath;
  process.env.REPS_MEDIA_DIR = mediaDir;

  const dbMod = await import('../db.js');
  const appMod = await import('../index.js');

  function cleanup() {
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
  }

  return { app: appMod.default, db: dbMod.db, cleanup, dbPath, mediaDir };
}
