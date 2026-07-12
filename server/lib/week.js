// This Week / streak / N-of-M computation — normative rules in specs/reps.md §2.1,
// redefined by specs/schedule.md §4-§5 (decision #21). A single set of helpers here
// is reused by GET /api/week, GET /api/stats, and GET/PUT /api/schedule so the
// streak/resolution values are guaranteed identical everywhere.
//
// Calendar dates are handled as plain 'YYYY-MM-DD' strings and manipulated via
// UTC-based Date objects purely as a date-only calculator (no timezone
// conversion) — this avoids DST/local-TZ bugs while treating the string as the
// authoritative "local day" the client means. See docs/api.md for the `today`
// query param contract that lets the client's local date drive this.

import { rowToWorkout } from './serialize.js';

export const WEEKDAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

// How far back the streak walk will look before giving up (defensive cap so an
// all-rest plan with no sessions can't loop forever). ~2 years is generous for
// a personal streak counter.
const STREAK_LOOKBACK_DAYS = 730;

export function toDateOnlyUTC(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function formatDateOnly(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDaysUTC(date, n) {
  const copy = new Date(date.getTime());
  copy.setUTCDate(copy.getUTCDate() + n);
  return copy;
}

export function weekdayKeyOf(date) {
  const jsDay = date.getUTCDay(); // 0=Sun..6=Sat
  const idx = (jsDay + 6) % 7; // 0=Mon..6=Sun
  return WEEKDAY_ORDER[idx];
}

export function defaultTodayStr() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isValidDateStr(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(toDateOnlyUTC(s).getTime());
}

export function mondayOfWeek(dateStr) {
  const date = toDateOnlyUTC(dateStr);
  const idx = WEEKDAY_ORDER.indexOf(weekdayKeyOf(date));
  return addDaysUTC(date, -idx);
}

// day -> raw workout row (or null for Rest / no plan entry / orphaned reference).
export function getPlanMap(db) {
  const rows = db
    .prepare(
      `SELECT plan.day as _day, workouts.*
       FROM plan LEFT JOIN workouts ON workouts.id = plan.workout_id`
    )
    .all();
  const map = {};
  for (const r of rows) {
    map[r._day] = r.id ? r : null;
  }
  return map;
}

// id -> raw workout row, for resolving schedule.workout_id references.
export function getWorkoutsById(db) {
  const rows = db.prepare('SELECT * FROM workouts').all();
  const map = new Map();
  for (const r of rows) map.set(r.id, r);
  return map;
}

// date -> ordered array of raw schedule rows for that date (sort_order asc,
// created_at/rowid as a stable tiebreak). Loads the whole table once — this is
// a single-user personal app, so the schedule table stays small.
export function getScheduleMap(db) {
  const rows = db
    .prepare('SELECT * FROM schedule ORDER BY date ASC, sort_order ASC, created_at ASC, rowid ASC')
    .all();
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.date)) map.set(r.date, []);
    map.get(r.date).push(r);
  }
  return map;
}

// Bundles the three maps the resolution rule needs so callers only query once
// per request even when resolving many dates (a week, a month calendar, or the
// streak's day-by-day walk-back).
export function buildResolutionCtx(db) {
  return {
    planMap: getPlanMap(db),
    scheduleMap: getScheduleMap(db),
    workoutsById: getWorkoutsById(db),
  };
}

// date -> array of workout_ids of that date's COMPLETED sessions (one entry per
// session, duplicates kept — needed for the k/j matching in computeDayNM).
export function getSessionsByDate(db) {
  const rows = db.prepare('SELECT date, workout_id FROM sessions').all();
  const map = new Map();
  for (const r of rows) {
    const d = String(r.date).slice(0, 10);
    if (!map.has(d)) map.set(d, []);
    map.get(d).push(r.workout_id ?? null);
  }
  return map;
}

export function getSessionDatesSet(db) {
  const rows = db.prepare('SELECT date FROM sessions').all();
  const set = new Set();
  for (const r of rows) set.add(String(r.date).slice(0, 10));
  return set;
}

// ---------------------------------------------------------------------------
// Resolution rule (specs/schedule.md §4) — the single source of truth for what
// a calendar date's planned workouts are. Every prior "read plan[weekday]"
// lookup is replaced by this.
//
//   rows = schedule rows where schedule.date == date
//   if rows is non-empty (date is "set"):
//      if the only row is a Rest-marker (workout_id == NULL): []  (explicit Rest)
//      else: [workout for each row with non-NULL workout_id, ordered by
//             sort_order, resolved via workouts table, skipping dangling ids]
//   else (unset): fall back to plan[weekday(date)] -> 0 or 1 workout
// ---------------------------------------------------------------------------

// Returns { source: 'schedule'|'rest'|'template', is_set: boolean, workoutRows: rawWorkoutRow[] }.
export function resolveScheduleForDate(dateStr, ctx) {
  const { planMap, scheduleMap, workoutsById } = ctx;
  const rows = scheduleMap.get(dateStr);

  if (rows && rows.length > 0) {
    const isRestMarker = rows.length === 1 && rows[0].workout_id == null;
    if (isRestMarker) {
      return { source: 'rest', is_set: true, workoutRows: [] };
    }
    const workoutRows = rows
      .filter((r) => r.workout_id != null)
      .map((r) => workoutsById.get(r.workout_id))
      .filter(Boolean); // dangling workout_id (deleted workout) -> skipped, §7
    return { source: 'schedule', is_set: true, workoutRows };
  }

  const wd = weekdayKeyOf(toDateOnlyUTC(dateStr));
  const planned = planMap[wd];
  return { source: 'template', is_set: false, workoutRows: planned ? [planned] : [] };
}

// Convenience: just the ordered list of raw workout rows planned for a date
// (0..n). This is `plannedWorkoutsForDate` from the spec.
export function plannedWorkoutsForDate(dateStr, ctx) {
  return resolveScheduleForDate(dateStr, ctx).workoutRows;
}

// Normative day status (spec §5.1 / decision #4): a completed session on ANY
// calendar day (including an off-plan/nominal-Rest day) marks that day Done —
// Done is evaluated before falling back to Rest. Only planned, non-rest, undone
// days can be Missed/Planned. Now resolved via plannedWorkoutsForDate instead of
// a raw plan[weekday] lookup.
export function dayStatus(dateStr, todayStr, sessionDatesSet, ctx) {
  const isDone = sessionDatesSet.has(dateStr);
  if (isDone) return 'done';
  const planned = plannedWorkoutsForDate(dateStr, ctx);
  if (planned.length === 0) return 'rest';
  if (dateStr < todayStr) return 'missed';
  return 'planned';
}

export function computeStreak(ctx, sessionDatesSet, todayStr) {
  let streak = 0;
  let cursor = toDateOnlyUTC(todayStr);
  for (let i = 0; i < STREAK_LOOKBACK_DAYS; i++) {
    const dStr = formatDateOnly(cursor);
    const status = dayStatus(dStr, todayStr, sessionDatesSet, ctx);
    if (dStr === todayStr && status === 'planned') {
      // Today is planned-but-not-yet-done: doesn't break the streak until it
      // becomes Missed at the next local midnight. Skip it and keep walking.
      cursor = addDaysUTC(cursor, -1);
      continue;
    }
    if (status === 'missed') break;
    if (status === 'done') streak++;
    // 'rest' is a no-op: doesn't increment, doesn't break.
    cursor = addDaysUTC(cursor, -1);
  }
  return streak;
}

// N-of-M at the workout level (spec §5.2). `plannedWorkouts` is the resolved
// Workout[] for the date (rowToWorkout'd); `sessionWorkoutIds` is that date's
// completed sessions' workout_ids (one entry per session, nulls kept).
//
//   m = |plannedWorkouts|
//   satisfiedCount = Σ over distinct planned workout ids of min(k, j)
//     where k = times that workout is planned that date, j = completed
//     sessions of that workout that date
//   offPlanCredit = 1 iff some completed session's workout_id doesn't match
//     ANY planned workout that date at all (i.e. genuinely unrelated to the
//     day's plan) — NOT triggered by extra/duplicate completions of a workout
//     that IS already planned (those just can't push satisfiedCount past k).
export function computeDayNM(plannedWorkouts, sessionWorkoutIds) {
  const m = plannedWorkouts.length;

  const plannedCounts = new Map();
  for (const w of plannedWorkouts) {
    plannedCounts.set(w.id, (plannedCounts.get(w.id) || 0) + 1);
  }

  const sessionCounts = new Map();
  for (const wid of sessionWorkoutIds) {
    const key = wid ?? '__null__';
    sessionCounts.set(key, (sessionCounts.get(key) || 0) + 1);
  }

  let satisfied = 0;
  for (const [wid, k] of plannedCounts) {
    const j = sessionCounts.get(wid) || 0;
    satisfied += Math.min(k, j);
  }

  let offPlanCredit = 0;
  for (const wid of sessionCounts.keys()) {
    if (!plannedCounts.has(wid)) {
      offPlanCredit = 1;
      break;
    }
  }

  return { m, n: satisfied + offPlanCredit };
}

// The resolved schedule entry for one date — shared by GET/PUT /api/schedule.
// { date, source, is_set, workouts, status }
export function computeScheduleEntry(dateStr, todayStr, ctx, sessionDatesSet) {
  const { source, is_set, workoutRows } = resolveScheduleForDate(dateStr, ctx);
  const workouts = workoutRows.map(rowToWorkout);
  const status = dayStatus(dateStr, todayStr, sessionDatesSet, ctx);
  return { date: dateStr, source, is_set, workouts, status };
}

export function computeWeekPayload(db, todayStr) {
  const ctx = buildResolutionCtx(db);
  const sessionsByDate = getSessionsByDate(db);
  const sessionDatesSet = new Set(sessionsByDate.keys());
  const monday = mondayOfWeek(todayStr);

  const days = [];
  let m = 0;
  let n = 0;
  for (let i = 0; i < 7; i++) {
    const date = addDaysUTC(monday, i);
    const dStr = formatDateOnly(date);
    const wd = WEEKDAY_ORDER[i];
    const plannedRows = plannedWorkoutsForDate(dStr, ctx);
    const workouts = plannedRows.map(rowToWorkout);
    const status = dayStatus(dStr, todayStr, sessionDatesSet, ctx);
    const isToday = dStr === todayStr;

    const sessionWorkoutIds = sessionsByDate.get(dStr) || [];
    const dayNM = computeDayNM(workouts, sessionWorkoutIds);
    m += dayNM.m;
    n += dayNM.n;

    days.push({
      day: wd,
      date: dStr,
      status,
      is_today: isToday,
      workouts,
    });
  }

  const streak = computeStreak(ctx, sessionDatesSet, todayStr);
  const today = days.find((d) => d.is_today) || null;

  return { today_date: todayStr, n, m, streak, days, today };
}
