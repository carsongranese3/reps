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
  safeParseEquipmentGroups,
  normalizeExerciseBody,
  normalizeEquipmentGroups,
  formatEquipmentGroups,
  rowToExercise,
  normalizeWorkoutBody,
  normalizeWorkoutExercises,
  rowToWorkout,
  normalizeGymBody,
  rowToGym,
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
      equipment_groups: [['Barbell'], ['Bench']],
      difficulty: 'Intermediate',
      muscles_worked: ['Chest', ' Triceps ', ''],
      how_to: ['Step one.', 'Step two.'],
      step_times: [10, 20],
      tags: ['compound'],
    });

    expect(body.name).toBe('Barbell Bench Press');
    expect(body.muscles_worked).toEqual(['Chest', 'Triceps']);
    expect(body.equipment_groups).toEqual([['Barbell'], ['Bench']]);

    // Simulate the DB round trip: JSON.stringify on write, JSON.parse on read.
    const row = {
      id: 'ex1',
      name: body.name,
      category: body.category,
      equipment: JSON.stringify(body.equipment_groups),
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
    // equipment_groups (decision #28) is the source of truth; `equipment` is a
    // derived read-only summary string.
    expect(out.equipment_groups).toEqual([['Barbell'], ['Bench']]);
    expect(out.equipment).toBe('Barbell + Bench');
  });

  it('drops mismatched-length step_times as garbage', () => {
    const body = normalizeExerciseBody({
      name: 'X',
      how_to: ['a', 'b', 'c'],
      step_times: [1, 2], // wrong length
    });
    expect(body.step_times).toEqual([]);
  });

  it('keeps a well-formed http(s) video_url, trimmed', () => {
    const body = normalizeExerciseBody({ name: 'X', video_url: '  https://www.youtube.com/watch?v=abc123  ' });
    expect(body.video_url).toBe('https://www.youtube.com/watch?v=abc123');

    const row = { id: 'ex1', name: 'X', muscles_worked: '[]', how_to: '[]', step_times: '[]', tags: '[]', video_url: body.video_url, created_at: 't1', updated_at: 't1' };
    expect(rowToExercise(row).video_url).toBe('https://www.youtube.com/watch?v=abc123');
  });

  it('drops a non-http(s) or malformed video_url to null', () => {
    expect(normalizeExerciseBody({ name: 'X', video_url: 'not a url' }).video_url).toBeNull();
    expect(normalizeExerciseBody({ name: 'X', video_url: 'ftp://example.com/x' }).video_url).toBeNull();
    expect(normalizeExerciseBody({ name: 'X', video_url: '' }).video_url).toBeNull();
    expect(normalizeExerciseBody({ name: 'X' }).video_url).toBeNull();
  });

  it('rowToExercise defaults a missing video_url column to null', () => {
    const row = { id: 'ex1', name: 'X', muscles_worked: '[]', how_to: '[]', step_times: '[]', tags: '[]', created_at: 't1', updated_at: 't1' };
    expect(rowToExercise(row).video_url).toBeNull();
  });
});

describe('equipment_groups (decision #28 — AND-of-ORs, restores #25, reverses #26)', () => {
  it('normalizeExerciseBody: an AND-of-ORs grouped list', () => {
    const body = normalizeExerciseBody({ name: 'X', equipment_groups: [['Barbell'], ['Squat Rack']] });
    expect(body.equipment_groups).toEqual([['Barbell'], ['Squat Rack']]);
  });

  it('normalizeEquipmentGroups: trims and drops blank/non-string items, dedupes within a group, drops empty groups', () => {
    expect(
      normalizeEquipmentGroups([
        [' Barbell ', 'Barbell', '', null, 42, '  '],
        ['Bench'],
        ['', null],
      ])
    ).toEqual([['Barbell'], ['Bench']]);
  });

  it('normalizeEquipmentGroups: a bare flat array (not array-of-arrays) treats each item as its own group', () => {
    expect(normalizeEquipmentGroups(['Barbell', 'Bench'])).toEqual([['Barbell'], ['Bench']]);
  });

  it('empty/missing equipment_groups normalizes to []', () => {
    const body = normalizeExerciseBody({ name: 'X' });
    expect(body.equipment_groups).toEqual([]);
  });

  it('normalizeEquipmentGroups: non-array input coerces to []', () => {
    expect(normalizeEquipmentGroups('Barbell')).toEqual([]);
    expect(normalizeEquipmentGroups(null)).toEqual([]);
    expect(normalizeEquipmentGroups(undefined)).toEqual([]);
  });

  it('rowToExercise coerces a legacy bare scalar row on read: "Barbell" -> [["Barbell"]]', () => {
    const row = {
      id: 'ex1',
      name: 'X',
      equipment: 'Barbell', // legacy scalar, not JSON
      muscles_worked: '[]',
      how_to: '[]',
      step_times: '[]',
      tags: '[]',
      created_at: 't1',
      updated_at: 't1',
    };
    const out = rowToExercise(row);
    expect(out.equipment_groups).toEqual([['Barbell']]);
    expect(out.equipment).toBe('Barbell');
  });

  it('rowToExercise coerces legacy "Bodyweight"/"None"/blank scalars to []', () => {
    const base = { id: 'ex1', name: 'X', muscles_worked: '[]', how_to: '[]', step_times: '[]', tags: '[]', created_at: 't1', updated_at: 't1' };
    expect(rowToExercise({ ...base, equipment: 'Bodyweight' }).equipment_groups).toEqual([]);
    expect(rowToExercise({ ...base, equipment: 'None' }).equipment_groups).toEqual([]);
    expect(rowToExercise({ ...base, equipment: '' }).equipment_groups).toEqual([]);
    expect(rowToExercise({ ...base, equipment: null }).equipment_groups).toEqual([]);
    expect(rowToExercise({ ...base, equipment: null }).equipment).toBe('Bodyweight');
  });

  it('rowToExercise upgrades a decision #26 flat string[] row: each item its own required group', () => {
    const row = {
      id: 'ex1',
      name: 'X',
      equipment: JSON.stringify(['Barbell', 'Bench']),
      muscles_worked: '[]',
      how_to: '[]',
      step_times: '[]',
      tags: '[]',
      created_at: 't1',
      updated_at: 't1',
    };
    const out = rowToExercise(row);
    expect(out.equipment_groups).toEqual([['Barbell'], ['Bench']]);
    expect(out.equipment).toBe('Barbell + Bench');
  });

  it('rowToExercise reads an already-grouped string[][] row as-is (idempotent)', () => {
    const row = {
      id: 'ex1',
      name: 'X',
      equipment: JSON.stringify([['Dip Station', 'Bench']]),
      muscles_worked: '[]',
      how_to: '[]',
      step_times: '[]',
      tags: '[]',
      created_at: 't1',
      updated_at: 't1',
    };
    const out = rowToExercise(row);
    expect(out.equipment_groups).toEqual([['Dip Station', 'Bench']]);
    // The canonical formatter always parenthesizes a multi-item OR group, even
    // as the sole group (matches the client formatter byte-for-byte).
    expect(out.equipment).toBe('(Dip Station or Bench)');
  });

  it('safeParseEquipmentGroups: an already-grouped array JSON passes through cleaned', () => {
    expect(safeParseEquipmentGroups(JSON.stringify([['Barbell'], ['Bench']]))).toEqual([['Barbell'], ['Bench']]);
  });

  it('safeParseEquipmentGroups: upgrades a legacy flat string[] JSON value', () => {
    expect(safeParseEquipmentGroups(JSON.stringify(['Barbell', 'Bench']))).toEqual([['Barbell'], ['Bench']]);
  });

  // Robustness (QA): garbage inputs must never throw. The write path
  // (normalizeEquipmentGroups) keeps only clean strings; the read path
  // (safeParseEquipmentGroups) defensively coerces any prior/tampered column shape.
  it('normalizeEquipmentGroups: drops non-string garbage without crashing', () => {
    expect(normalizeEquipmentGroups([[42, {}, ['nested'], NaN, null, undefined]])).toEqual([]);
    expect(normalizeEquipmentGroups([[{ a: 1 }, 'Barbell', 7]])).toEqual([['Barbell']]);
  });

  it('normalizeEquipmentGroups: handles a huge grouped array without crashing', () => {
    const huge = Array.from({ length: 100000 }, (_, i) => ['x' + (i % 3)]);
    expect(normalizeEquipmentGroups(huge)).toHaveLength(100000);
  });

  it('safeParseEquipmentGroups: deeply-nested / mixed / huge JSON never throws', () => {
    // one level of grouping only — deeper nesting yields no strings, not a crash
    expect(safeParseEquipmentGroups(JSON.stringify([[['Barbell']], [['Bench']]]))).toEqual([]);
    // string[][] with stray non-strings inside groups have them dropped
    expect(safeParseEquipmentGroups(JSON.stringify([['Barbell', 7], [null, 'Bench']]))).toEqual([['Barbell'], ['Bench']]);
    // flat array with mixed junk keeps only string items, each its own group
    expect(safeParseEquipmentGroups(JSON.stringify(['Barbell', 5, null, { x: 1 }]))).toEqual([['Barbell']]);
    // a huge flat array does not throw — each item upgrades to its own
    // single-item group (decision #26 -> #28), so all 100000 groups survive.
    const hugeJson = JSON.stringify(Array.from({ length: 100000 }, (_, i) => 'x' + (i % 2)));
    expect(safeParseEquipmentGroups(hugeJson)).toHaveLength(100000);
  });

  it('safeParseEquipmentGroups: bare non-array JSON (number/object) coerces defensively, no throw', () => {
    // Only reachable if the column was tampered/legacy — the write path can never
    // store these. Must not crash; result is a best-effort scalar coercion.
    expect(safeParseEquipmentGroups('42')).toEqual([['42']]);
    expect(safeParseEquipmentGroups(JSON.stringify({ foo: 'bar' }))).toEqual([['[object Object]']]);
  });
});

describe('formatEquipmentGroups (canonical summary formatter, decision #28)', () => {
  it('formats an AND of single-item groups joined with " + "', () => {
    expect(formatEquipmentGroups([['Barbell'], ['Bench']])).toBe('Barbell + Bench');
  });

  it('formats a multi-item OR group with parens and "or" (even as the sole group)', () => {
    expect(formatEquipmentGroups([['Dip Station', 'Bench']])).toBe('(Dip Station or Bench)');
  });

  it('formats a mix of AND and OR groups', () => {
    expect(formatEquipmentGroups([['Barbell'], ['Flat Bench', 'Adjustable Bench']])).toBe(
      'Barbell + (Flat Bench or Adjustable Bench)'
    );
  });

  it('returns "Bodyweight" for an empty/all-blank input', () => {
    expect(formatEquipmentGroups([])).toBe('Bodyweight');
    expect(formatEquipmentGroups([[''], ['   ']])).toBe('Bodyweight');
    expect(formatEquipmentGroups(null)).toBe('Bodyweight');
  });

  it('trims items before filtering blanks', () => {
    expect(formatEquipmentGroups([[' Barbell ', '  '], ['Bench']])).toBe('Barbell + Bench');
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

  describe('gym_id (decision #18: null = "Any gym", no FK enforcement)', () => {
    it('defaults to null on create when omitted', () => {
      const body = normalizeWorkoutBody({ title: 'X', exercises: [] });
      expect(body.gym_id).toBeNull();
    });

    it('trims a provided gym_id and round-trips through rowToWorkout', () => {
      const body = normalizeWorkoutBody({ title: 'X', gym_id: '  gym-123  ', exercises: [] });
      expect(body.gym_id).toBe('gym-123');

      const row = {
        id: 'w1',
        title: body.title,
        type: 'Strength',
        category: 'Strength',
        favorite: 0,
        est_minutes: 0,
        image: null,
        gym_id: body.gym_id,
        exercises: JSON.stringify(body.exercises),
        created_at: 't1',
        updated_at: 't1',
      };
      expect(rowToWorkout(row).gym_id).toBe('gym-123');
    });

    it('coerces an empty string or missing gym_id to null', () => {
      expect(normalizeWorkoutBody({ title: 'X', gym_id: '', exercises: [] }).gym_id).toBeNull();
      expect(normalizeWorkoutBody({ title: 'X', gym_id: '   ', exercises: [] }).gym_id).toBeNull();
    });

    it('patch semantics: omitting gym_id preserves the existing value', () => {
      const existingRow = {
        title: 'Leg Day',
        type: 'Strength',
        category: 'Legs',
        favorite: 0,
        image: null,
        gym_id: 'gym-abc',
        exercises: JSON.stringify([{ exercise_id: 'e1', sets: 3, reps: 8, rest: 60 }]),
      };
      const merged = normalizeWorkoutBody({ favorite: true }, existingRow);
      expect(merged.gym_id).toBe('gym-abc');
    });

    it('patch semantics: explicitly sending gym_id: null clears it back to Any gym', () => {
      const existingRow = {
        title: 'Leg Day',
        type: 'Strength',
        category: 'Legs',
        favorite: 0,
        image: null,
        gym_id: 'gym-abc',
        exercises: JSON.stringify([{ exercise_id: 'e1', sets: 3, reps: 8, rest: 60 }]),
      };
      const merged = normalizeWorkoutBody({ gym_id: null }, existingRow);
      expect(merged.gym_id).toBeNull();
    });

    it('rowToWorkout defaults a missing gym_id column to null', () => {
      const row = {
        id: 'w1',
        title: 'X',
        type: 'Strength',
        category: 'Strength',
        favorite: 0,
        est_minutes: 0,
        image: null,
        exercises: '[]',
        created_at: 't1',
        updated_at: 't1',
      };
      expect(rowToWorkout(row).gym_id).toBeNull();
    });
  });
});

describe('gym normalize -> row -> rowToGym round trip', () => {
  it('trims name, coerces favorite, and cleans equipment[] (dedupe/trim/garbage-drop)', () => {
    const body = normalizeGymBody({
      name: '  Home Gym  ',
      favorite: 1,
      image: '  ',
      equipment: ['Dumbbells', ' Dumbbells ', '  Kettlebells  ', '', null, 42, { foo: 'bar' }, 'Kettlebells'],
    });

    expect(body.name).toBe('Home Gym');
    expect(body.favorite).toBe(true);
    expect(body.image).toBeNull();
    // trimmed, deduped, non-strings dropped, blanks dropped
    expect(body.equipment).toEqual(['Dumbbells', 'Kettlebells']);

    const row = {
      id: 'g1',
      name: body.name,
      favorite: body.favorite ? 1 : 0,
      image: body.image,
      equipment: JSON.stringify(body.equipment),
      created_at: 't1',
      updated_at: 't1',
    };
    const out = rowToGym(row);
    expect(out.equipment).toEqual(['Dumbbells', 'Kettlebells']);
    expect(out.favorite).toBe(true);
    expect(out.image).toBeNull();
  });

  it('normalizeGymBody merges partial updates onto an existing row (favorite-only PUT)', () => {
    const existingRow = {
      name: 'Commercial Gym',
      favorite: 0,
      image: null,
      equipment: JSON.stringify(['Barbell', 'Squat rack']),
    };
    const merged = normalizeGymBody({ favorite: true }, existingRow);
    expect(merged.name).toBe('Commercial Gym');
    expect(merged.equipment).toEqual(['Barbell', 'Squat rack']);
    expect(merged.favorite).toBe(true);
  });

  it('rejects an empty/whitespace-only name as blank (route 400s on this)', () => {
    expect(normalizeGymBody({ name: '   ' }).name).toBe('');
    expect(normalizeGymBody({}).name).toBe('');
  });

  it('rowToGym falls back to [] equipment on corrupted JSON', () => {
    const row = { id: 'g1', name: 'X', favorite: 0, image: null, equipment: '{not json', created_at: 't1', updated_at: 't1' };
    expect(rowToGym(row).equipment).toEqual([]);
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
