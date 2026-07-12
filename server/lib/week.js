// This Week / streak / N-of-M computation — normative rules in specs/reps.md §2.1
// and decision #4. A single set of helpers here is reused by both GET /api/week
// and GET /api/stats so the streak value is guaranteed identical everywhere
// (per the spec's "must be identical wherever returned" requirement).
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

export function getSessionDatesSet(db) {
  const rows = db.prepare('SELECT date FROM sessions').all();
  const set = new Set();
  for (const r of rows) set.add(String(r.date).slice(0, 10));
  return set;
}

// Normative day status per spec §2.1 + decision #4: a completed session on ANY
// calendar day (including an off-plan/nominal-Rest day) marks that day Done —
// Done is evaluated before falling back to Rest. Only planned, non-rest, undone
// days can be Missed/Planned.
export function dayStatus(dateStr, todayStr, planMap, sessionDatesSet) {
  const isDone = sessionDatesSet.has(dateStr);
  if (isDone) return 'done';
  const wd = weekdayKeyOf(toDateOnlyUTC(dateStr));
  const planned = planMap[wd];
  if (!planned) return 'rest';
  if (dateStr < todayStr) return 'missed';
  return 'planned';
}

export function computeStreak(planMap, sessionDatesSet, todayStr) {
  let streak = 0;
  let cursor = toDateOnlyUTC(todayStr);
  for (let i = 0; i < STREAK_LOOKBACK_DAYS; i++) {
    const dStr = formatDateOnly(cursor);
    const status = dayStatus(dStr, todayStr, planMap, sessionDatesSet);
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

export function computeWeekPayload(db, todayStr) {
  const planMap = getPlanMap(db);
  const sessionDatesSet = getSessionDatesSet(db);
  const monday = mondayOfWeek(todayStr);

  const days = [];
  let m = 0;
  let n = 0;
  for (let i = 0; i < 7; i++) {
    const date = addDaysUTC(monday, i);
    const dStr = formatDateOnly(date);
    const wd = WEEKDAY_ORDER[i];
    const planned = planMap[wd];
    const status = dayStatus(dStr, todayStr, planMap, sessionDatesSet);
    const isToday = dStr === todayStr;
    // M = planned, non-rest days in the week (regardless of done/missed).
    if (planned) m++;
    // N = days in the week that are Done — decision #4: an off-plan completed
    // session still counts toward N even though it never adds to M.
    if (status === 'done') n++;
    days.push({
      day: wd,
      date: dStr,
      status,
      is_today: isToday,
      workout: planned ? rowToWorkout(planned) : null,
    });
  }

  const streak = computeStreak(planMap, sessionDatesSet, todayStr);
  const today = days.find((d) => d.is_today) || null;

  return { today_date: todayStr, n, m, streak, days, today };
}
