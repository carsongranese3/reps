// In-progress session persistence — decisions.md #5: only COMPLETED sessions are
// ever sent to the server. A session being actively tracked lives here in
// localStorage so the user can navigate away and Resume (and so a reload doesn't
// lose progress). Abandoning never creates a server session.

import type { Workout } from '../types';

const STORAGE_KEY = 'reps:active-session:v1';

export interface ActiveSetEntry {
  weight: number | null;
  reps: number | null;
  completed: boolean;
}

export interface ActiveExerciseEntry {
  exercise_id: string;
  exercise_name: string;
  target_sets: number;
  target_reps: string | number;
  target_rest: number;
  last_time: { weight: number | null; reps: number | null } | null;
  sets: ActiveSetEntry[];
}

/**
 * Tracking style, chosen via the mode picker shown after Begin (decisions.md #20).
 * Persisted on the session so Pause/Resume keeps the chosen style; undefined means
 * the picker hasn't been answered yet (a freshly-started session, or a resumed one
 * from before this field existed).
 */
export type TrackingMode = 'checklist' | 'guided';

export interface ActiveSession {
  workout_id: string;
  workout_title: string;
  workout_category: string | null;
  started_at: string;
  mode?: TrackingMode;
  entries: ActiveExerciseEntry[];
}

export function loadActiveSession(): ActiveSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ActiveSession;
  } catch {
    return null;
  }
}

export function saveActiveSession(session: ActiveSession): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearActiveSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}

function parseTargetReps(reps: string | number): number | null {
  if (typeof reps === 'number') return reps;
  const match = String(reps).match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

export function buildActiveSessionFromWorkout(
  workout: Workout,
  lastTimes: Record<string, { weight: number | null; reps: number | null } | null>,
  exerciseNames: Record<string, string>
): ActiveSession {
  return {
    workout_id: workout.id,
    workout_title: workout.title,
    workout_category: workout.category,
    started_at: new Date().toISOString(),
    entries: workout.exercises.map((e) => {
      const lastTime = lastTimes[e.exercise_id] ?? null;
      const targetReps = parseTargetReps(e.reps);
      return {
        exercise_id: e.exercise_id,
        exercise_name: exerciseNames[e.exercise_id] ?? 'Removed exercise',
        target_sets: e.sets,
        target_reps: e.reps,
        target_rest: e.rest,
        last_time: lastTime,
        sets: Array.from({ length: e.sets }, () => ({
          weight: lastTime?.weight ?? null,
          reps: targetReps,
          completed: false,
        })),
      };
    }),
  };
}
