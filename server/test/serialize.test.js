import { describe, it, expect } from 'vitest';
import os from 'node:os';
import path from 'node:path';

// lib/serialize.js imports MEDIA_DIR from db.js, which opens a DB connection
// (and creates directories) as a module-level side effect. Point that at a
// scratch location via a dynamic import (evaluated after this env var is set)
// so this pure serialization unit test never touches the real server/reps.db.
process.env.REPS_DB_PATH = path.join(os.tmpdir(), `reps-test-serialize-${process.pid}-${Date.now()}.db`);
process.env.REPS_MEDIA_DIR = path.join(os.tmpdir(), `reps-test-serialize-media-${process.pid}-${Date.now()}`);

const {
  safeParseArray,
  normalizeExerciseBody,
  rowToExercise,
  normalizeWorkoutBody,
  normalizeWorkoutExercises,
  rowToWorkout,
  normalizeSessionEntries,
  rowToSession,
} = await import('../lib/serialize.js');

describe('safeParseArray', () => {
  it('parses valid JSON arrays', () => {
    expect(safeParseArray('["a","b"]')).toEqual(['a', 'b']);
  });
  it('falls back to [] on corrupted JSON', () => {
    expect(safeParseArray('{not json')).toEqual([]);
  });
  it('falls back to [] when JSON parses to a non-array', () => {
    expect(safeParseArray('{"a":1}')).toEqual([]);
  });
  it('falls back to [] on null/undefined', () => {
    expect(safeParseArray(null)).toEqual([]);
    expect(safeParseArray(undefined)).toEqual([]);
  });
});

describe('exercise normalize -> row -> rowToExercise round trip', () => {
  it('preserves arrays through the JSON boundary', () => {
    const body = normalizeExerciseBody({
      name: '  Barbell Bench Press  ',
      category: 'Push',
      equipment: 'Barbell',
      difficulty: 'Intermediate',
      muscles_worked: ['Chest', ' Triceps ', ''],
      how_to: ['Step one.', 'Step two.'],
      step_times: [10, 20],
      tags: ['compound'],
    });

    expect(body.name).toBe('Barbell Bench Press');
    expect(body.muscles_worked).toEqual(['Chest', 'Triceps']);

    // Simulate the DB round trip: JSON.stringify on write, JSON.parse on read.
    const row = {
      id: 'ex1',
      name: body.name,
      category: body.category,
      equipment: body.equipment,
      difficulty: body.difficulty,
      demo_file: null,
      image: body.image,
      source_url: body.source_url,
      muscles_worked: JSON.stringify(body.muscles_worked),
      how_to: JSON.stringify(body.how_to),
      step_times: JSON.stringify(body.step_times),
      tags: JSON.stringify(body.tags),
      created_at: 't1',
      updated_at: 't1',
    };

    const out = rowToExercise(row);
    expect(out.muscles_worked).toEqual(['Chest', 'Triceps']);
    expect(out.how_to).toEqual(['Step one.', 'Step two.']);
    expect(out.step_times).toEqual([10, 20]);
    expect(out.tags).toEqual(['compound']);
    expect(out.has_demo).toBe(false);
    expect(out).not.toHaveProperty('demo_file');
  });

  it('drops mismatched-length step_times as garbage', () => {
    const body = normalizeExerciseBody({
      name: 'X',
      how_to: ['a', 'b', 'c'],
      step_times: [1, 2], // wrong length
    });
    expect(body.step_times).toEqual([]);
  });
});

describe('workout normalize -> row -> rowToWorkout round trip', () => {
  it('preserves the ordered exercises[] with mixed numeric/range reps', () => {
    const exercises = normalizeWorkoutExercises([
      { exercise_id: 'e1', sets: 4, reps: '8-10', rest: 90 },
      { exercise_id: 'e2', sets: '3', reps: 8, rest: '60' },
    ]);
    expect(exercises).toEqual([
      { exercise_id: 'e1', sets: 4, reps: '8-10', rest: 90 },
      { exercise_id: 'e2', sets: 3, reps: 8, rest: 60 },
    ]);

    const row = {
      id: 'w1',
      title: 'Push Day A',
      type: 'Strength',
      category: 'Push',
      favorite: 1,
      est_minutes: 40,
      image: null,
      exercises: JSON.stringify(exercises),
      created_at: 't1',
      updated_at: 't1',
    };
    const out = rowToWorkout(row);
    expect(out.exercises).toEqual(exercises);
    expect(out.exercise_count).toBe(2);
    expect(out.favorite).toBe(true);
  });

  it('normalizeWorkoutBody merges partial updates onto an existing row (favorite-only PUT)', () => {
    const existingRow = {
      title: 'Leg Day',
      type: 'Strength',
      category: 'Legs',
      favorite: 0,
      image: null,
      exercises: JSON.stringify([{ exercise_id: 'e1', sets: 3, reps: 8, rest: 60 }]),
    };
    const merged = normalizeWorkoutBody({ favorite: true }, existingRow);
    expect(merged.title).toBe('Leg Day');
    expect(merged.exercises).toEqual([{ exercise_id: 'e1', sets: 3, reps: 8, rest: 60 }]);
    expect(merged.favorite).toBe(true);
  });

  it('flags an invalid type/category as null so the route can 400', () => {
    const body = normalizeWorkoutBody({ title: 'X', type: 'Bogus', category: 'Bogus', exercises: [] });
    expect(body.type).toBeNull();
    expect(body.category).toBeNull();
  });
});

describe('session normalize -> row -> rowToSession round trip', () => {
  it('preserves nested per-set actuals', () => {
    const entries = normalizeSessionEntries([
      {
        exercise_id: 'e1',
        exercise_name: 'Bench',
        sets: [
          { weight: 135, reps: 8, completed: true },
          { weight: '', reps: null, completed: false },
        ],
      },
    ]);
    expect(entries[0].sets).toEqual([
      { weight: 135, reps: 8, completed: true },
      { weight: null, reps: null, completed: false },
    ]);

    const row = {
      id: 's1',
      workout_id: 'w1',
      workout_title: 'Push Day A',
      workout_category: 'Push',
      date: '2026-07-08T10:00:00.000Z',
      duration_sec: 3000,
      total_sets: 1,
      total_volume: 1080,
      distance_km: null,
      entries: JSON.stringify(entries),
      prs: JSON.stringify([]),
      created_at: 't1',
    };
    const out = rowToSession(row);
    expect(out.entries).toEqual(entries);
    expect(out.prs).toEqual([]);
  });
});
