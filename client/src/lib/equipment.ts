// Common gym equipment checklist for the Gym form's equipment picker (decision #17).
// Client-side constant only — the server stores `equipment` as a plain string[], so any
// custom string typed in the form is just as valid as one from this list.

export const COMMON_EQUIPMENT: string[] = [
  'Barbell',
  'Dumbbells',
  'Kettlebells',
  'Cable machine',
  'Squat rack',
  'Bench',
  'Adjustable bench',
  'Smith machine',
  'Leg press',
  'Leg curl machine',
  'Treadmill',
  'Rowing machine',
  'Elliptical',
  'Pull-up bar',
  'Dip station',
  'Resistance bands',
  'Medicine ball',
  'Battle ropes',
];

// Assign-to-gym + Build picker filtering (decision #18).

const BODYWEIGHT_LABELS = new Set(['', 'none', 'bodyweight']);

/** lowercase, trim, strip a single trailing "s" — bridges exercise vocab ("Dumbbell",
 * "Cable") against the gym equipment checklist ("Dumbbells", "Cable machine"). */
function normalizeEquipmentTerm(value: string): string {
  const trimmed = value.trim().toLowerCase();
  return trimmed.endsWith('s') ? trimmed.slice(0, -1) : trimmed;
}

/** Whether one normalized equipment term "loosely matches" another — substring match
 * either direction, after normalization. */
function looseEquipmentMatch(a: string, b: string): boolean {
  const na = normalizeEquipmentTerm(a);
  const nb = normalizeEquipmentTerm(b);
  if (!na || !nb) return false;
  return na.includes(nb) || nb.includes(na);
}

/** TRUE if the exercise is doable at the gym. `gym === null` ("Any gym") is always TRUE.
 * Bodyweight exercises (empty/None/Bodyweight equipment) are always TRUE. Otherwise TRUE
 * iff the exercise's equipment loosely matches any item in the gym's equipment list. */
export function exerciseDoableAtGym(
  exercise: { equipment: string | null },
  gym: { equipment: string[] } | null
): boolean {
  if (!gym) return true;
  const need = (exercise.equipment ?? '').trim().toLowerCase();
  if (BODYWEIGHT_LABELS.has(need)) return true;
  return gym.equipment.some((item) => looseEquipmentMatch(exercise.equipment ?? '', item));
}

/** The exercise's equipment "needs" label for a flag/note — falls back to "Bodyweight". */
export function equipmentNeedsLabel(exercise: { equipment: string | null }): string {
  const need = (exercise.equipment ?? '').trim();
  return need === '' ? 'Bodyweight' : need;
}
