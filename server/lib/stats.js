// History stat tiles + weekly-volume chart (GET /api/stats). Reuses the same
// streak helper as week.js so the value is identical wherever it's shown.

import { rowToSession } from './serialize.js';
import { computeStreak, buildResolutionCtx, getSessionDatesSet, mondayOfWeek, addDaysUTC, formatDateOnly } from './week.js';

export function computeStats(db, todayStr) {
  const ctx = buildResolutionCtx(db);
  const sessionDatesSet = getSessionDatesSet(db);
  const streak = computeStreak(ctx, sessionDatesSet, todayStr);

  const sessions = db.prepare('SELECT * FROM sessions').all().map(rowToSession);
  const monthPrefix = todayStr.slice(0, 7); // YYYY-MM

  let thisMonthCount = 0;
  let prsThisMonth = 0;
  let totalVolumeAllTime = 0;
  for (const s of sessions) {
    totalVolumeAllTime += s.total_volume || 0;
    if (s.date.slice(0, 7) === monthPrefix) {
      thisMonthCount++;
      prsThisMonth += (s.prs || []).length;
    }
  }

  // Weekly volume, oldest -> newest, ending with the current week. Starts at the
  // first week that has a logged session (so there are no empty leading weeks) —
  // or the current week if nothing is logged yet — capped at the last 8 weeks.
  const currentMonday = mondayOfWeek(todayStr);
  let minDateStr = null;
  for (const s of sessions) {
    const d = s.date.slice(0, 10);
    if (!minDateStr || d < minDateStr) minDateStr = d;
  }
  const earliestMonday = minDateStr ? mondayOfWeek(minDateStr) : currentMonday;
  const weeksSinceStart = Math.round(
    (Date.parse(formatDateOnly(currentMonday)) - Date.parse(formatDateOnly(earliestMonday))) / (7 * 86400000)
  );
  const startW = Math.max(0, Math.min(7, weeksSinceStart));
  const weekly_volume = [];
  for (let w = startW; w >= 0; w--) {
    const start = addDaysUTC(currentMonday, -7 * w);
    const end = addDaysUTC(start, 6);
    const startStr = formatDateOnly(start);
    const endStr = formatDateOnly(end);
    let volume = 0;
    for (const s of sessions) {
      const dStr = s.date.slice(0, 10);
      if (dStr >= startStr && dStr <= endStr) volume += s.total_volume || 0;
    }
    weekly_volume.push({ week_start: startStr, week_end: endStr, volume: Math.round(volume * 100) / 100 });
  }

  return {
    this_month_count: thisMonthCount,
    total_volume: Math.round(totalVolumeAllTime * 100) / 100,
    current_streak: streak,
    prs_this_month: prsThisMonth,
    weekly_volume,
  };
}
