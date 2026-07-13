// PR detection — decision #10: a PR is a completed set whose weight exceeds the
// prior best weight EVER logged for that exercise (max weight, any rep count).
// First-time-ever logging an exercise is not a PR (nothing to exceed).

import { safeParseArray } from './serialize.js';

// Map of exercise_id -> heaviest completed weight ever logged, from sessions
// already committed to the DB (call BEFORE inserting the new session).
//
// `excludeSessionId` (optional) omits one session from the "prior best" scan —
// used when editing an existing session so its own (soon-to-be-overwritten)
// entries never count toward their own prior best. Without this, re-saving a
// session unchanged would let it "beat" itself for a spurious PR, or an edited
// session could be squashed against its own now-stale rows.
export function computePriorBestMap(db, excludeSessionId = null) {
  const rows = excludeSessionId
    ? db.prepare('SELECT entries FROM sessions WHERE id != ?').all(excludeSessionId)
    : db.prepare('SELECT entries FROM sessions').all();
  const map = new Map();
  for (const row of rows) {
    const entries = safeParseArray(row.entries);
    for (const entry of entries) {
      for (const set of entry.sets || []) {
        if (set.completed && typeof set.weight === 'number' && set.weight > 0) {
          const prev = map.get(entry.exercise_id) || 0;
          if (set.weight > prev) map.set(entry.exercise_id, set.weight);
        }
      }
    }
  }
  return map;
}

// entries: normalized session entries (see normalizeSessionEntries). Returns an
// array of { exercise_id, exercise_name, prior_best, new_best, delta } for every
// exercise in this session whose best set beat the prior all-time best.
export function detectPRs(entries, priorBestMap) {
  const prs = [];
  for (const entry of entries) {
    let newBest = 0;
    for (const set of entry.sets || []) {
      if (set.completed && typeof set.weight === 'number' && set.weight > newBest) {
        newBest = set.weight;
      }
    }
    if (newBest <= 0) continue;
    const priorBest = priorBestMap.get(entry.exercise_id) || 0;
    if (priorBest > 0 && newBest > priorBest) {
      prs.push({
        exercise_id: entry.exercise_id,
        exercise_name: entry.exercise_name,
        prior_best: priorBest,
        new_best: newBest,
        delta: Math.round((newBest - priorBest) * 100) / 100,
      });
    }
  }
  return prs;
}
