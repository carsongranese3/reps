// Assign-to-gym Build-picker filtering (decision #18) + equipment substitutes
// (decision #24). Client-side only — the server stores exercise/gym `equipment` as
// plain strings. The managed Equipment list (decision #23) is the source of the
// picker options AND, per decision #24, the source of the "also counts as"
// substitutes used when matching — no more hardcoded substitutes map.

const BODYWEIGHT_LABELS = new Set(['', 'none', 'bodyweight']);

/** lowercase, trim, strip a single trailing "s" — tolerant of minor plural drift. */
export function normalizeEquipmentTerm(value: string): string {
  const trimmed = value.trim().toLowerCase();
  return trimmed.endsWith('s') ? trimmed.slice(0, -1) : trimmed;
}

/**
 * Build a normalized `name -> substitutes[]` lookup from the managed equipment
 * list. Both the key and each substitute value are normalized so callers can look
 * up with `normalizeEquipmentTerm(item)` directly.
 */
export function buildSubstitutesMap(
  equipmentList: { name: string; substitutes: string[] }[] | undefined | null
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const item of equipmentList ?? []) {
    const key = normalizeEquipmentTerm(item.name);
    if (!key) continue;
    const subs = (item.substitutes ?? [])
      .map((s) => normalizeEquipmentTerm(s))
      .filter((s) => s.length > 0);
    map.set(key, subs);
  }
  return map;
}

/**
 * TRUE if the exercise is doable at the gym. `gym === null` ("Any gym") and bodyweight
 * exercises (empty/None/Bodyweight) are always TRUE. Otherwise the gym's equipment set
 * is expanded through each item's managed `substitutes` (decision #24), and the
 * exercise's equipment must exactly match (after normalization) something in that
 * expanded set.
 *
 * `equipmentList` is the managed Equipment list (or a prebuilt substitutes map) used to
 * expand the gym's equipment. If omitted/empty, falls back to plain exact matching (no
 * substitutes expansion) so nothing crashes when the list hasn't loaded yet.
 */
export function exerciseDoableAtGym(
  exercise: { equipment: string | null },
  gym: { equipment: string[] } | null,
  equipmentList?: { name: string; substitutes: string[] }[] | Map<string, string[]> | null
): boolean {
  if (!gym) return true;
  const raw = (exercise.equipment ?? '').trim().toLowerCase();
  if (BODYWEIGHT_LABELS.has(raw)) return true;

  const need = normalizeEquipmentTerm(exercise.equipment ?? '');
  if (!need) return true;

  const substitutesMap =
    equipmentList instanceof Map ? equipmentList : buildSubstitutesMap(equipmentList);

  // Everything the gym effectively provides, expanded by each item's substitutes.
  const provided = new Set<string>();
  for (const item of gym.equipment) {
    const n = normalizeEquipmentTerm(item);
    if (!n) continue;
    provided.add(n);
    for (const sub of substitutesMap.get(n) ?? []) provided.add(sub);
  }
  return provided.has(need);
}

/** The exercise's equipment "needs" label for a flag/note — falls back to "Bodyweight". */
export function equipmentNeedsLabel(exercise: { equipment: string | null }): string {
  const need = (exercise.equipment ?? '').trim();
  return need === '' ? 'Bodyweight' : need;
}
