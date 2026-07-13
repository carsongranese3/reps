// Entity types — mirror docs/data-shapes.md field names exactly.

export type ExerciseCategory = 'Strength' | 'Push' | 'Pull' | 'Legs' | 'Cardio' | 'Mobility';
export type WorkoutType = 'Strength' | 'Hypertrophy' | 'Power';
export type WorkoutCategory = ExerciseCategory;
export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export type DayStatus = 'done' | 'rest' | 'missed' | 'planned';
export type ScheduleSource = 'schedule' | 'template' | 'rest';

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
  gym_id: string | null;
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
  gym_id?: string | null;
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

/** Managed equipment master list (decision #23) — feeds the exercise Equipment
 * datalist and the gym equipment checklist as a suggestion source. */
export interface Equipment {
  id: string;
  name: string;
  /** Other equipment names this item "also counts as" (decision #24) — one-way
   * superset, e.g. "Adjustable bench" -> ["Bench"]. */
  substitutes: string[];
  /** Optional cover-photo URL. */
  image: string | null;
  /** CSS object-position for the cover crop, e.g. "50% 30%" (null = centered). */
  image_pos: string | null;
  /** Cover zoom/scale (null = 1). */
  image_zoom: number | null;
  /** How the cover fills the tile: "cover" (crop, default) or "fill" (stretch to fit). */
  image_fit: 'cover' | 'fill' | null;
  created_at: string;
  updated_at: string;
}

export interface EquipmentInput {
  name: string;
  substitutes?: string[];
  image?: string | null;
  image_pos?: string | null;
  image_zoom?: number | null;
  image_fit?: 'cover' | 'fill' | null;
}

export interface PlanEntry {
  day: Weekday;
  workout: Workout | null;
}

/** GET/PUT /api/schedule resolved entry (specs/schedule.md §6, docs/data-shapes.md). */
export interface ScheduleEntry {
  date: string;
  source: ScheduleSource;
  is_set: boolean;
  workouts: Workout[];
  status: DayStatus;
}

/** PUT /api/schedule/:date body — exactly one of these three forms. */
export type ScheduleDayBody =
  | { workout_ids: string[] }
  | { rest: true }
  | { clear: true };

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

/** PUT /api/sessions/:id body — every field optional; omit to keep the current
 * stored value (decision #22). Typically only `entries` is sent (edit sets). */
export interface SessionUpdateInput {
  entries?: SessionEntry[];
  date?: string;
  duration_sec?: number;
  started_at?: string;
  ended_at?: string;
  distance_km?: number | null;
  workout_id?: string | null;
  workout_title?: string;
  workout_category?: string;
}

export interface WeekDay {
  day: Weekday;
  date: string;
  status: DayStatus;
  is_today: boolean;
  workouts: Workout[];
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
