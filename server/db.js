// server/db.js — schema + idempotent migrations for Reps.
// Single-file SQLite via better-sqlite3, WAL mode, no ORM (plain prepared statements
// live in index.js). This file only owns table shape + boot-time migration.

import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Allow overriding the DB path (used by the test suite to point at a scratch file).
export const DB_PATH = process.env.REPS_DB_PATH
  ? path.resolve(process.env.REPS_DB_PATH)
  : path.join(__dirname, 'reps.db');

export const MEDIA_DIR = process.env.REPS_MEDIA_DIR
  ? path.resolve(process.env.REPS_MEDIA_DIR)
  : path.join(__dirname, 'media');

export const DRAFTS_DIR = path.join(MEDIA_DIR, 'drafts');

fs.mkdirSync(MEDIA_DIR, { recursive: true });
fs.mkdirSync(DRAFTS_DIR, { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
// We do NOT enforce SQLite FK constraints — cascades/nulling are handled explicitly
// in index.js (e.g. deleting a workout nulls plan rows but never touches sessions,
// since sessions intentionally have no hard FK so history survives deletion).
db.pragma('foreign_keys = OFF');

// ---------------------------------------------------------------------------
// Table definitions. Scalar columns are plain SQLite types; JSON columns are
// TEXT holding a JSON.stringify'd array/object (see index.js normalizeBody /
// rowTo* for the serialization boundary — this file never parses JSON).
// ---------------------------------------------------------------------------

const TABLES = {
  exercises: {
    ddl: `
      CREATE TABLE IF NOT EXISTS exercises (
        id             TEXT PRIMARY KEY,
        name           TEXT NOT NULL,
        category       TEXT,
        equipment      TEXT,
        difficulty     TEXT,
        demo_file      TEXT,
        image          TEXT,
        source_url     TEXT,
        video_url      TEXT,
        muscles_worked TEXT NOT NULL DEFAULT '[]',
        how_to         TEXT NOT NULL DEFAULT '[]',
        step_times     TEXT NOT NULL DEFAULT '[]',
        tags           TEXT NOT NULL DEFAULT '[]',
        created_at     TEXT NOT NULL,
        updated_at     TEXT NOT NULL
      )
    `,
    // columns expected to exist; used by the idempotent ALTER-TABLE migration
    columns: {
      id: 'TEXT',
      name: 'TEXT',
      category: 'TEXT',
      equipment: 'TEXT',
      difficulty: 'TEXT',
      demo_file: 'TEXT',
      image: 'TEXT',
      source_url: 'TEXT',
      video_url: 'TEXT',
      muscles_worked: "TEXT NOT NULL DEFAULT '[]'",
      how_to: "TEXT NOT NULL DEFAULT '[]'",
      step_times: "TEXT NOT NULL DEFAULT '[]'",
      tags: "TEXT NOT NULL DEFAULT '[]'",
      created_at: 'TEXT',
      updated_at: 'TEXT',
    },
  },
  workouts: {
    ddl: `
      CREATE TABLE IF NOT EXISTS workouts (
        id           TEXT PRIMARY KEY,
        title        TEXT NOT NULL,
        type         TEXT NOT NULL DEFAULT 'Strength',
        category     TEXT NOT NULL DEFAULT 'Strength',
        favorite     INTEGER NOT NULL DEFAULT 0,
        est_minutes  INTEGER NOT NULL DEFAULT 0,
        image        TEXT,
        exercises    TEXT NOT NULL DEFAULT '[]',
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL
      )
    `,
    columns: {
      id: 'TEXT',
      title: 'TEXT',
      type: "TEXT NOT NULL DEFAULT 'Strength'",
      category: "TEXT NOT NULL DEFAULT 'Strength'",
      favorite: 'INTEGER NOT NULL DEFAULT 0',
      est_minutes: 'INTEGER NOT NULL DEFAULT 0',
      image: 'TEXT',
      exercises: "TEXT NOT NULL DEFAULT '[]'",
      created_at: 'TEXT',
      updated_at: 'TEXT',
    },
  },
  plan: {
    // Fixed Mon-Sun weekly template. One row per weekday; workout_id nullable = Rest.
    ddl: `
      CREATE TABLE IF NOT EXISTS plan (
        day        TEXT PRIMARY KEY,
        workout_id TEXT
      )
    `,
    columns: {
      day: 'TEXT',
      workout_id: 'TEXT',
    },
  },
  sessions: {
    // Completed sessions only (decision #5). No hard FK to workouts — snapshot
    // fields (workout_title/workout_category) keep orphaned rows renderable.
    ddl: `
      CREATE TABLE IF NOT EXISTS sessions (
        id               TEXT PRIMARY KEY,
        workout_id       TEXT,
        workout_title    TEXT NOT NULL,
        workout_category TEXT,
        date             TEXT NOT NULL,
        duration_sec     INTEGER NOT NULL DEFAULT 0,
        total_sets       INTEGER NOT NULL DEFAULT 0,
        total_volume     REAL NOT NULL DEFAULT 0,
        distance_km      REAL,
        entries          TEXT NOT NULL DEFAULT '[]',
        prs              TEXT NOT NULL DEFAULT '[]',
        created_at       TEXT NOT NULL
      )
    `,
    columns: {
      id: 'TEXT',
      workout_id: 'TEXT',
      workout_title: 'TEXT',
      workout_category: 'TEXT',
      date: 'TEXT',
      duration_sec: 'INTEGER NOT NULL DEFAULT 0',
      total_sets: 'INTEGER NOT NULL DEFAULT 0',
      total_volume: 'REAL NOT NULL DEFAULT 0',
      distance_km: 'REAL',
      entries: "TEXT NOT NULL DEFAULT '[]'",
      prs: "TEXT NOT NULL DEFAULT '[]'",
      created_at: 'TEXT',
    },
  },
  gyms: {
    // A reference library of places + their equipment (decision #17). Storage/
    // display only for now — no relation to workouts/exercises.
    ddl: `
      CREATE TABLE IF NOT EXISTS gyms (
        id         TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        favorite   INTEGER NOT NULL DEFAULT 0,
        image      TEXT,
        equipment  TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `,
    columns: {
      id: 'TEXT',
      name: 'TEXT',
      favorite: 'INTEGER NOT NULL DEFAULT 0',
      image: 'TEXT',
      equipment: "TEXT NOT NULL DEFAULT '[]'",
      created_at: 'TEXT',
      updated_at: 'TEXT',
    },
  },
};

function ensureTable(name, def) {
  db.exec(def.ddl);
  // Idempotent boot migration: add any missing columns to an existing table.
  const existing = new Set(db.prepare(`PRAGMA table_info(${name})`).all().map((c) => c.name));
  for (const [col, type] of Object.entries(def.columns)) {
    if (!existing.has(col)) {
      db.exec(`ALTER TABLE ${name} ADD COLUMN ${col} ${type}`);
    }
  }
}

export function migrate() {
  for (const [name, def] of Object.entries(TABLES)) {
    ensureTable(name, def);
  }

  // Indexes (safe to (re)create every boot).
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_exercises_name ON exercises(name);
    CREATE INDEX IF NOT EXISTS idx_exercises_category ON exercises(category);
    CREATE INDEX IF NOT EXISTS idx_workouts_category ON workouts(category);
    CREATE INDEX IF NOT EXISTS idx_workouts_favorite ON workouts(favorite);
    CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions(date);
    CREATE INDEX IF NOT EXISTS idx_sessions_workout_id ON sessions(workout_id);
    CREATE INDEX IF NOT EXISTS idx_gyms_favorite ON gyms(favorite);
  `);

  // Seed the fixed Mon..Sun plan rows if they don't exist yet (day is the PK).
  const insertDay = db.prepare('INSERT OR IGNORE INTO plan (day, workout_id) VALUES (?, NULL)');
  for (const day of ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']) {
    insertDay.run(day);
  }
}

export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
