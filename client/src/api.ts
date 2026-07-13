// Typed API client — the ONLY place in the app that calls fetch().
// Every function here maps 1:1 to a route documented in docs/api.md.
// Components never call fetch ad hoc; they go through these functions
// (usually via the React Query hooks in src/hooks/*).

import type {
  Equipment,
  EquipmentInput,
  Exercise,
  ExerciseAutofillSuggestion,
  ExerciseInput,
  Gym,
  GymInput,
  PlanEntry,
  ScheduleDayBody,
  ScheduleEntry,
  Session,
  SessionInput,
  SessionUpdateInput,
  StatsPayload,
  Weekday,
  WeekPayload,
  Workout,
  WorkoutInput,
} from './types';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers:
      init?.body && !(init.body instanceof FormData)
        ? { 'Content-Type': 'application/json', ...(init.headers ?? {}) }
        : init?.headers,
    ...init,
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error?.message) message = body.error.message;
    } catch {
      // ignore parse failure, use default message
    }
    throw new ApiError(message, res.status);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

// ---------------------------------------------------------------------------
// Exercises
// ---------------------------------------------------------------------------

export function listExercises(params?: { q?: string; category?: string }): Promise<Exercise[]> {
  return request(`/exercises${qs({ q: params?.q, category: params?.category })}`);
}

export function getExercise(id: string): Promise<Exercise> {
  return request(`/exercises/${id}`);
}

export function createExercise(body: ExerciseInput): Promise<Exercise> {
  return request(`/exercises`, { method: 'POST', body: JSON.stringify(body) });
}

export function updateExercise(id: string, body: Partial<ExerciseInput>): Promise<Exercise> {
  return request(`/exercises/${id}`, { method: 'PUT', body: JSON.stringify(body) });
}

export function deleteExercise(id: string): Promise<{ deleted: true; id: string }> {
  return request(`/exercises/${id}`, { method: 'DELETE' });
}

export function uploadExerciseDemoDraft(
  file: File
): Promise<{ draft_token: string; filename: string }> {
  const fd = new FormData();
  fd.append('file', file);
  return request(`/exercises/demo/draft`, { method: 'POST', body: fd });
}

export function uploadExerciseDemo(id: string, file: File): Promise<Exercise> {
  const fd = new FormData();
  fd.append('file', file);
  return request(`/exercises/${id}/demo`, { method: 'POST', body: fd });
}

export function exerciseDemoUrl(id: string): string {
  return `/api/exercises/${id}/demo`;
}

export function autofillExercise(name: string): Promise<{ suggestion: ExerciseAutofillSuggestion }> {
  return request(`/exercises/autofill`, { method: 'POST', body: JSON.stringify({ name }) });
}

// ---------------------------------------------------------------------------
// Workouts
// ---------------------------------------------------------------------------

export function listWorkouts(params?: {
  q?: string;
  category?: string;
  favorite?: boolean;
}): Promise<Workout[]> {
  return request(
    `/workouts${qs({ q: params?.q, category: params?.category, favorite: params?.favorite })}`
  );
}

export function getWorkout(id: string): Promise<Workout> {
  return request(`/workouts/${id}`);
}

export function createWorkout(body: WorkoutInput): Promise<Workout> {
  return request(`/workouts`, { method: 'POST', body: JSON.stringify(body) });
}

export function updateWorkout(id: string, body: Partial<WorkoutInput>): Promise<Workout> {
  return request(`/workouts/${id}`, { method: 'PUT', body: JSON.stringify(body) });
}

export function deleteWorkout(id: string): Promise<{ deleted: true; id: string }> {
  return request(`/workouts/${id}`, { method: 'DELETE' });
}

// ---------------------------------------------------------------------------
// Gyms
// ---------------------------------------------------------------------------

export function listGyms(params?: { q?: string; favorite?: boolean }): Promise<Gym[]> {
  return request(`/gyms${qs({ q: params?.q, favorite: params?.favorite })}`);
}

export function getGym(id: string): Promise<Gym> {
  return request(`/gyms/${id}`);
}

export function createGym(body: GymInput): Promise<Gym> {
  return request(`/gyms`, { method: 'POST', body: JSON.stringify(body) });
}

export function updateGym(id: string, body: Partial<GymInput>): Promise<Gym> {
  return request(`/gyms/${id}`, { method: 'PUT', body: JSON.stringify(body) });
}

export function deleteGym(id: string): Promise<{ deleted: true; id: string }> {
  return request(`/gyms/${id}`, { method: 'DELETE' });
}

// ---------------------------------------------------------------------------
// Equipment (decision #23 — managed master list feeding exercise/gym pickers)
// ---------------------------------------------------------------------------

export function listEquipment(q?: string): Promise<Equipment[]> {
  return request(`/equipment${qs({ q })}`);
}

export function getEquipment(id: string): Promise<Equipment> {
  return request(`/equipment/${id}`);
}

export function createEquipment(body: EquipmentInput): Promise<Equipment> {
  return request(`/equipment`, { method: 'POST', body: JSON.stringify(body) });
}

export function updateEquipment(id: string, body: Partial<EquipmentInput>): Promise<Equipment> {
  return request(`/equipment/${id}`, { method: 'PUT', body: JSON.stringify(body) });
}

export function deleteEquipment(id: string): Promise<{ deleted: true; id: string }> {
  return request(`/equipment/${id}`, { method: 'DELETE' });
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

export function getPlan(): Promise<PlanEntry[]> {
  return request(`/plan`);
}

export function setPlanDay(day: Weekday, workoutId: string | null): Promise<PlanEntry> {
  return request(`/plan/${day}`, {
    method: 'PUT',
    body: JSON.stringify({ workout_id: workoutId }),
  });
}

// ---------------------------------------------------------------------------
// Schedule (specs/schedule.md, decision #21 — date-specific overrides over `plan`)
// ---------------------------------------------------------------------------

export function getSchedule(
  from: string,
  to: string,
  today: string
): Promise<{ schedule: ScheduleEntry[] }> {
  return request(`/schedule${qs({ from, to, today })}`);
}

export function setScheduleDay(
  date: string,
  body: ScheduleDayBody,
  today: string
): Promise<ScheduleEntry> {
  return request(`/schedule/${date}${qs({ today })}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export function listSessions(params?: {
  limit?: number;
  offset?: number;
}): Promise<{ sessions: Session[]; total: number }> {
  return request(`/sessions${qs({ limit: params?.limit, offset: params?.offset })}`);
}

export function getSession(id: string): Promise<Session> {
  return request(`/sessions/${id}`);
}

export function createSession(body: SessionInput): Promise<Session> {
  return request(`/sessions`, { method: 'POST', body: JSON.stringify(body) });
}

export function updateSession(id: string, body: SessionUpdateInput): Promise<Session> {
  return request(`/sessions/${id}`, { method: 'PUT', body: JSON.stringify(body) });
}

export function deleteSession(id: string): Promise<{ deleted: true; id: string }> {
  return request(`/sessions/${id}`, { method: 'DELETE' });
}

// ---------------------------------------------------------------------------
// Derived / home
// ---------------------------------------------------------------------------

export function getWeek(today: string): Promise<WeekPayload> {
  return request(`/week${qs({ today })}`);
}

export function getStats(today: string): Promise<StatsPayload> {
  return request(`/stats${qs({ today })}`);
}

export function getHealth(): Promise<{ ok: true }> {
  return request(`/health`);
}
