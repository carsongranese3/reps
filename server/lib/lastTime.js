// "Last time: 140 lb x 8" — most recent completed session's actuals for a given
// exercise (Exercise detail panel + Track flow prefill). Looks at the most
// recent session (by date desc) that contains the exercise, and within it takes
// the last completed set logged (falling back to the last set with a weight if
// none were checked off).

import { safeParseArray } from './serialize.js';

export function getLastTime(db, exerciseId) {
  const rows = db.prepare('SELECT id, date, entries FROM sessions ORDER BY date DESC, created_at DESC').all();
  for (const row of rows) {
    const entries = safeParseArray(row.entries);
    const entry = entries.find((e) => e.exercise_id === exerciseId);
    if (!entry || !Array.isArray(entry.sets) || entry.sets.length === 0) continue;

    const completedSets = entry.sets.filter((s) => s.completed);
    const pick = completedSets.length ? completedSets[completedSets.length - 1] : entry.sets[entry.sets.length - 1];
    if (!pick) continue;

    return {
      session_id: row.id,
      date: row.date,
      weight: pick.weight ?? null,
      reps: pick.reps ?? null,
    };
  }
  return null;
}
