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
  normalizeSessionEntries,
  rowToSession,
  safeParseArray,
} from './lib/serialize.js';
import { computePriorBestMap, detectPRs } from './lib/pr.js';
import { computeWeekPayload, defaultTodayStr, isValidDateStr } from './lib/week.js';
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
    const suggestion = await autofillExercise(name);
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
    `INSERT INTO workouts (id, title, type, category, favorite, est_minutes, image, exercises, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, body.title, body.type, body.category, body.favorite ? 1 : 0, est_minutes, body.image, JSON.stringify(body.exercises), ts, ts);

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
    `UPDATE workouts SET title = ?, type = ?, category = ?, favorite = ?, est_minutes = ?, image = ?, exercises = ?, updated_at = ?
     WHERE id = ?`
  ).run(body.title, body.type, body.category, body.favorite ? 1 : 0, est_minutes, body.image, JSON.stringify(body.exercises), ts, req.params.id);

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
