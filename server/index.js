// server/index.js — Express app: routes + the read/write layer for Reps.
// Schema/migrations live in db.js; JSON<->row serialization lives in lib/serialize.js;
// derived computations (estimate, streak/week, stats, PRs, last-time) live under lib/.
// No ORM — every query below is a plain prepared statement against better-sqlite3.

import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { db, migrate, MEDIA_DIR, WEEKDAYS } from './db.js';
import { sendError, notFound } from './lib/errors.js';
import { computeEstMinutes } from './lib/estimate.js';
import {
  EXERCISE_CATEGORIES,
  WORKOUT_TYPES,
  WORKOUT_CATEGORIES,
  normalizeExerciseBody,
  rowToExercise,
  normalizeWorkoutBody,
  rowToWorkout,
  normalizeGymBody,
  rowToGym,
  normalizeEquipmentBody,
  rowToEquipment,
  normalizeSessionEntries,
  rowToSession,
  safeParseArray,
} from './lib/serialize.js';
import { computePriorBestMap, detectPRs } from './lib/pr.js';
import {
  computeWeekPayload,
  computeScheduleEntry,
  buildResolutionCtx,
  getSessionDatesSet,
  defaultTodayStr,
  isValidDateStr,
  toDateOnlyUTC,
  addDaysUTC,
  formatDateOnly,
} from './lib/week.js';
import { computeStats } from './lib/stats.js';
import { getLastTime } from './lib/lastTime.js';
import { upload, saveDraft, claimDraft, saveDirectToExercise, removeExerciseDemo, sweepStaleDrafts, streamDemo } from './lib/media.js';
import { autofillExercise, AutofillError } from './lib/gemini.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

migrate();
sweepStaleDrafts();
// Re-sweep stale drafts once a day while the process is up.
setInterval(() => sweepStaleDrafts(), 24 * 60 * 60 * 1000).unref();

const app = express();

// Single-user, no-auth personal app: reflect the request origin so the Vite dev
// server (whatever port it lands on) and same-origin production both work.
app.use(cors({ origin: true }));
app.use(express.json({ limit: '2mb' }));

function nowIso() {
  return new Date().toISOString();
}

function newId() {
  return crypto.randomUUID();
}

// ---------------------------------------------------------------------------
// Exercises
// ---------------------------------------------------------------------------

app.get('/api/exercises', (req, res) => {
  const { q, category } = req.query;
  let sql = 'SELECT * FROM exercises WHERE 1=1';
  const params = [];
  if (category) {
    sql += ' AND category = ?';
    params.push(category);
  }
  if (q) {
    sql += ' AND LOWER(name) LIKE ?';
    params.push(`%${String(q).toLowerCase()}%`);
  }
  sql += ' ORDER BY name ASC';
  const rows = db.prepare(sql).all(...params);
  res.json(rows.map(rowToExercise));
});

app.get('/api/exercises/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM exercises WHERE id = ?').get(req.params.id);
  if (!row) return notFound(res, 'Exercise');
  const exercise = rowToExercise(row);
  exercise.last_time = getLastTime(db, row.id);
  res.json(exercise);
});

app.post('/api/exercises', (req, res) => {
  const body = normalizeExerciseBody(req.body);
  if (!body.name) return sendError(res, 400, 'Name is required');
  if (body.category && !EXERCISE_CATEGORIES.includes(body.category)) {
    return sendError(res, 400, `category must be one of: ${EXERCISE_CATEGORIES.join(', ')}`);
  }

  const id = newId();
  const ts = nowIso();
  db.prepare(
    `INSERT INTO exercises
      (id, name, category, equipment, difficulty, demo_file, image, source_url, video_url, muscles_worked, how_to, step_times, tags, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    body.name,
    body.category,
    body.equipment,
    body.difficulty,
    body.image,
    body.source_url,
    body.video_url,
    JSON.stringify(body.muscles_worked),
    JSON.stringify(body.how_to),
    JSON.stringify(body.step_times),
    JSON.stringify(body.tags),
    ts,
    ts
  );

  if (req.body && req.body.draft_token) {
    const filename = claimDraft(req.body.draft_token, id);
    if (filename) {
      db.prepare('UPDATE exercises SET demo_file = ?, updated_at = ? WHERE id = ?').run(filename, nowIso(), id);
    }
  }

  const row = db.prepare('SELECT * FROM exercises WHERE id = ?').get(id);
  res.status(201).json(rowToExercise(row));
});

app.put('/api/exercises/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM exercises WHERE id = ?').get(req.params.id);
  if (!existing) return notFound(res, 'Exercise');

  const body = normalizeExerciseBody({ ...existing, ...req.body });
  if (!body.name) return sendError(res, 400, 'Name is required');
  if (body.category && !EXERCISE_CATEGORIES.includes(body.category)) {
    return sendError(res, 400, `category must be one of: ${EXERCISE_CATEGORIES.join(', ')}`);
  }

  const ts = nowIso();
  db.prepare(
    `UPDATE exercises SET
      name = ?, category = ?, equipment = ?, difficulty = ?, image = ?, source_url = ?, video_url = ?,
      muscles_worked = ?, how_to = ?, step_times = ?, tags = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    body.name,
    body.category,
    body.equipment,
    body.difficulty,
    body.image,
    body.source_url,
    body.video_url,
    JSON.stringify(body.muscles_worked),
    JSON.stringify(body.how_to),
    JSON.stringify(body.step_times),
    JSON.stringify(body.tags),
    ts,
    req.params.id
  );

  if (req.body && req.body.draft_token) {
    const filename = claimDraft(req.body.draft_token, req.params.id);
    if (filename) {
      db.prepare('UPDATE exercises SET demo_file = ?, updated_at = ? WHERE id = ?').run(filename, nowIso(), req.params.id);
    }
  }

  const row = db.prepare('SELECT * FROM exercises WHERE id = ?').get(req.params.id);
  res.json(rowToExercise(row));
});

app.delete('/api/exercises/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM exercises WHERE id = ?').get(req.params.id);
  if (!existing) return notFound(res, 'Exercise');
  db.prepare('DELETE FROM exercises WHERE id = ?').run(req.params.id);
  removeExerciseDemo(req.params.id);
  res.json({ deleted: true, id: req.params.id });
});

// AI Autofill (decision #16) — suggests fields from just a name via Google Gemini.
// Server-side only; never creates/modifies an exercise, only returns a suggestion
// for the client to review and the user to explicitly Save.
app.post('/api/exercises/autofill', async (req, res) => {
  const name = req.body && typeof req.body.name === 'string' ? req.body.name.trim() : '';
  if (!name) return sendError(res, 400, 'name is required');

  try {
    // Give Gemini the managed equipment list so it picks equipment from it.
    const equipmentOptions = db.prepare('SELECT name FROM equipment ORDER BY name').all().map((r) => r.name);
    const suggestion = await autofillExercise(name, equipmentOptions);
    res.json({ suggestion });
  } catch (err) {
    if (err instanceof AutofillError && err.code === 'missing_key') {
      return sendError(res, 501, err.message);
    }
    // Never leak upstream/network internals to the client.
    console.error('Autofill error:', err);
    return sendError(res, 502, 'Autofill is temporarily unavailable — could not get a suggestion from Gemini');
  }
});

// Draft upload — used before an exercise has an id yet (create flow).
app.post('/api/exercises/demo/draft', (req, res) => {
  upload(req, res, (err) => {
    if (err) return sendError(res, 400, err.message);
    if (!req.file) return sendError(res, 400, 'No file uploaded (expected multipart field "file")');
    const { draft_token, filename } = saveDraft(req.file);
    res.status(201).json({ draft_token, filename });
  });
});

// Direct upload onto an existing exercise (edit flow — no draft indirection needed).
app.post('/api/exercises/:id/demo', (req, res) => {
  const existing = db.prepare('SELECT * FROM exercises WHERE id = ?').get(req.params.id);
  if (!existing) return notFound(res, 'Exercise');
  upload(req, res, (err) => {
    if (err) return sendError(res, 400, err.message);
    if (!req.file) return sendError(res, 400, 'No file uploaded (expected multipart field "file")');
    const filename = saveDirectToExercise(req.file, req.params.id);
    db.prepare('UPDATE exercises SET demo_file = ?, updated_at = ? WHERE id = ?').run(filename, nowIso(), req.params.id);
    const row = db.prepare('SELECT * FROM exercises WHERE id = ?').get(req.params.id);
    res.json(rowToExercise(row));
  });
});

app.get('/api/exercises/:id/demo', (req, res) => {
  const existing = db.prepare('SELECT * FROM exercises WHERE id = ?').get(req.params.id);
  if (!existing) return notFound(res, 'Exercise');
  streamDemo(req, res, existing.demo_file);
});

// ---------------------------------------------------------------------------
// Workouts
// ---------------------------------------------------------------------------

app.get('/api/workouts', (req, res) => {
  const { q, category, favorite } = req.query;
  let sql = 'SELECT * FROM workouts WHERE 1=1';
  const params = [];
  if (category) {
    sql += ' AND category = ?';
    params.push(category);
  }
  if (favorite !== undefined) {
    sql += ' AND favorite = ?';
    params.push(favorite === '1' || favorite === 'true' ? 1 : 0);
  }
  sql += ' ORDER BY created_at ASC, rowid ASC';
  let rows = db.prepare(sql).all(...params);

  if (q) {
    const needle = String(q).toLowerCase();
    const exerciseNameById = new Map(db.prepare('SELECT id, name FROM exercises').all().map((r) => [r.id, r.name]));
    rows = rows.filter((row) => {
      if (row.title.toLowerCase().includes(needle)) return true;
      const exercises = safeParseArray(row.exercises);
      return exercises.some((e) => {
        const name = exerciseNameById.get(e.exercise_id);
        return name && name.toLowerCase().includes(needle);
      });
    });
  }

  res.json(rows.map(rowToWorkout));
});

app.get('/api/workouts/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM workouts WHERE id = ?').get(req.params.id);
  if (!row) return notFound(res, 'Workout');
  res.json(rowToWorkout(row));
});

function validateWorkout(body) {
  if (!body.title) return 'Name is required';
  if (body.type === null) return `type must be one of: ${WORKOUT_TYPES.join(', ')}`;
  if (body.category === null) return `category must be one of: ${WORKOUT_CATEGORIES.join(', ')}`;
  if (!Array.isArray(body.exercises) || body.exercises.length < 1) return 'At least one exercise is required';
  return null;
}

app.post('/api/workouts', (req, res) => {
  const body = normalizeWorkoutBody(req.body);
  const err = validateWorkout(body);
  if (err) return sendError(res, 400, err);

  const id = newId();
  const ts = nowIso();
  const est_minutes = computeEstMinutes(body.exercises);
  db.prepare(
    `INSERT INTO workouts (id, title, type, category, favorite, est_minutes, image, gym_id, exercises, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, body.title, body.type, body.category, body.favorite ? 1 : 0, est_minutes, body.image, body.gym_id, JSON.stringify(body.exercises), ts, ts);

  const row = db.prepare('SELECT * FROM workouts WHERE id = ?').get(id);
  res.status(201).json(rowToWorkout(row));
});

app.put('/api/workouts/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM workouts WHERE id = ?').get(req.params.id);
  if (!existing) return notFound(res, 'Workout');

  const body = normalizeWorkoutBody(req.body, existing);
  const err = validateWorkout(body);
  if (err) return sendError(res, 400, err);

  const ts = nowIso();
  const est_minutes = computeEstMinutes(body.exercises);
  db.prepare(
    `UPDATE workouts SET title = ?, type = ?, category = ?, favorite = ?, est_minutes = ?, image = ?, gym_id = ?, exercises = ?, updated_at = ?
     WHERE id = ?`
  ).run(body.title, body.type, body.category, body.favorite ? 1 : 0, est_minutes, body.image, body.gym_id, JSON.stringify(body.exercises), ts, req.params.id);

  const row = db.prepare('SELECT * FROM workouts WHERE id = ?').get(req.params.id);
  res.json(rowToWorkout(row));
});

app.delete('/api/workouts/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM workouts WHERE id = ?').get(req.params.id);
  if (!existing) return notFound(res, 'Workout');
  db.prepare('DELETE FROM workouts WHERE id = ?').run(req.params.id);
  // Cascade: any plan day pointing at this workout becomes Rest. Sessions keep
  // their snapshot and are intentionally left alone (no FK, orphan-safe).
  db.prepare('UPDATE plan SET workout_id = NULL WHERE workout_id = ?').run(req.params.id);
  // Cascade: schedule rows referencing this workout are DELETED (never nulled —
  // a NULL schedule row means an explicit Rest-marker, which must not be
  // auto-created). A date left with zero rows reverts to template fallback;
  // any other rows on the date are untouched (specs/schedule.md §7).
  db.prepare('DELETE FROM schedule WHERE workout_id = ?').run(req.params.id);
  res.json({ deleted: true, id: req.params.id });
});

// ---------------------------------------------------------------------------
// Gyms (decision #17) — reference library of places + their equipment.
// Storage/display only for now: no relation to workouts/exercises.
// ---------------------------------------------------------------------------

app.get('/api/gyms', (req, res) => {
  const { q, favorite } = req.query;
  let sql = 'SELECT * FROM gyms WHERE 1=1';
  const params = [];
  if (q) {
    sql += ' AND LOWER(name) LIKE ?';
    params.push(`%${String(q).toLowerCase()}%`);
  }
  if (favorite !== undefined) {
    sql += ' AND favorite = ?';
    params.push(favorite === '1' || favorite === 'true' ? 1 : 0);
  }
  sql += ' ORDER BY created_at ASC, rowid ASC';
  const rows = db.prepare(sql).all(...params);
  res.json(rows.map(rowToGym));
});

app.get('/api/gyms/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM gyms WHERE id = ?').get(req.params.id);
  if (!row) return notFound(res, 'Gym');
  res.json(rowToGym(row));
});

app.post('/api/gyms', (req, res) => {
  const body = normalizeGymBody(req.body);
  if (!body.name) return sendError(res, 400, 'Name is required');

  const id = newId();
  const ts = nowIso();
  db.prepare(
    `INSERT INTO gyms (id, name, favorite, image, equipment, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, body.name, body.favorite ? 1 : 0, body.image, JSON.stringify(body.equipment), ts, ts);

  const row = db.prepare('SELECT * FROM gyms WHERE id = ?').get(id);
  res.status(201).json(rowToGym(row));
});

app.put('/api/gyms/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM gyms WHERE id = ?').get(req.params.id);
  if (!existing) return notFound(res, 'Gym');

  const body = normalizeGymBody(req.body, existing);
  if (!body.name) return sendError(res, 400, 'Name is required');

  const ts = nowIso();
  db.prepare(
    `UPDATE gyms SET name = ?, favorite = ?, image = ?, equipment = ?, updated_at = ? WHERE id = ?`
  ).run(body.name, body.favorite ? 1 : 0, body.image, JSON.stringify(body.equipment), ts, req.params.id);

  const row = db.prepare('SELECT * FROM gyms WHERE id = ?').get(req.params.id);
  res.json(rowToGym(row));
});

app.delete('/api/gyms/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM gyms WHERE id = ?').get(req.params.id);
  if (!existing) return notFound(res, 'Gym');
  db.prepare('DELETE FROM gyms WHERE id = ?').run(req.params.id);
  res.json({ deleted: true, id: req.params.id });
});

// ---------------------------------------------------------------------------
// Equipment (decision #23) — a curated, managed master list. Exercises/gyms
// still store equipment as free strings; this table is only the suggestion
// source the client's pickers read from. Deleting a row here never touches
// exercises/gyms (no cascade, per decision #23).
// ---------------------------------------------------------------------------

// Case-insensitive duplicate check, excluding `excludeId` (used by PUT so a row
// doesn't collide with itself). Backed by the DB's own COLLATE NOCASE unique
// index (db.js) as a defense-in-depth safety net for races.
function findEquipmentByNameCI(name, excludeId = null) {
  if (excludeId) {
    return db.prepare('SELECT id FROM equipment WHERE name = ? COLLATE NOCASE AND id != ?').get(name, excludeId);
  }
  return db.prepare('SELECT id FROM equipment WHERE name = ? COLLATE NOCASE').get(name);
}

app.get('/api/equipment', (req, res) => {
  const { q } = req.query;
  let sql = 'SELECT * FROM equipment WHERE 1=1';
  const params = [];
  if (q) {
    sql += ' AND LOWER(name) LIKE ?';
    params.push(`%${String(q).toLowerCase()}%`);
  }
  sql += ' ORDER BY name ASC';
  const rows = db.prepare(sql).all(...params);
  res.json(rows.map(rowToEquipment));
});

app.get('/api/equipment/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM equipment WHERE id = ?').get(req.params.id);
  if (!row) return notFound(res, 'Equipment');
  res.json(rowToEquipment(row));
});

app.post('/api/equipment', (req, res) => {
  const body = normalizeEquipmentBody(req.body);
  if (!body.name) return sendError(res, 400, 'Name is required');
  if (findEquipmentByNameCI(body.name)) {
    return sendError(res, 400, `Equipment named "${body.name}" already exists`);
  }

  const id = newId();
  const ts = nowIso();
  try {
    db.prepare(
      `INSERT INTO equipment (id, name, substitutes, image, image_pos, image_zoom, image_fit, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, body.name, JSON.stringify(body.substitutes), body.image, body.image_pos, body.image_zoom, body.image_fit, ts, ts);
  } catch (err) {
    // Defense-in-depth against the DB's own unique index (race with the check above).
    if (err && err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return sendError(res, 400, `Equipment named "${body.name}" already exists`);
    }
    throw err;
  }

  const row = db.prepare('SELECT * FROM equipment WHERE id = ?').get(id);
  res.status(201).json(rowToEquipment(row));
});

app.put('/api/equipment/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM equipment WHERE id = ?').get(req.params.id);
  if (!existing) return notFound(res, 'Equipment');

  const body = normalizeEquipmentBody(req.body, existing);
  if (!body.name) return sendError(res, 400, 'Name is required');
  if (findEquipmentByNameCI(body.name, req.params.id)) {
    return sendError(res, 400, `Equipment named "${body.name}" already exists`);
  }

  const ts = nowIso();
  try {
    db.prepare(
      'UPDATE equipment SET name = ?, substitutes = ?, image = ?, image_pos = ?, image_zoom = ?, image_fit = ?, updated_at = ? WHERE id = ?'
    ).run(
      body.name,
      JSON.stringify(body.substitutes),
      body.image,
      body.image_pos,
      body.image_zoom,
      body.image_fit,
      ts,
      req.params.id
    );
  } catch (err) {
    if (err && err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return sendError(res, 400, `Equipment named "${body.name}" already exists`);
    }
    throw err;
  }

  const row = db.prepare('SELECT * FROM equipment WHERE id = ?').get(req.params.id);
  res.json(rowToEquipment(row));
});

app.delete('/api/equipment/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM equipment WHERE id = ?').get(req.params.id);
  if (!existing) return notFound(res, 'Equipment');
  db.prepare('DELETE FROM equipment WHERE id = ?').run(req.params.id);
  // No cascade — exercises/gyms store equipment as free strings, so a deleted
  // equipment row simply stops being suggested (decision #23).
  res.json({ deleted: true, id: req.params.id });
});

// ---------------------------------------------------------------------------
// Plan (fixed Mon-Sun weekly template)
// ---------------------------------------------------------------------------

app.get('/api/plan', (req, res) => {
  const rows = db
    .prepare(
      `SELECT plan.day as day, workouts.* FROM plan LEFT JOIN workouts ON workouts.id = plan.workout_id`
    )
    .all();
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const result = WEEKDAYS.map((day) => {
    const r = byDay.get(day);
    return { day, workout: r && r.id ? rowToWorkout(r) : null };
  });
  res.json(result);
});

app.put('/api/plan/:day', (req, res) => {
  const { day } = req.params;
  if (!WEEKDAYS.includes(day)) {
    return sendError(res, 400, `day must be one of: ${WEEKDAYS.join(', ')}`);
  }
  const { workout_id } = req.body || {};
  if (workout_id) {
    const workout = db.prepare('SELECT id FROM workouts WHERE id = ?').get(workout_id);
    if (!workout) return notFound(res, 'Workout');
  }
  db.prepare('UPDATE plan SET workout_id = ? WHERE day = ?').run(workout_id || null, day);
  const row = db
    .prepare('SELECT plan.day as day, workouts.* FROM plan LEFT JOIN workouts ON workouts.id = plan.workout_id WHERE plan.day = ?')
    .get(day);
  res.json({ day, workout: row && row.id ? rowToWorkout(row) : null });
});

// ---------------------------------------------------------------------------
// Schedule (specs/schedule.md — date-specific overrides layered over `plan`)
// ---------------------------------------------------------------------------

// Sane cap on a date-range read (a padded month is ~42 days; 62 gives headroom).
const MAX_SCHEDULE_RANGE_DAYS = 62;

app.get('/api/schedule', (req, res) => {
  const { from, to } = req.query;
  if (!isValidDateStr(from) || !isValidDateStr(to)) {
    return sendError(res, 400, 'from and to are required, valid YYYY-MM-DD dates');
  }
  if (to < from) {
    return sendError(res, 400, 'to must not be before from');
  }
  const fromDate = toDateOnlyUTC(from);
  const toDate = toDateOnlyUTC(to);
  const spanDays = Math.round((toDate.getTime() - fromDate.getTime()) / 86400000) + 1;
  if (spanDays > MAX_SCHEDULE_RANGE_DAYS) {
    return sendError(res, 400, `range too large — max ${MAX_SCHEDULE_RANGE_DAYS} days`);
  }

  const todayStr = resolveTodayStr(req, res);
  if (todayStr === null) return; // error already sent

  const ctx = buildResolutionCtx(db);
  const sessionDatesSet = getSessionDatesSet(db);

  const schedule = [];
  for (let i = 0; i < spanDays; i++) {
    const dStr = formatDateOnly(addDaysUTC(fromDate, i));
    schedule.push(computeScheduleEntry(dStr, todayStr, ctx, sessionDatesSet));
  }
  res.json({ schedule });
});

// Set-the-whole-day mutation. Body is exactly one of:
//   { workout_ids: string[] } — replace the date's entries (order preserved);
//     an empty array behaves like { clear: true } (zero rows -> unset).
//   { rest: true }            — explicit Rest-marker (single NULL row)
//   { clear: true }           — delete the date's override -> template fallback
app.put('/api/schedule/:date', (req, res) => {
  const { date } = req.params;
  if (!isValidDateStr(date)) return sendError(res, 400, 'date must be a valid YYYY-MM-DD date');

  // Validate ?today BEFORE any mutation so a malformed value never writes then 400s.
  const todayStr = resolveTodayStr(req, res);
  if (todayStr === null) return;

  const body = req.body || {};
  const ts = nowIso();

  if (body.clear === true) {
    db.prepare('DELETE FROM schedule WHERE date = ?').run(date);
  } else if (body.rest === true) {
    const setRest = db.transaction(() => {
      db.prepare('DELETE FROM schedule WHERE date = ?').run(date);
      db.prepare(
        'INSERT INTO schedule (id, date, workout_id, sort_order, created_at) VALUES (?, ?, NULL, 0, ?)'
      ).run(newId(), date, ts);
    });
    setRest();
  } else if (Array.isArray(body.workout_ids)) {
    const ids = body.workout_ids.map((v) => String(v));
    // Validate every id up front so a bad id 404s without mutating anything
    // (consistent with PUT /api/plan/:day 404ing on an unknown workout_id).
    for (const wid of ids) {
      const workout = db.prepare('SELECT id FROM workouts WHERE id = ?').get(wid);
      if (!workout) return notFound(res, 'Workout');
    }
    const setWorkouts = db.transaction(() => {
      db.prepare('DELETE FROM schedule WHERE date = ?').run(date);
      ids.forEach((wid, idx) => {
        db.prepare(
          'INSERT INTO schedule (id, date, workout_id, sort_order, created_at) VALUES (?, ?, ?, ?, ?)'
        ).run(newId(), date, wid, idx, ts);
      });
    });
    setWorkouts();
  } else {
    return sendError(res, 400, 'body must be one of { workout_ids: string[] }, { rest: true }, { clear: true }');
  }

  const ctx = buildResolutionCtx(db);
  const sessionDatesSet = getSessionDatesSet(db);
  res.json(computeScheduleEntry(date, todayStr, ctx, sessionDatesSet));
});

// ---------------------------------------------------------------------------
// Sessions (completed only — see decision #5)
// ---------------------------------------------------------------------------

app.get('/api/sessions', (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  const total = db.prepare('SELECT COUNT(*) as c FROM sessions').get().c;
  const rows = db
    .prepare('SELECT * FROM sessions ORDER BY date DESC, created_at DESC LIMIT ? OFFSET ?')
    .all(limit, offset);
  res.json({ sessions: rows.map(rowToSession), total });
});

app.get('/api/sessions/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!row) return notFound(res, 'Session');
  res.json(rowToSession(row));
});

app.post('/api/sessions', (req, res) => {
  const body = req.body || {};
  const workout_id = body.workout_id ? String(body.workout_id) : null;

  let workout_title = body.workout_title ? String(body.workout_title).trim() : null;
  let workout_category = body.workout_category ? String(body.workout_category).trim() : null;

  if (workout_id) {
    const workout = db.prepare('SELECT * FROM workouts WHERE id = ?').get(workout_id);
    if (!workout) return notFound(res, 'Workout');
    // Snapshot at completion time so history survives later edits/deletion.
    workout_title = workout.title;
    workout_category = workout.category;
  } else if (!workout_title) {
    return sendError(res, 400, 'workout_id (or a workout_title snapshot) is required');
  }

  const date = body.date && typeof body.date === 'string' ? body.date : nowIso();

  let duration_sec = 0;
  if (body.started_at && body.ended_at) {
    const startedMs = Date.parse(body.started_at);
    const endedMs = Date.parse(body.ended_at);
    if (!Number.isNaN(startedMs) && !Number.isNaN(endedMs)) {
      duration_sec = Math.max(0, Math.round((endedMs - startedMs) / 1000));
    }
  } else {
    duration_sec = Math.max(0, parseInt(body.duration_sec, 10) || 0);
  }

  const entries = normalizeSessionEntries(body.entries);
  // Fill in exercise_name snapshots from the library when the client omitted them.
  for (const entry of entries) {
    if (!entry.exercise_name) {
      const ex = db.prepare('SELECT name FROM exercises WHERE id = ?').get(entry.exercise_id);
      entry.exercise_name = ex ? ex.name : 'Unknown exercise';
    }
  }

  let total_sets = 0;
  let total_volume = 0;
  for (const entry of entries) {
    for (const set of entry.sets) {
      if (set.completed) {
        total_sets++;
        total_volume += (set.weight || 0) * (set.reps || 0);
      }
    }
  }

  const distance_km = body.distance_km !== undefined && body.distance_km !== null && body.distance_km !== ''
    ? Number(body.distance_km)
    : null;

  const priorBestMap = computePriorBestMap(db);
  const prs = detectPRs(entries, priorBestMap);

  const id = newId();
  const created_at = nowIso();
  db.prepare(
    `INSERT INTO sessions
      (id, workout_id, workout_title, workout_category, date, duration_sec, total_sets, total_volume, distance_km, entries, prs, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    workout_id,
    workout_title,
    workout_category,
    date,
    duration_sec,
    total_sets,
    Math.round(total_volume * 100) / 100,
    distance_km,
    JSON.stringify(entries),
    JSON.stringify(prs),
    created_at
  );

  const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
  res.status(201).json(rowToSession(row));
});

// Edit a logged session's sets (decision #22 — History week drill-down edit flow).
// Mirrors POST's derivation exactly, except: (1) fields the body omits keep their
// existing stored value rather than reset to a default (patch-ish, but simplest —
// the workout_id/title/category snapshot is kept unless the body explicitly touches
// it, per the task); (2) PRs are recomputed against every OTHER session's prior
// best (this session's id is excluded from the scan) so re-saving unchanged sets
// never spuriously invents or drops a PR against itself.
app.put('/api/sessions/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!existing) return notFound(res, 'Session');

  const body = req.body || {};

  // workout_id/title/category snapshot: keep as-is unless the body explicitly
  // changes it (mirrors POST's snapshot-at-completion-time behavior).
  let workout_id = existing.workout_id;
  let workout_title = existing.workout_title;
  let workout_category = existing.workout_category;
  if (Object.prototype.hasOwnProperty.call(body, 'workout_id')) {
    workout_id = body.workout_id ? String(body.workout_id) : null;
    if (workout_id) {
      const workout = db.prepare('SELECT * FROM workouts WHERE id = ?').get(workout_id);
      if (!workout) return notFound(res, 'Workout');
      workout_title = workout.title;
      workout_category = workout.category;
    } else if (body.workout_title) {
      workout_title = String(body.workout_title).trim();
      workout_category = body.workout_category ? String(body.workout_category).trim() : null;
    }
  }

  const date = Object.prototype.hasOwnProperty.call(body, 'date') && typeof body.date === 'string'
    ? body.date
    : existing.date;

  let duration_sec = existing.duration_sec;
  if (body.started_at && body.ended_at) {
    const startedMs = Date.parse(body.started_at);
    const endedMs = Date.parse(body.ended_at);
    if (!Number.isNaN(startedMs) && !Number.isNaN(endedMs)) {
      duration_sec = Math.max(0, Math.round((endedMs - startedMs) / 1000));
    }
  } else if (Object.prototype.hasOwnProperty.call(body, 'duration_sec')) {
    duration_sec = Math.max(0, parseInt(body.duration_sec, 10) || 0);
  }

  const entries = Object.prototype.hasOwnProperty.call(body, 'entries')
    ? normalizeSessionEntries(body.entries)
    : safeParseArray(existing.entries);

  // Fill in exercise_name snapshots from the library when the client omitted them.
  for (const entry of entries) {
    if (!entry.exercise_name) {
      const ex = db.prepare('SELECT name FROM exercises WHERE id = ?').get(entry.exercise_id);
      entry.exercise_name = ex ? ex.name : 'Unknown exercise';
    }
  }

  let total_sets = 0;
  let total_volume = 0;
  for (const entry of entries) {
    for (const set of entry.sets) {
      if (set.completed) {
        total_sets++;
        total_volume += (set.weight || 0) * (set.reps || 0);
      }
    }
  }

  const distance_km = Object.prototype.hasOwnProperty.call(body, 'distance_km')
    ? (body.distance_km !== null && body.distance_km !== '' ? Number(body.distance_km) : null)
    : existing.distance_km;

  // Exclude this session from its own "prior best" scan — see decision #22.
  const priorBestMap = computePriorBestMap(db, req.params.id);
  const prs = detectPRs(entries, priorBestMap);

  const update = db.transaction(() => {
    db.prepare(
      `UPDATE sessions SET
        workout_id = ?, workout_title = ?, workout_category = ?, date = ?, duration_sec = ?,
        total_sets = ?, total_volume = ?, distance_km = ?, entries = ?, prs = ?
       WHERE id = ?`
    ).run(
      workout_id,
      workout_title,
      workout_category,
      date,
      duration_sec,
      total_sets,
      Math.round(total_volume * 100) / 100,
      distance_km,
      JSON.stringify(entries),
      JSON.stringify(prs),
      req.params.id
    );
  });
  update();

  const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  res.json(rowToSession(row));
});

app.delete('/api/sessions/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!existing) return notFound(res, 'Session');
  db.prepare('DELETE FROM sessions WHERE id = ?').run(req.params.id);
  res.json({ deleted: true, id: req.params.id });
});

// ---------------------------------------------------------------------------
// Derived / home
// ---------------------------------------------------------------------------

function resolveTodayStr(req, res) {
  const q = req.query.today;
  if (q === undefined) return defaultTodayStr();
  if (!isValidDateStr(q)) {
    sendError(res, 400, 'today must be an ISO date string, YYYY-MM-DD');
    return null;
  }
  return q;
}

app.get('/api/week', (req, res) => {
  const todayStr = resolveTodayStr(req, res);
  if (todayStr === null) return; // error already sent
  res.json(computeWeekPayload(db, todayStr));
});

app.get('/api/stats', (req, res) => {
  const todayStr = resolveTodayStr(req, res);
  if (todayStr === null) return;
  res.json(computeStats(db, todayStr));
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Static client (production) — serves client/dist and falls back to index.html
// for client-side routes. In dev, Vite serves the client on its own port.
// ---------------------------------------------------------------------------

const clientDist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^\/(?!api).*/, (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Fallback JSON error handler for anything unexpected (e.g. multer errors that
// slip past the inline handlers, or thrown errors in a route).
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  sendError(res, 500, 'Internal server error');
});

const PORT = process.env.PORT || 4000;

// Only auto-listen when run directly (`node server/index.js`), not when
// imported by the test suite (which drives the app via supertest instead).
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__dirname, 'index.js');
if (isMain) {
  app.listen(PORT, () => {
    console.log(`Reps API listening on http://localhost:${PORT}`);
  });
}

export default app;
