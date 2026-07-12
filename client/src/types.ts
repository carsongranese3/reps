// Entity types — mirror docs/data-shapes.md field names exactly.

export type ExerciseCategory = 'Strength' | 'Push' | 'Pull' | 'Legs' | 'Cardio' | 'Mobility';
export type WorkoutType = 'Strength' | 'Hypertrophy' | 'Power';
export type WorkoutCategory = ExerciseCategory;
export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export type DayStatus = 'done' | 'rest' | 'missed' | 'planned';

export interface LastTime {
  session_id: string;
  date: string;
  weight: number | null;
  reps: number | null;
}

export interface Exercise {
  id: string;
  name: string;
  category: ExerciseCategory | null;
  equipment: string | null;
  difficulty: string | null;
  muscles_worked: string[];
  how_to: string[];
  step_times: number[];
  tags: string[];
  image: string | null;
  source_url: string | null;
  video_url: string | null;
  has_demo: boolean;
  created_at: string;
  updated_at: string;
  // Only present on GET /api/exercises/:id
  last_time?: LastTime | null;
}

export interface ExerciseInput {
  name: string;
  category?: ExerciseCategory | null;
  equipment?: string | null;
  difficulty?: string | null;
  muscles_worked?: string[];
  how_to?: string[];
  step_times?: number[];
  tags?: string[];
  image?: string | null;
  source_url?: string | null;
  video_url?: string | null;
  draft_token?: string;
}

/** Shape returned by POST /api/exercises/autofill — merges into the add/edit form,
 * overwriting current values (decision #16). `video_url` is a YouTube demo link. */
export interface ExerciseAutofillSuggestion {
  category: ExerciseCategory | null;
  equipment: string | null;
  difficulty: string | null;
  muscles_worked: string[];
  how_to: string[];
  tags: string[];
  video_url: string | null;
}

export interface WorkoutExerciseEntry {
  exercise_id: string;
  sets: number;
  reps: string | number;
  rest: number;
}

export interface Workout {
  id: string;
  title: string;
  type: WorkoutType;
  category: WorkoutCategory;
  favorite: boolean;
  est_minutes: number;
  image: string | null;
  exercises: WorkoutExerciseEntry[];
  exercise_count: number;
  created_at: string;
  updated_at: string;
}

export interface WorkoutInput {
  title: string;
  type?: WorkoutType;
  category?: WorkoutCategory;
  favorite?: boolean;
  image?: string | null;
  exercises: WorkoutExerciseEntry[];
}

export interface Gym {
  id: string;
  name: string;
  favorite: boolean;
  image: string | null;
  equipment: string[];
  created_at: string;
  updated_at: string;
}

export interface GymInput {
  name: string;
  favorite?: boolean;
  image?: string | null;
  equipment?: string[];
}

export interface PlanEntry {
  day: Weekday;
  workout: Workout | null;
}

export interface SessionSetActual {
  weight: number | null;
  reps: number | null;
  completed: boolean;
}

export interface SessionEntry {
  exercise_id: string;
  exercise_name?: string;
  sets: SessionSetActual[];
}

export interface SessionPR {
  exercise_id: string;
  exercise_name: string;
  prior_best: number;
  new_best: number;
  delta: number;
}

export interface Session {
  id: string;
  workout_id: string | null;
  workout_title: string;
  workout_category: string | null;
  date: string;
  duration_sec: number;
  total_sets: number;
  total_volume: number;
  distance_km: number | null;
  entries: SessionEntry[];
  prs: SessionPR[];
  created_at: string;
}

export interface SessionInput {
  workout_id?: string;
  workout_title?: string;
  date?: string;
  duration_sec?: number;
  started_at?: string;
  ended_at?: string;
  distance_km?: number | null;
  entries: SessionEntry[];
}

export interface WeekDay {
  day: Weekday;
  date: string;
  status: DayStatus;
  is_today: boolean;
  workout: Workout | null;
}

export interface WeekPayload {
  today_date: string;
  n: number;
  m: number;
  streak: number;
  days: WeekDay[];
  today: WeekDay;
}

export interface WeeklyVolumePoint {
  week_start: string;
  week_end: string;
  volume: number;
}

export interface StatsPayload {
  this_month_count: number;
  total_volume: number;
  current_streak: number;
  prs_this_month: number;
  weekly_volume: WeeklyVolumePoint[];
}

export interface ApiErrorShape {
  error: { message: string };
}
