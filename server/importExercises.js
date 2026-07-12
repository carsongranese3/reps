// server/importExercises.js — load exercises from a JSON file into the DB.
//
// Usage:  node server/importExercises.js <path-to-json>
//         npm run import:exercises -- data/new-exercises.json
//
// The JSON may be either an array of exercise objects, or { "exercises": [...] }.
// Idempotent by name: an exercise whose `name` already exists is UPDATED
// (text fields only — its demo_file/image are left untouched); a new name is
// INSERTED. Validates every entry and prints a per-row report; nothing is
// written if any row fails validation (all-or-nothing, in a transaction).
//
// This is how content generated elsewhere (e.g. pasted from a claude.ai chat)
// gets loaded — no external API involved.

import fs from 'node:fs';
import crypto from 'node:crypto';
import { db, migrate } from './db.js';

// Soft-allowed vocabularies (matches the seed/design taxonomy). Unknown values
// are allowed but warned about, so you can extend the taxonomy deliberately.
const CATEGORIES = ['Strength', 'Push', 'Pull', 'Legs', 'Cardio', 'Mobility'];
const DIFFICULTIES = ['Beginner', 'Intermediate', 'Advanced'];

function fail(msg) {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

const path = process.argv[2];
if (!path) fail('No file given. Usage: node server/importExercises.js <path-to-json>');
if (!fs.existsSync(path)) fail(`File not found: ${path}`);

let raw;
try {
  raw = JSON.parse(fs.readFileSync(path, 'utf8'));
} catch (e) {
  fail(`Could not parse JSON: ${e.message}`);
}

const list = Array.isArray(raw) ? raw : Array.isArray(raw?.exercises) ? raw.exercises : null;
if (!list) fail('JSON must be an array of exercises, or an object with an "exercises" array.');

const asStringArray = (v) =>
  (Array.isArray(v) ? v : v == null ? [] : [v]).map((x) => String(x).trim()).filter(Boolean);
const asNumberArray = (v) =>
  (Array.isArray(v) ? v : []).map((x) => Number(x)).filter((n) => Number.isFinite(n) && n >= 0);

const errors = [];
const warnings = [];
const clean = [];

list.forEach((ex, i) => {
  const where = `entry #${i + 1}${ex?.name ? ` ("${ex.name}")` : ''}`;
  if (!ex || typeof ex !== 'object') return errors.push(`${where}: not an object`);

  const name = String(ex.name ?? '').trim();
  const category = String(ex.category ?? '').trim();
  const equipment = String(ex.equipment ?? '').trim();
  const difficulty = String(ex.difficulty ?? '').trim();
  const muscles_worked = asStringArray(ex.muscles_worked);
  const how_to = asStringArray(ex.how_to);
  const step_times = asNumberArray(ex.step_times);
  const tags = asStringArray(ex.tags);

  if (!name) errors.push(`${where}: missing "name"`);
  if (!category) errors.push(`${where}: missing "category"`);
  if (!equipment) errors.push(`${where}: missing "equipment"`);
  if (!difficulty) errors.push(`${where}: missing "difficulty"`);
  if (muscles_worked.length === 0) errors.push(`${where}: "muscles_worked" is empty`);
  if (how_to.length < 2) errors.push(`${where}: "how_to" needs at least 2 steps`);

  if (category && !CATEGORIES.includes(category))
    warnings.push(`${where}: category "${category}" is outside ${CATEGORIES.join('/')}`);
  if (difficulty && !DIFFICULTIES.includes(difficulty))
    warnings.push(`${where}: difficulty "${difficulty}" is outside ${DIFFICULTIES.join('/')}`);
  if (step_times.length && step_times.length !== how_to.length)
    warnings.push(`${where}: step_times length (${step_times.length}) != how_to length (${how_to.length}); dropping step_times`);

  clean.push({
    name,
    category,
    equipment,
    difficulty,
    muscles_worked,
    how_to,
    step_times: step_times.length === how_to.length ? step_times : [],
    tags,
  });
});

// Duplicate-name check within the file
const seen = new Set();
for (const ex of clean) {
  if (!ex.name) continue;
  const k = ex.name.toLowerCase();
  if (seen.has(k)) errors.push(`duplicate name in file: "${ex.name}"`);
  seen.add(k);
}

if (warnings.length) {
  console.log('\nWarnings:');
  warnings.forEach((w) => console.log('  ! ' + w));
}
if (errors.length) {
  console.log('\nErrors (nothing was imported):');
  errors.forEach((e) => console.log('  ✗ ' + e));
  process.exit(1);
}

migrate();
const nowIso = () => new Date().toISOString();

const findByName = db.prepare('SELECT id FROM exercises WHERE name = ?');
const insert = db.prepare(
  `INSERT INTO exercises
     (id, name, category, equipment, difficulty, demo_file, image, source_url,
      muscles_worked, how_to, step_times, tags, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?, ?, ?, ?)`
);
const update = db.prepare(
  `UPDATE exercises
      SET category = ?, equipment = ?, difficulty = ?,
          muscles_worked = ?, how_to = ?, step_times = ?, tags = ?, updated_at = ?
    WHERE id = ?`
);

let inserted = 0;
let updated = 0;
const apply = db.transaction((rows) => {
  for (const ex of rows) {
    const ts = nowIso();
    const existing = findByName.get(ex.name);
    const j = (v) => JSON.stringify(v);
    if (existing) {
      update.run(ex.category, ex.equipment, ex.difficulty, j(ex.muscles_worked), j(ex.how_to), j(ex.step_times), j(ex.tags), ts, existing.id);
      updated++;
    } else {
      insert.run(crypto.randomUUID(), ex.name, ex.category, ex.equipment, ex.difficulty, j(ex.muscles_worked), j(ex.how_to), j(ex.step_times), j(ex.tags), ts, ts);
      inserted++;
    }
  }
});
apply(clean);

const total = db.prepare('SELECT COUNT(*) n FROM exercises').get().n;
console.log(`\n✓ Imported ${clean.length} exercise(s): ${inserted} new, ${updated} updated.`);
console.log(`  Library now has ${total} exercises.\n`);
