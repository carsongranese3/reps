// History stat tiles + weekly-volume chart (GET /api/stats). Reuses the same
// streak helper as week.js so the value is identical wherever it's shown.

import { rowToSession } from './serialize.js';
import { computeStreak, getPlanMap, getSessionDatesSet, mondayOfWeek, addDaysUTC, formatDateOnly } from './week.js';

export function computeStats(db, todayStr) {
  const planMap = getPlanMap(db);
  const sessionDatesSet = getSessionDatesSet(db);
  const streak = computeStreak(planMap, sessionDatesSet, todayStr);

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

  // Last 8 Mon-Sun weeks, oldest -> newest, ending with the current week.
  const currentMonday = mondayOfWeek(todayStr);
  const weekly_volume = [];
  for (let w = 7; w >= 0; w--) {
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
