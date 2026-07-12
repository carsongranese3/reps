// Muscle heat-map support (decision #19). Maps the app's free-text
// `muscles_worked` names onto a small canonical set of body "regions" that
// the MuscleMap SVG knows how to draw, and computes 0..1 heat intensities
// for a single exercise or an aggregated workout.

import type { Exercise, WorkoutExerciseEntry } from '../types';

export type FrontRegion =
  | 'chest'
  | 'front_delts'
  | 'biceps'
  | 'forearms'
  | 'abs'
  | 'obliques'
  | 'quads'
  | 'adductors';

export type BackRegion =
  | 'traps'
  | 'rear_delts'
  | 'lats'
  | 'triceps'
  | 'upper_back'
  | 'lower_back'
  | 'glutes'
  | 'hamstrings'
  | 'calves';

export type Region = FrontRegion | BackRegion;

export const FRONT_REGIONS: FrontRegion[] = [
  'chest',
  'front_delts',
  'biceps',
  'forearms',
  'abs',
  'obliques',
  'quads',
  'adductors',
];

export const BACK_REGIONS: BackRegion[] = [
  'traps',
  'rear_delts',
  'lats',
  'triceps',
  'upper_back',
  'lower_back',
  'glutes',
  'hamstrings',
  'calves',
];

export const ALL_REGIONS: Region[] = [...FRONT_REGIONS, ...BACK_REGIONS];

/**
 * Case-insensitive map from the seed library's free-text `muscles_worked`
 * names to one or more canonical regions. Unknown names are ignored (they
 * simply don't light anything up). Keys are lowercased at lookup time.
 */
export const MUSCLE_ALIASES: Record<string, Region[]> = {
  chest: ['chest'],
  triceps: ['triceps'],
  biceps: ['biceps'],
  'front delts': ['front_delts'],
  shoulders: ['front_delts'],
  'rear delts': ['rear_delts'],
  lats: ['lats'],
  'upper back': ['upper_back', 'lats'],
  'lower back': ['lower_back'],
  traps: ['traps'],
  quads: ['quads'],
  hamstrings: ['hamstrings'],
  glutes: ['glutes'],
  calves: ['calves'],
  core: ['abs'],
  abs: ['abs'],
  obliques: ['obliques'],
  forearms: ['forearms'],
  'hip flexors': ['quads'],
  adductors: ['adductors'],

  // Additional free-text names present in the seed library beyond the
  // canonical list in the spec (server/seed.js) — mapped forgivingly.
  'upper chest': ['chest'],
  'side delts': ['front_delts'],
  'mid-back': ['upper_back', 'lats'],
  spine: ['lower_back'],
  legs: ['quads', 'hamstrings', 'calves'],
  // 'cardiovascular system' has no sensible body region — intentionally
  // left unmapped (ignored), per the forgiving/best-effort matching rule.
};

/** Resolve a list of free-text muscle names to the (deduped) canonical
 * regions they map to. Case-insensitive; unmapped names are dropped. */
export function musclesToRegions(names: string[]): Region[] {
  const set = new Set<Region>();
  for (const raw of names) {
    const key = raw.trim().toLowerCase();
    const mapped = MUSCLE_ALIASES[key];
    if (mapped) {
      for (const region of mapped) set.add(region);
    }
  }
  return Array.from(set);
}

/** Full-intensity (1.0) map for a single exercise's `muscles_worked` — used
 * on the exercise-detail heat map, where there's no "how many exercises hit
 * this" count, just "does this exercise hit it". */
export function exerciseIntensities(muscles_worked: string[]): Partial<Record<Region, number>> {
  const regions = musclesToRegions(muscles_worked);
  const out: Partial<Record<Region, number>> = {};
  for (const region of regions) out[region] = 1;
  return out;
}

/**
 * Aggregate a workout's muscle heat map: for each exercise entry, resolve
 * its exercise via `exerciseMap`, map its muscles to regions (deduped per
 * exercise so one exercise never double-counts a region), then count how
 * many exercises hit each region across the whole workout. Counts are
 * normalized to 0..1 by dividing by the max count so the most-hit region(s)
 * read as "full heat" and everything else scales relative to it.
 */
export function aggregateWorkoutIntensities(
  exercises: WorkoutExerciseEntry[],
  exerciseMap: Record<string, Exercise>
): Partial<Record<Region, number>> {
  const counts: Partial<Record<Region, number>> = {};

  for (const entry of exercises) {
    const ex = exerciseMap[entry.exercise_id];
    if (!ex) continue;
    const regions = musclesToRegions(ex.muscles_worked ?? []);
    for (const region of regions) {
      counts[region] = (counts[region] ?? 0) + 1;
    }
  }

  const max = Math.max(0, ...Object.values(counts));
  if (max === 0) return {};

  const intensities: Partial<Record<Region, number>> = {};
  for (const [region, count] of Object.entries(counts)) {
    intensities[region as Region] = count / max;
  }
  return intensities;
}

/** True when there's at least one region with heat — used to decide whether
 * to render the MuscleMap or fall back to the plain color block. */
export function hasMappableMuscles(intensities: Partial<Record<Region, number>>): boolean {
  return Object.keys(intensities).length > 0;
}
