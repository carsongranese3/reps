// Assign-to-gym Build-picker filtering (decision #18) + equipment substitutes
// (decision #24) + per-exercise AND-of-ORs equipment groups (decision #28, restores
// #25 — supersedes #26's flat list). Client-side only — the server stores gym
// `equipment` as plain strings, and exercise equipment as `equipment_groups: string[][]`
// (outer = AND, inner = OR). The managed Equipment list (decision #23) is the source of
// the picker options AND, per decision #24, the source of the "also counts as"
// substitutes used when matching. The two mechanisms coexist: central `substitutes` is a
// global "also counts as"; per-exercise OR groups are alternatives specific to that
// movement (e.g. Dips: Dip Station or Bench).

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
 * Canonical AND-of-ORs equipment-groups formatter. Must match the server's
 * formatter byte-for-byte (decision #28) since it powers both the derived
 * `equipment` summary string returned by the API and the live form preview.
 *
 * `[]` (or all-empty groups) -> "Bodyweight". Each group renders as a bare item
 * when it has one item, or "(a or b)" when it has multiple.  Groups join with " + ".
 */
export function formatEquipmentGroups(groups: string[][]): string {
  const clean = groups
    .map((g) => g.map((s) => s.trim()).filter(Boolean))
    .filter((g) => g.length > 0);
  if (!clean.length) return 'Bodyweight';
  return clean.map((g) => (g.length > 1 ? `(${g.join(' or ')})` : g[0])).join(' + ');
}

/**
 * TRUE if the exercise is doable at the gym. `gym === null` ("Any gym") and bodyweight
 * exercises (empty/all-empty `equipment_groups`) are always TRUE. Otherwise, for each
 * required AND-group, the gym's equipment set (expanded through each item's managed
 * `substitutes`, decision #24) must provide at least one item in that group (OR); the
 * exercise is doable only if every group is satisfied (AND).
 *
 * `equipmentList` is the managed Equipment list (or a prebuilt substitutes map) used to
 * expand the gym's equipment. If omitted/empty, falls back to plain exact matching (no
 * substitutes expansion) so nothing crashes when the list hasn't loaded yet.
 */
export function exerciseDoableAtGym(
  exercise: { equipment_groups: string[][] },
  gym: { equipment: string[] } | null,
  equipmentList?: { name: string; substitutes: string[] }[] | Map<string, string[]> | null
): boolean {
  if (!gym) return true;

  const groups = (exercise.equipment_groups ?? [])
    .map((g) =>
      (g ?? [])
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && !BODYWEIGHT_LABELS.has(s.toLowerCase()))
    )
    .filter((g) => g.length > 0);
  if (!groups.length) return true; // bodyweight / no equipment

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

  // AND across groups, OR within a group — at least one item per group must be provided.
  return groups.every((group) => group.some((item) => provided.has(normalizeEquipmentTerm(item))));
}

/** The exercise's equipment "needs" label for a flag/note — falls back to "Bodyweight". */
export function equipmentNeedsLabel(exercise: { equipment_groups: string[][] }): string {
  return formatEquipmentGroups(exercise.equipment_groups ?? []);
}
