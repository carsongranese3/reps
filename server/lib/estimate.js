// Build "N exercises · ~X min" duration estimate — decision #11 in docs/decisions.md.
// est_minutes = round_to_5( Σ over exercises [ sets × (avg_reps × 3.5s + rest_s) ] / 60 )

const PER_REP_SECONDS = 3.5;

// reps may be a number (8) or a string range ("8-10", "8–10", "8 to 10").
export function parseRepsRange(reps) {
  if (typeof reps === 'number' && Number.isFinite(reps)) {
    return { min: reps, max: reps };
  }
  const str = String(reps ?? '').trim();
  const rangeMatch = str.match(/(\d+(?:\.\d+)?)\s*(?:-|–|—|to)\s*(\d+(?:\.\d+)?)/i);
  if (rangeMatch) {
    return { min: Number(rangeMatch[1]), max: Number(rangeMatch[2]) };
  }
  const singleMatch = str.match(/(\d+(?:\.\d+)?)/);
  if (singleMatch) {
    const n = Number(singleMatch[1]);
    return { min: n, max: n };
  }
  return { min: 0, max: 0 };
}

export function avgReps(reps) {
  const { min, max } = parseRepsRange(reps);
  return (min + max) / 2;
}

export function computeEstMinutes(exercises) {
  if (!Array.isArray(exercises) || exercises.length === 0) return 0;
  let totalSeconds = 0;
  for (const ex of exercises) {
    const sets = Number(ex.sets) || 0;
    const rest = Number(ex.rest) || 0;
    totalSeconds += sets * (avgReps(ex.reps) * PER_REP_SECONDS + rest);
  }
  const minutes = totalSeconds / 60;
  return Math.round(minutes / 5) * 5;
}
