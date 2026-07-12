// The serialization boundary (per CLAUDE.md / cookbook pattern): normalizeBody()
// coerces an incoming request body into clean storable fields; rowTo*() reverses
// it, safe-parsing every JSON column back into real arrays/objects. This is the
// ONLY place JSON.stringify/JSON.parse happens for these entities — routes and
// components elsewhere only ever see real arrays/objects.

import fs from 'node:fs';
import path from 'node:path';
import { MEDIA_DIR } from '../db.js';

export function safeParseArray(json, fallback = []) {
  if (json == null) return fallback;
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function trimOrNull(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

export function stringArray(v) {
  if (!Array.isArray(v)) return [];
  return v.map((s) => String(s ?? '').trim()).filter(Boolean);
}

// Keeps only well-formed http(s) URLs (used for source_url/video_url); anything
// else — blank, malformed, non-http(s) scheme — collapses to null.
export function httpUrlOrNull(v) {
  const s = trimOrNull(v);
  if (!s) return null;
  try {
    const parsed = new URL(s);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? s : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// exercises
// ---------------------------------------------------------------------------

export const EXERCISE_CATEGORIES = ['Strength', 'Push', 'Pull', 'Legs', 'Cardio', 'Mobility'];

export function normalizeExerciseBody(body = {}) {
  const name = trimOrNull(body.name) ?? '';
  const category = trimOrNull(body.category);
  const equipment = trimOrNull(body.equipment);
  const difficulty = trimOrNull(body.difficulty);
  const muscles_worked = stringArray(body.muscles_worked);
  const how_to = stringArray(body.how_to);
  // step_times must stay positionally parallel to how_to; drop garbage otherwise.
  let step_times = [];
  if (Array.isArray(body.step_times) && body.step_times.length === how_to.length) {
    step_times = body.step_times.map((n) => {
      const num = Number(n);
      return Number.isFinite(num) && num >= 0 ? num : 0;
    });
  }
  const tags = stringArray(body.tags);
  const image = trimOrNull(body.image);
  const source_url = trimOrNull(body.source_url);
  // Best-effort/unverified YouTube link (Gemini autofill or manual entry) —
  // only kept if it's a real http(s) URL, else null. See decision #16.
  const video_url = httpUrlOrNull(body.video_url);

  return { name, category, equipment, difficulty, muscles_worked, how_to, step_times, tags, image, source_url, video_url };
}

export function hasDemoFile(demo_file) {
  if (!demo_file) return false;
  try {
    return fs.existsSync(path.join(MEDIA_DIR, demo_file));
  } catch {
    return false;
  }
}

export function rowToExercise(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    equipment: row.equipment,
    difficulty: row.difficulty,
    muscles_worked: safeParseArray(row.muscles_worked),
    how_to: safeParseArray(row.how_to),
    step_times: safeParseArray(row.step_times),
    tags: safeParseArray(row.tags),
    image: row.image,
    source_url: row.source_url,
    video_url: row.video_url ?? null,
    has_demo: hasDemoFile(row.demo_file),
    created_at: row.created_at,
    updated_at: row.updated_at,
    // demo_file is intentionally never exposed — only has_demo.
  };
}

// ---------------------------------------------------------------------------
// workouts
// ---------------------------------------------------------------------------

export const WORKOUT_TYPES = ['Strength', 'Hypertrophy', 'Power'];
export const WORKOUT_CATEGORIES = ['Strength', 'Push', 'Pull', 'Legs', 'Cardio', 'Mobility'];

function normalizeWorkoutExerciseEntry(e) {
  const exercise_id = trimOrNull(e?.exercise_id);
  if (!exercise_id) return null;
  const setsNum = parseInt(e.sets, 10);
  const sets = Number.isFinite(setsNum) && setsNum >= 1 ? setsNum : 1;
  const restNum = parseInt(e.rest, 10);
  const rest = Number.isFinite(restNum) && restNum >= 0 ? restNum : 0;
  let reps = e.reps;
  if (typeof reps === 'number') {
    reps = Number.isFinite(reps) && reps >= 1 ? reps : 1;
  } else {
    reps = trimOrNull(reps) ?? '1';
  }
  return { exercise_id, sets, reps, rest };
}

export function normalizeWorkoutExercises(exercises) {
  if (!Array.isArray(exercises)) return [];
  return exercises.map(normalizeWorkoutExerciseEntry).filter(Boolean);
}

// `partial` merges onto `existing` (a raw DB row or already-normalized object) so
// PUT can act like a patch — e.g. a bare favorite toggle doesn't need to resend
// the whole workout. Only keys present in `body` are applied.
export function normalizeWorkoutBody(body = {}, existing = null) {
  const base = existing
    ? {
        title: existing.title,
        type: existing.type,
        category: existing.category,
        favorite: !!existing.favorite,
        image: existing.image,
        gym_id: existing.gym_id ?? null,
        exercises: safeParseArray(existing.exercises),
      }
    : { title: '', type: 'Strength', category: 'Strength', favorite: false, image: null, gym_id: null, exercises: [] };

  const title = Object.prototype.hasOwnProperty.call(body, 'title') ? trimOrNull(body.title) ?? '' : base.title;

  let type = base.type;
  if (Object.prototype.hasOwnProperty.call(body, 'type')) {
    type = WORKOUT_TYPES.includes(body.type) ? body.type : null; // null = invalid, caller validates
  }

  let category = base.category;
  if (Object.prototype.hasOwnProperty.call(body, 'category')) {
    category = WORKOUT_CATEGORIES.includes(body.category) ? body.category : null;
  }

  const favorite = Object.prototype.hasOwnProperty.call(body, 'favorite') ? !!body.favorite : base.favorite;
  const image = Object.prototype.hasOwnProperty.call(body, 'image') ? trimOrNull(body.image) : base.image;
  // gym_id: null = "Any gym" (decision #18) — not a real gym row, no FK enforcement.
  // Present-in-body applies (including explicit null to clear back to Any gym);
  // absent-from-body preserves the existing value (patch semantics).
  const gym_id = Object.prototype.hasOwnProperty.call(body, 'gym_id') ? trimOrNull(body.gym_id) : base.gym_id;
  const exercises = Object.prototype.hasOwnProperty.call(body, 'exercises')
    ? normalizeWorkoutExercises(body.exercises)
    : base.exercises;

  return { title, type, category, favorite, image, gym_id, exercises };
}

export function rowToWorkout(row) {
  if (!row) return null;
  const exercises = safeParseArray(row.exercises);
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    category: row.category,
    favorite: !!row.favorite,
    est_minutes: row.est_minutes,
    image: row.image,
    gym_id: row.gym_id ?? null,
    exercises,
    exercise_count: exercises.length,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// sessions
// ---------------------------------------------------------------------------

function normalizeSessionSetEntry(s) {
  const weight = s && s.weight !== null && s.weight !== undefined && s.weight !== '' ? Number(s.weight) || 0 : null;
  const reps = s && s.reps !== null && s.reps !== undefined && s.reps !== '' ? Number(s.reps) || 0 : null;
  return { weight, reps, completed: !!(s && s.completed) };
}

export function normalizeSessionEntries(entries) {
  if (!Array.isArray(entries)) return [];
  return entries
    .filter((e) => e && e.exercise_id)
    .map((e) => ({
      exercise_id: String(e.exercise_id),
      exercise_name: trimOrNull(e.exercise_name) ?? '',
      sets: Array.isArray(e.sets) ? e.sets.map(normalizeSessionSetEntry) : [],
    }));
}

// ---------------------------------------------------------------------------
// gyms
// ---------------------------------------------------------------------------

// Dedupes while preserving first-seen order (equipment is a plain checklist +
// add-custom string[] — see decision #17).
function dedupeStrings(arr) {
  const seen = new Set();
  const out = [];
  for (const s of arr) {
    if (!seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

// Like stringArray, but non-strings are DROPPED rather than coerced (equipment
// is a checklist + free-typed custom entries — a stray number/object in the
// payload is garbage, not a label).
function stringArrayStrict(v) {
  if (!Array.isArray(v)) return [];
  return v
    .filter((s) => typeof s === 'string')
    .map((s) => s.trim())
    .filter(Boolean);
}

// `partial` merges onto `existing` (a raw DB row or already-normalized object) so
// PUT can act like a patch — e.g. a bare favorite toggle doesn't need to resend
// the whole gym. Only keys present in `body` are applied. Mirrors normalizeWorkoutBody.
export function normalizeGymBody(body = {}, existing = null) {
  const base = existing
    ? {
        name: existing.name,
        favorite: !!existing.favorite,
        image: existing.image,
        equipment: safeParseArray(existing.equipment),
      }
    : { name: '', favorite: false, image: null, equipment: [] };

  const name = Object.prototype.hasOwnProperty.call(body, 'name') ? trimOrNull(body.name) ?? '' : base.name;
  const favorite = Object.prototype.hasOwnProperty.call(body, 'favorite') ? !!body.favorite : base.favorite;
  const image = Object.prototype.hasOwnProperty.call(body, 'image') ? trimOrNull(body.image) : base.image;
  const equipment = Object.prototype.hasOwnProperty.call(body, 'equipment')
    ? dedupeStrings(stringArrayStrict(body.equipment))
    : base.equipment;

  return { name, favorite, image, equipment };
}

export function rowToGym(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    favorite: !!row.favorite,
    image: row.image,
    equipment: safeParseArray(row.equipment),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function rowToSession(row) {
  if (!row) return null;
  return {
    id: row.id,
    workout_id: row.workout_id ?? null,
    workout_title: row.workout_title,
    workout_category: row.workout_category ?? null,
    date: row.date,
    duration_sec: row.duration_sec,
    total_sets: row.total_sets,
    total_volume: row.total_volume,
    distance_km: row.distance_km ?? null,
    entries: safeParseArray(row.entries),
    prs: safeParseArray(row.prs),
    created_at: row.created_at,
  };
}
