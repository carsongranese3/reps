import { describe, it, expect } from 'vitest';
import {
  MUSCLE_ALIASES,
  musclesToRegions,
  exerciseIntensities,
  aggregateWorkoutIntensities,
  hasMappableMuscles,
} from './muscles';
import type { Exercise, WorkoutExerciseEntry } from '../types';

// Distinct muscles_worked strings present in server/seed.js
const SEED_MUSCLES = [
  'Quads', 'Glutes', 'Hamstrings', 'Core', 'Lower back', 'Calves',
  'Chest', 'Triceps', 'Front delts', 'Upper chest', 'Shoulders',
  'Side delts', 'Lats', 'Biceps', 'Mid-back', 'Rear delts',
  'Upper back', 'Spine', 'Legs', 'Cardiovascular system',
];

// Minimal exercise fixtures mirroring server/seed.js muscles_worked
function ex(id: string, muscles: string[]): Exercise {
  return { id, muscles_worked: muscles } as unknown as Exercise;
}
const EX: Record<string, Exercise> = {
  back_squat: ex('back_squat', ['Quads', 'Glutes', 'Hamstrings', 'Core']),
  rdl: ex('rdl', ['Hamstrings', 'Glutes', 'Lower back']),
  leg_press: ex('leg_press', ['Quads', 'Glutes', 'Hamstrings']),
  lunge: ex('lunge', ['Quads', 'Glutes', 'Hamstrings']),
  leg_curl: ex('leg_curl', ['Hamstrings']),
  calf_raise: ex('calf_raise', ['Calves']),
  bench: ex('bench', ['Chest', 'Triceps', 'Front delts']),
  incline: ex('incline', ['Upper chest', 'Front delts', 'Triceps']),
  ohp: ex('ohp', ['Shoulders', 'Triceps', 'Upper chest']),
  cable_fly: ex('cable_fly', ['Chest', 'Front delts']),
  dips: ex('dips', ['Chest', 'Triceps', 'Front delts']),
  lat_raise: ex('lat_raise', ['Side delts']),
  skull: ex('skull', ['Triceps']),
  cable_row: ex('cable_row', ['Mid-back', 'Lats', 'Biceps']),
  run: ex('run', ['Legs', 'Cardiovascular system']),
};

function entries(...ids: string[]): WorkoutExerciseEntry[] {
  return ids.map((exercise_id) => ({ exercise_id } as unknown as WorkoutExerciseEntry));
}

describe('MUSCLE_ALIASES seed coverage', () => {
  it('maps every distinct seed muscle except Cardiovascular system', () => {
    const unmapped = SEED_MUSCLES.filter((m) => !MUSCLE_ALIASES[m.toLowerCase()]);
    expect(unmapped).toEqual(['Cardiovascular system']);
  });
});

describe('musclesToRegions', () => {
  it('is case/whitespace insensitive and dedupes', () => {
    expect(musclesToRegions(['  ChEsT ', 'chest'])).toEqual(['chest']);
  });
  it('drops unknown names without crashing', () => {
    expect(musclesToRegions(['Cardiovascular system', 'nonsense'])).toEqual([]);
  });
  it('dedupes when two names map to the same region (Mid-back + Lats -> lats once)', () => {
    const regions = musclesToRegions(['Mid-back', 'Lats', 'Biceps']);
    expect(regions.filter((r) => r === 'lats')).toHaveLength(1);
    expect(new Set(regions)).toEqual(new Set(['upper_back', 'lats', 'biceps']));
  });
});

describe('exerciseIntensities', () => {
  it('sets every mapped region to 1.0', () => {
    expect(exerciseIntensities(['Chest', 'Triceps', 'Front delts'])).toEqual({
      chest: 1, triceps: 1, front_delts: 1,
    });
  });
  it('empty for only-unmappable muscles', () => {
    expect(exerciseIntensities(['Cardiovascular system'])).toEqual({});
  });
});

describe('aggregateWorkoutIntensities — Leg Day', () => {
  const intensities = aggregateWorkoutIntensities(
    entries('back_squat', 'rdl', 'leg_press', 'lunge', 'leg_curl', 'calf_raise'),
    EX
  );
  it('hamstrings is the peak at 1.0', () => {
    expect(intensities.hamstrings).toBe(1);
  });
  it('glutes and quads are strong (0.8, 0.6)', () => {
    expect(intensities.glutes).toBeCloseTo(0.8);
    expect(intensities.quads).toBeCloseTo(0.6);
  });
  it('all values are within 0..1', () => {
    for (const v of Object.values(intensities)) {
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe('aggregateWorkoutIntensities — Push Day A', () => {
  const intensities = aggregateWorkoutIntensities(
    entries('bench', 'incline', 'ohp', 'cable_fly', 'dips', 'lat_raise', 'skull'),
    EX
  );
  it('front_delts peaks at 1.0, chest & triceps strong', () => {
    expect(intensities.front_delts).toBe(1);
    expect(intensities.chest).toBeCloseTo(5 / 6);
    expect(intensities.triceps).toBeCloseTo(5 / 6);
  });
});

describe('aggregateWorkoutIntensities — dedupe & edges', () => {
  it('counts a region once per exercise even if two muscles map to it', () => {
    // cable_row: Mid-back(->upper_back,lats) + Lats(->lats) -> lats counted once
    const intensities = aggregateWorkoutIntensities(entries('cable_row'), EX);
    expect(intensities.lats).toBe(1); // not 2/max
  });
  it('empty workout -> {} (fallback path)', () => {
    expect(aggregateWorkoutIntensities([], EX)).toEqual({});
    expect(hasMappableMuscles(aggregateWorkoutIntensities([], EX))).toBe(false);
  });
  it('missing exercise in map is skipped, no crash', () => {
    expect(aggregateWorkoutIntensities(entries('ghost'), EX)).toEqual({});
  });
  it('workout of only-unmappable muscles -> false', () => {
    const onlyCardio = { c: ex('c', ['Cardiovascular system']) };
    expect(hasMappableMuscles(aggregateWorkoutIntensities(entries('c'), onlyCardio))).toBe(false);
  });
});
