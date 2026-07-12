// Client-side mirror of the server's duration estimate (decisions.md #11), so
// Build can show a live "~X min" while editing. The server always recomputes and
// is authoritative on save — this is only for immediate UI feedback.

const PER_REP_SECONDS = 3.5;

export function avgReps(reps: string | number): number {
  if (typeof reps === 'number') return reps;
  const match = String(reps).match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/);
  if (match) {
    return (Number(match[1]) + Number(match[2])) / 2;
  }
  const n = Number(reps);
  return Number.isFinite(n) ? n : 8;
}

export function estimateMinutes(
  entries: { sets: number; reps: string | number; rest: number }[]
): number {
  const totalSeconds = entries.reduce((sum, e) => {
    const reps = avgReps(e.reps);
    return sum + e.sets * (reps * PER_REP_SECONDS + e.rest);
  }, 0);
  const minutes = totalSeconds / 60;
  return Math.round(minutes / 5) * 5;
}
