// Local-date helpers. "Today" and week boundaries are always device-local time
// (spec §1) — never use UTC getters here.

import type { Weekday } from '../types';

export const WEEKDAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const WEEKDAY_LABELS: Record<Weekday, string> = {
  mon: 'MON',
  tue: 'TUE',
  wed: 'WED',
  thu: 'THU',
  fri: 'FRI',
  sat: 'SAT',
  sun: 'SUN',
};
export const WEEKDAY_FULL: Record<Weekday, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};
export const WEEKDAY_SHORT: Record<Weekday, string> = {
  mon: 'M',
  tue: 'T',
  wed: 'W',
  thu: 'T',
  fri: 'F',
  sat: 'S',
  sun: 'S',
};

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Device-local calendar date as YYYY-MM-DD. */
export function todayLocalDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** ISO-ish local wall-clock string (no timezone conversion) for POST /api/sessions `date`. */
export function nowLocalIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.000Z`;
}

/** Same ISO-ish wall-clock shape as `nowLocalIso()`, but for an arbitrary chosen
 * YYYY-MM-DD (e.g. a backdated manual log). Fixed at a mid-day time since a manual
 * log has no real clock time; the server only reads the first 10 chars anyway. */
export function localIsoForDate(dateStr: string, hour = 12): string {
  return `${dateStr}T${pad(hour)}:00:00.000Z`;
}

/** Mon-first JS day index (0=Mon..6=Sun) from a Date's local getDay() (0=Sun..6=Sat). */
export function mondayIndex(jsDay: number): number {
  return (jsDay + 6) % 7;
}

/** Returns the date-of-month number for each weekday of the week containing `dateStr` (YYYY-MM-DD, local). */
export function weekDatesFor(dateStr: string): Record<Weekday, string> {
  const [y, m, d] = dateStr.split('-').map(Number);
  const ref = new Date(y, m - 1, d);
  const mIdx = mondayIndex(ref.getDay());
  const monday = new Date(y, m - 1, d - mIdx);
  const out = {} as Record<Weekday, string>;
  WEEKDAYS.forEach((wd, i) => {
    const dt = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    out[wd] = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  });
  return out;
}

export function dayOfMonth(dateStr: string): number {
  return Number(dateStr.split('-')[2]);
}

/** Mon-first Weekday key for a local YYYY-MM-DD date string. */
export function weekdayOfDate(dateStr: string): Weekday {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return WEEKDAYS[mondayIndex(dt.getDay())];
}

/** Local YYYY-MM-DD for an arbitrary Date (no UTC conversion). */
export function formatLocalDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export interface MonthGridCell {
  date: string;
  inMonth: boolean;
}

/** Whole-weeks grid (Monday-first) covering `month` (0-indexed) of `year` — 4 to 6
 * week-rows depending on the month's length and starting weekday (specs/schedule.md §2.1). */
export function getMonthGrid(year: number, month: number): MonthGridCell[] {
  const firstOfMonth = new Date(year, month, 1);
  const firstWeekday = mondayIndex(firstOfMonth.getDay());
  const gridStart = new Date(year, month, 1 - firstWeekday);

  const lastOfMonth = new Date(year, month + 1, 0);
  const lastWeekday = mondayIndex(lastOfMonth.getDay());
  const gridEnd = new Date(
    lastOfMonth.getFullYear(),
    lastOfMonth.getMonth(),
    lastOfMonth.getDate() + (6 - lastWeekday)
  );

  const cells: MonthGridCell[] = [];
  const cur = new Date(gridStart);
  while (cur <= gridEnd) {
    cells.push({ date: formatLocalDate(cur), inMonth: cur.getMonth() === month });
    cur.setDate(cur.getDate() + 1);
  }
  return cells;
}

export function monthYearLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}

/** Full weekday date label, e.g. "Thursday, Jul 16" (used by the Schedule day editor title). */
export function fullDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

/** Human label used in History rows: Today / Yesterday / weekday / date. */
export function relativeDayLabel(isoOrDateStr: string, todayStr: string): string {
  const dateStr = isoOrDateStr.slice(0, 10);
  if (dateStr === todayStr) return 'Today';
  const [ty, tm, td] = todayStr.split('-').map(Number);
  const today = new Date(ty, tm - 1, td);
  const [y, m, d] = dateStr.split('-').map(Number);
  const target = new Date(y, m - 1, d);
  const diffDays = Math.round((today.getTime() - target.getTime()) / 86400000);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays >= 0 && diffDays < 7) {
    return target.toLocaleDateString(undefined, { weekday: 'short' });
  }
  return target.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function formatDurationMin(durationSec: number): string {
  return `${Math.round(durationSec / 60)} min`;
}

export function formatVolume(volume: number): string {
  if (volume >= 1000) return `${(volume / 1000).toFixed(1)}k lb`;
  return `${Math.round(volume)} lb`;
}
