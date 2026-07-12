# Spec: Schedule — month calendar (date-specific workout planning)

Status: draft (new feature). Extends `specs/reps.md §2.1` (This Week) and the streak / N-of-M rules
there. Binding product decisions: **`docs/decisions.md` #21** (this feature), **#4** (weekly `plan`
= fixed Mon–Sun template; off-plan session counts toward N/streak but not M), **#12** (client passes
`?today=YYYY-MM-DD`; server does no timezone conversion). Field names follow `docs/data-shapes.md`
and `docs/api.md`; exact columns/routes are finalized by the data/backend agents against this spec.

> This screen is **not** in the design prototype (`design/Reps.dc.html`), like the Track flow. Build
> it in the Pantry design language — same theme tokens, cards, chips, category colors, and terracotta
> accent as This Week / Workouts — so it feels native to the app.

---

## 1. Overview

Reps currently plans a week with a **fixed Mon–Sun template** (`plan`): each weekday maps to one
`workout_id` or Rest, and This Week / streak / N-of-M resolve the current week against that template
(`specs/reps.md §2.1`, `GET /api/week`). The template is the same every week.

**Schedule** adds a **month calendar** where the user plans workouts on **specific calendar dates**.
Date-specific entries are **overrides layered on top of the weekly template**: a date that has been
*set* uses its own entries; a date that is *unset* falls back to the weekly template for that weekday.
Multiple workouts may be planned on one day. This Week, today, streak, and N-of-M are re-derived to
resolve every date through override → template fallback and to handle multiple workouts per day.

**The delta in one line:** introduce a `schedule` table of date-keyed overrides and a `/schedule`
month-calendar screen; keep the weekly `plan` template and `GET/PUT /api/plan` exactly as-is as the
baseline; change the resolution used by `GET /api/week`, `GET /api/stats`, and the This Week screen
from "read `plan[weekday]`" to a new `plannedWorkoutsForDate(date)` rule (§4). Existing
`sessions`/History and all other endpoints are unchanged.

### What stays the same (current behavior — do not regress)
- The weekly `plan` template (Mon–Sun), its seed (decision #4 / seed §), and `GET /api/plan` +
  `PUT /api/plan/:day` are unchanged and remain the baseline every unset date falls back to.
- "Today" and week boundaries are device-local; week is **Monday–Sunday** (`specs/reps.md §1`).
- A day is **Done** for the streak/dot when a completed `session` exists on that calendar date
  (decision #4 — including off-plan). Sessions/History are untouched by this feature.
- The PWA, single-user/no-auth, lb-only, and all other rules in `specs/reps.md` still hold.

### What changes (the delta)
- New `schedule` table + `/api/schedule` read/mutate endpoints (§5).
- New `/schedule` screen (Schedule tab under This Week) — month calendar + day editor (§2).
- New normative **resolution rule** `plannedWorkoutsForDate(date)` (§4); This Week, `GET /api/week`,
  and `GET /api/stats` now use it instead of raw `plan[weekday]`.
- **Multiple planned workouts per day** are now possible — the Week payload's per-day `workout`
  (single) becomes `workouts` (array); N-of-M is redefined at the workout level (§4).

---

## 2. Screens & flows

New top-level nav item **Schedule**, placed **directly under This Week** on the desktop sidebar and
(space permitting — see Open Question #4) as a phone tab / entry from This Week. Route **`/schedule`**.
Deep-linking to a specific month is nice-to-have via `/schedule?month=YYYY-MM` (Open Question #5).

### 2.1 Month calendar (`/schedule`)

A standard month grid: a header (month + year, prev/next-month arrows, a **"Today"** button that
jumps to and highlights the current month), a weekday header row **Mon…Sun** (Monday-first, matching
the app's week), and a grid of day cells for the visible month. Leading/trailing cells for the
partial first/last weeks show the adjacent months' dates in a muted style (or are blank — Open
Question #6); only in-month dates are interactive for editing.

Each **day cell** shows:
- The **date number**; **today** is marked (black ring + "TODAY" affordance consistent with the This
  Week rail); **past** dates are subtly de-emphasized; **future** dates normal.
- The date's **resolved planned workouts** via `plannedWorkoutsForDate` (§4) as small
  category-colored pills (workout title, truncated). A day may show **multiple** pills.
- A **visual cue distinguishing override vs template-inherited** entries: date-set (override)
  workouts render **solid**; template-inherited workouts render **muted/dashed** (e.g. reduced
  opacity or a dashed border). A small **"set" marker** (dot/badge) indicates the date has an
  override at all. Rationale: the user must be able to tell, at a glance, which days they've
  personally scheduled versus which are just echoing the weekly template.
- **Rest** state: an explicit Rest override shows a muted **"Rest"** label with the same "set" marker;
  a template-Rest (unset weekday with no template workout) shows a plain **"Rest"** with no marker.
- **Completion overlay** (nice-to-have, reuse week logic): if a completed `session` exists on that
  date, show a **done** check on the cell; a past planned-but-unsatisfied date may show a **missed**
  cue. Purely a read indicator; it does not change how editing works. (If backend defers this,
  the cell still renders correctly from planned data alone — Open Question #7.)

Tapping/clicking an **in-month day cell** opens the **Day editor** (2.2) for that date.

**Acceptance criteria**
- The grid renders the correct weeks for the visible month, Monday-first, with the correct weekday
  columns and correct number of rows (4–6 week-rows).
- Prev/next navigate months without a full reload; "Today" returns to the current month and
  highlights today.
- Each in-month cell shows the workouts resolved by `plannedWorkoutsForDate` — override entries solid
  with a "set" marker, template-inherited entries muted, template-Rest as plain "Rest".
- A day with multiple planned workouts shows multiple pills (or a "+N more" overflow when too many —
  see edge cases).
- Editing a day and returning to the calendar reflects the change immediately (the edited cell, the
  This Week screen, and the streak/N-of-M all update with no manual reload).
- Layout is responsive: desktop shows a full month grid; phone shows a usable month grid (compact
  cells, tap targets ≥ 44px) — do not fork the screen.

**Edge cases**
- **Month with 4/5/6 week-rows** and months starting on Sunday / ending on Monday render correctly;
  no off-by-one on the Monday-first grid.
- **Very full day** (many workouts planned): the cell caps visible pills (e.g. show 2–3 then "+N")
  and the full list is always available in the Day editor.
- **Timezone / local date**: every cell's date is a local `YYYY-MM-DD`; "today", past/future, and the
  This Week window are computed in device-local time (decision #12). The calendar never converts
  timezones; it renders the same local dates the API is keyed on.
- **Dangling workout_id** (a scheduled workout was later deleted): the cell shows a neutral
  **"Workout removed"** chip (or skips it) instead of crashing — mirrors how `plan`/`sessions` handle
  deletion (§7).
- **Empty everywhere** (brand-new user, no overrides, empty template days): all cells show template
  fallback (workouts on the seeded weekdays, "Rest" elsewhere); no error state needed.

### 2.2 Day editor (tap a day)

A panel/sheet (desktop: side panel or modal; phone: bottom sheet) titled with the full date (e.g.
"Thursday, Jul 16"). It shows and edits **that single date's** schedule.

Contents:
- The date's **current resolved workouts** with each workout's title + category. Each entry that is an
  **override** shows a **Remove** control. When the date is **unset** (falling back to the template),
  the panel indicates "Following your weekly plan (<weekday>)" and lists the template's workout (if
  any) read-only, with the actions below available to override it.
- **Add workout** — opens the exercise/workout **library picker** (reuse the Workouts list; searchable,
  category chips) to pick a workout to add to this date. **Multiple** workouts may be added
  (add repeatedly). Adding the first workout converts the date from unset/Rest to a *set* date.
- **Mark Rest** — sets the whole day to an explicit Rest override (overrides the template with
  *nothing*; distinct from an unset date that inherits the template). Removes any workouts on the date.
- **Clear** — removes the date's override entirely, reverting to the weekly template
  (`plannedWorkoutsForDate` falls back). Only meaningful when the date is currently *set*.

Row-operation mapping (product level; see §3 for the table and §5 for endpoints):
- **Add workout W** → insert a schedule row `{ date, workout_id: W }`; if the date currently holds a
  Rest-marker row, that marker is removed first (a date cannot be both Rest and have workouts).
- **Remove workout W** → delete that schedule row. If it was the date's **last** row, the date becomes
  **unset** → it reverts to template fallback (it does **not** become empty/Rest; use **Mark Rest**
  for a truly empty day). This is called out to the user.
- **Mark Rest** → delete all rows for the date, then insert one **Rest-marker** row
  `{ date, workout_id: NULL }`.
- **Clear** → delete all rows for the date (including any Rest-marker) → date unset → template fallback.

**Acceptance criteria**
- Opening the editor on an **unset** date shows the inherited template workout (or template-Rest) and
  offers Add / Mark Rest (Clear is disabled/hidden — nothing to clear).
- Opening the editor on a **set** date shows its override workouts (or "Rest") with Remove per entry,
  and Add / Mark Rest / Clear all available.
- **Add** inserts the chosen workout as an override on that date; multiple adds accumulate; the day
  becomes *set*; This Week/streak/N-of-M recompute.
- **Remove** the last override entry reverts the day to template fallback (verified: the cell shows
  the template workout again), and the user is told this is what "remove all" does vs "Mark Rest".
- **Mark Rest** makes `plannedWorkoutsForDate` return empty for that date (an explicit, marked Rest),
  overriding the template.
- **Clear** returns the date to template fallback; the "set" marker disappears from the cell.
- Every mutation persists immediately (no separate Save step) and is reflected on close.

**Edge cases / empty states**
- **Unset date with a template workout**: editor previews the inherited workout read-only; Add creates
  an override that *replaces* the inherited view for that date (the template is not mutated — the
  weekly `plan` is untouched; only this date is overridden).
- **Unset date whose weekday is template-Rest**: editor shows "Rest (from your weekly plan)"; Add
  creates a workout override; Mark Rest creates an *explicit* Rest override (functionally identical to
  the template here, but now "set" — allowed, low-harm).
- **Add a workout that is later deleted**: the entry becomes a dangling `workout_id` → renders as
  "Workout removed" and can be Removed; resolution skips it (§7).
- **Duplicate workout added twice on one date**: allowed (two entries of the same workout). N-of-M
  treats them as two planned entries (§4). Distinguish rows by id/`sort_order`.
- **Planning the past**: editing a **past** date is **allowed** (e.g. retroactively marking a past
  planned day as Rest, or adding what you actually intended). It changes only *planned* classification
  — it can turn a past **Missed** day into **Rest** (which can extend the streak, since Rest passes
  through) but it can **never** mark a past day **Done**; Done still requires a real completed
  `session`. This is intentional; note it to the user implicitly via the streak recomputing. (See
  Open Question #2 on whether to warn when editing the past.)
- **Editing today**: allowed; today's Today card / rail update live.

---

## 3. Data model (product level; backend-agent finalizes columns)

New table **`schedule`** — date-keyed overrides layered over the `plan` template.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | `crypto.randomUUID()` |
| `date` | TEXT | local calendar date `YYYY-MM-DD` (device-local; no timezone conversion, decision #12) |
| `workout_id` | TEXT, nullable | a workout on that date; **`NULL` = the date's explicit Rest-marker**. No enforced FK — a dangling `workout_id` (workout deleted) is tolerated on read (§7), mirroring `plan`/`sessions` |
| `sort_order` | INTEGER | optional; stable order of multiple workouts on one date (ascending). Ties broken by `created_at`/row order |
| `created_at` | TEXT | ISO datetime |

Suggested index: `schedule(date)` (all reads are by date/date-range).

**Set vs unset vs Rest (normative):**
- A date is **"set"** iff it has **≥ 1** row in `schedule`.
- **Explicit Rest** = a date that is set with exactly **one** row whose `workout_id` is `NULL`
  (the Rest-marker). It overrides the template with *nothing* (no planned workout).
- **Unset** = a date with **zero** rows → it **falls back** to the weekly `plan` template for that
  weekday.
- A date with ≥1 non-NULL `workout_id` row must not also carry a Rest-marker row (adding a workout
  clears any marker; Mark Rest clears all workout rows first — see §2.2 mapping).

Row operations map exactly as in §2.2 (Add = insert row; Remove = delete row, last-row → unset;
Mark Rest = delete all + insert one NULL row; Clear = delete all rows).

**Not changed:** `plan` (weekly template), `workouts`, `exercises`, `sessions`, `gyms` — all as in
`docs/data-shapes.md`.

---

## 4. Resolution rule (normative)

`plannedWorkoutsForDate(date)` returns the **ordered list of planned workouts** for a local date
(possibly empty). This is the single function This Week, `GET /api/week`, and `GET /api/stats` use
to determine a date's plan — it **replaces** every prior "read `plan[weekday]`" lookup.

```
plannedWorkoutsForDate(date):
  rows = schedule rows where schedule.date == date            # date-specific override
  if rows is non-empty:                                        # the date is "set"
     if the only row is a Rest-marker (workout_id == NULL):
        return []                                              # explicit Rest → no planned workouts
     return [ workout for each row with non-NULL workout_id,  # ordered by sort_order
              resolved via workouts table,
              skipping any workout_id that no longer exists ]  # dangling → skipped (§7)
  else:                                                        # unset → template fallback
     w = plan[weekday(date)].workout_id                       # existing Mon–Sun template
     return w ? [resolve(w)] : []                              # 0 or 1 workout (Rest if none/deleted)
```

Notes:
- The result is a **list** (0..n). Template fallback yields **0 or 1** (the template is single-workout
  per weekday). Overrides yield **0..n**.
- An empty result means **Rest** for that date, regardless of whether it came from an explicit Rest
  override or an unset-with-no-template-workout weekday.
- `weekday(date)` and all date math are device-local (decision #12).

Everything below is defined purely in terms of `plannedWorkoutsForDate(date)` and the completed
`sessions` on each date.

---

## 5. Redefined This Week / today / streak / N-of-M

These **redefine** the corresponding rules in `specs/reps.md §2.1` and the `GET /api/week` /
`GET /api/stats` contracts in `docs/api.md`, to (a) resolve each date via `plannedWorkoutsForDate`
and (b) handle **multiple planned workouts per day**. Decision #4's off-plan handling is preserved.

### 5.1 This Week rail, day dots, Today card (day-level)

For each of the 7 days of the current Mon–Sun week, resolve `planned = plannedWorkoutsForDate(date)`
and let `hasSession = (a completed session exists on that date)`.

- **7-day rail**: each day card shows its resolved `planned` workouts. A day with **multiple** planned
  workouts lists **multiple** pills (stacked/compact); an empty `planned` shows **"Rest"**.
- **Day dots** (and the rail's per-day status) use the same four statuses as today, now computed at
  the **day level** (this keeps them consistent with the streak and with decision #4):
  - **done** — `hasSession` is true (≥1 completed session that date). *Checked first, so an off-plan
    session still marks the day Done, per decision #4.*
  - **rest** — not done, and `planned` is empty (explicit Rest override, or unset weekday with no
    template workout).
  - **missed** — not done, `planned` is non-empty, and the date is strictly **before** today.
  - **planned** — not done, `planned` is non-empty, and the date is **today or future**.
  - **today** is additionally marked as in `specs/reps.md §2.1`.
  - **Rationale for day-level (not "all planned done") dots/streak:** decision #4 is binding and
    day-granular — *any* completed session marks the day Done for the streak. Keeping the dot on the
    same day-level rule makes the dot and the streak agree. The finer "did you complete every planned
    workout?" nuance lives in **N of M** below, not in the dot.
- **Today card**: today may have **multiple** planned workouts. The card **lists all of today's
  planned workouts**, each with its own **Start** action (launching the Track flow for that workout).
  When today has one planned workout it looks like today's single Today card. When today is Rest
  (empty `planned`), show the existing rest state ("Rest day — nothing planned"). When today has
  several, show a stacked list (primary card for the first, compact rows for the rest — visual detail
  is Open Question #3).

### 5.2 N of M (workout-level)

- **M** = the **total number of planned, non-rest workouts across the current week**, summing multiple
  workouts per day: `M = Σ over the 7 days of |plannedWorkoutsForDate(date)|`. (An empty/Rest day
  contributes 0; a 2-workout day contributes 2.)
- **"Done" for a specific planned workout** `(date, W)`: it is **satisfied** iff a completed `session`
  on `date` has `workout_id == W`. If `W` is planned *k* times on a date and there are *j* completed
  sessions of `W` that date, `min(k, j)` of those entries are satisfied.
- **N** = `Σ over days of ( satisfiedCount(date) + offPlanCredit(date) )`, where:
  - `satisfiedCount(date)` = number of that date's planned entries that are satisfied (by the
    workout_id match above), and
  - `offPlanCredit(date)` = **1 if** the date has ≥1 completed session that is **not** matched to any
    planned entry (a fully or partially off-plan day), **else 0**. This single per-day credit
    preserves decision #4 ("an off-plan session marks the day Done and counts toward N, but not M")
    at the same day-granularity the current app uses, without letting several off-plan sessions inflate
    N arbitrarily.
- Consistency with today's app (single workout/day): a planned day you completed → `satisfiedCount=1`,
  contributes 1 to N and 1 to M ("1 of 1"); a planned day you did something else → `satisfiedCount=0`,
  `offPlanCredit=1` → still "1 of 1"; a rest day you trained → `offPlanCredit=1`, adds to N not M;
  a planned day you skipped → 0 to N, 1 to M. All identical to current behavior. With overrides and
  multiple-per-day, a 2-planned day where you did both → "2 of 2"; where you did one → "1 of 2".
- As today, **`N` is not strictly ≤ `M`** (off-plan credit can exceed satisfied planned work) — the
  existing `docs/api.md` note stands.
- **Tradeoff (noted):** satisfying a planned entry requires a session for *that* workout on that date
  (matched by `workout_id`), while off-plan work is credited only once per day. Consequence to accept:
  on a 2-planned day, doing one planned workout **plus** one unrelated off-plan workout yields
  `satisfiedCount=1 + offPlanCredit=1 = 2` → "2 of 2" even though one planned slot went undone. This
  is the deliberate, simplest rule that honors decision #4; the alternative (never let off-plan fill a
  planned slot) is recorded as Open Question #1 if the user wants stricter accounting.

### 5.3 Streak (day-level walk-back)

Restated with `plannedWorkoutsForDate`, unchanged in spirit from `specs/reps.md §2.1` /
`docs/api.md` — the streak is **day-level** (decision #4), so multiple-per-day does not change it:

Walking **backward from today**, classify each day by the §5.1 day-level status:
- **done** (`hasSession`) → **increments** the streak; continue.
- **rest** (empty `planned`, no session) → **passes through** (no increment, no break); continue.
- **missed** (non-empty `planned`, past, no session) → **breaks** the streak.
- **today** when its status is **planned** (not yet done, day not over) → **skipped** (neither counted
  nor breaking); continue to yesterday.

Multiple-per-day: a day is **done** for the streak as soon as **≥1** completed session exists that
date (decision #4). A day where you completed only *some* of several planned workouts is still
**done** for the streak (you trained that day); the partial completion is reflected only in N of M.
A past planned day with **no** session is **missed** and breaks the streak regardless of how many
workouts were planned.

The streak value on This Week and History must remain identical (single shared computation).

### 5.4 API shape delta (Week payload)

Because a day can now have multiple planned workouts, `GET /api/week`'s per-day `workout` (single,
nullable) becomes **`workouts`** (array, possibly empty). `today.workouts` likewise. Each day entry
should also expose enough for the rail (its `status`, `date`, `is_today`). `n`, `m`, `streak` keep
their names with the redefined meanings above. Backend-agent finalizes the exact shape in
`docs/data-shapes.md`; the requirement is the array-of-workouts and the redefined `n`/`m`.

---

## 6. API additions (contract-level; backend-agent finalizes)

New endpoints under `/api/schedule`. All dates are local `YYYY-MM-DD` (decision #12). Mutations are
immediate (no draft). Error shape and status codes follow `docs/api.md` conventions.

### `GET /api/schedule?from=YYYY-MM-DD&to=YYYY-MM-DD`
Read the **resolved** schedule for a date range (the calendar requests the visible month, typically
padded to whole weeks). Response: one entry **per date** in `[from, to]`:
```jsonc
{
  "schedule": [
    {
      "date": "2026-07-16",
      "source": "schedule" | "template" | "rest",   // where the resolution came from:
                                                      //   "schedule" = date-set override with workouts
                                                      //   "rest"      = explicit Rest override (set, NULL marker)
                                                      //   "template"  = unset → fell back to weekly plan (may be empty)
      "is_set": true,                                 // date has >=1 schedule row (override exists)
      "workouts": [ { /* Workout */ } ],              // resolved via plannedWorkoutsForDate; [] = Rest
      "status": "planned"                             // optional: done|rest|missed|planned for the completion overlay (Open Question #7)
    }
    // ... one per date in range
  ]
}
```
`400` if `from`/`to` are missing or not valid `YYYY-MM-DD`, or `to < from`, or the range exceeds a
sane cap (e.g. 62 days — a padded month).

### Mutating a single date
Primary (set-the-whole-day) form — expresses add/remove-all/rest/clear in one call:

`PUT /api/schedule/:date` — body is one of:
```jsonc
{ "workout_ids": ["id1", "id2"] }   // replace the date's entries with these workouts (order preserved) → date "set"
{ "rest": true }                     // explicit Rest override (single NULL marker); clears any workouts
{ "clear": true }                    // delete the date's override → revert to template (unset)
```
Response: `200` → the resolved entry for that date (same shape as a `GET` element). `400` invalid
`:date` or malformed body; a `workout_id` that doesn't reference an existing workout is either `404`
or silently dropped — backend-agent picks, consistent with `PUT /api/plan/:day` (which `404`s on an
unknown `workout_id`).

Granular helpers (optional; the editor can use either these or `PUT`):
- `POST /api/schedule/:date` `{ "workout_id": "id" }` → **append** one workout to the date (removes any
  Rest-marker first). `201` → resolved date entry.
- `DELETE /api/schedule/:date/:entryId` (or `DELETE /api/schedule/:date?workout_id=`) → **remove** one
  entry; if it was the last, the date becomes unset (template fallback). `200` → resolved date entry.

### Endpoints that now use the resolution rule
- **`GET /api/week`** and **`GET /api/stats`** must compute each date via `plannedWorkoutsForDate`
  (§4) and the redefined N/M/streak (§5). They keep their `?today=YYYY-MM-DD` param and behavior
  (decision #12). `GET /api/week`'s per-day shape changes to `workouts[]` (§5.4).
- **`GET /api/plan` / `PUT /api/plan/:day`** are **unchanged** — they read/write the weekly template
  baseline only, never the date overrides.

---

## 7. Migration & seed

- **Add** the `schedule` table via the existing idempotent boot migration in `server/db.js` (read
  `PRAGMA table_info` / create-if-missing pattern already used) — an existing DB upgrades in place.
- **No seed schedule rows.** An empty `schedule` table means every date is unset → the whole calendar
  falls back to the existing weekly `plan` template and its seed (decision #4 / data-shapes seed §).
  The app therefore behaves exactly as today until the user adds an override.
- **Existing `sessions`/History are unaffected** — Done/streak still read completed sessions the same
  way; only the *planned* side changes.
- **Workout deletion cascade (delta to `DELETE /api/workouts/:id`).** Today that route nulls any `plan`
  row pointing at the workout (→ Rest). For `schedule`, **delete** the schedule rows that reference the
  deleted `workout_id` (do **not** null them — a NULL row means *explicit Rest*, which must not be
  auto-created). If that leaves the date with zero rows, it reverts to template fallback; if other
  workout rows remain on the date, they stay. **Additionally**, all reads (`GET /api/schedule`,
  `plannedWorkoutsForDate`) must **defensively skip** any dangling `workout_id` (surfacing "Workout
  removed" in the calendar cell) so a not-yet-cascaded row never crashes — mirroring how `plan` and
  `sessions` already tolerate deleted references.

---

## 8. Non-goals (out of scope for this feature)

- **Recurring custom rules** beyond the existing weekly Mon–Sun template (e.g. "every other Tuesday",
  custom repeat patterns). The only recurrence is the weekly template fallback.
- **Drag-and-drop** scheduling (dragging a workout onto a day, or between days). Interaction is
  **tap-only** (tap a day → edit).
- **Multi-month / multi-year planning views** (agendas, quarter/year views, spanning ranges). One
  month at a time.
- **Reminders / notifications / calendar sync** (device calendar, push, email).
- Retroactively creating or editing **completed sessions** from the calendar — Done still comes only
  from the Track flow. The calendar edits *plans*, not *history*.

---

## 9. Open questions

1. **Off-plan credit on a partially-done multi-workout day (§5.2 tradeoff).** Accept the simple rule
   (off-plan work can fill the day's "done" credit so a 1-planned-done + 1-off-plan day reads "2 of
   2"), or use stricter accounting where off-plan sessions never occupy an unmet planned slot? Simpler
   rule chosen by default; flag for the user if stricter N-of-M is wanted.
2. **Warn when editing the past?** Editing past dates is allowed (§2.2) and can change streak
   classification (past Missed → Rest extends a streak). Should the editor show a subtle "editing a
   past date" note, or edit silently? Default: silent, with the streak simply recomputing.
3. **Multiple-Today-card layout.** When today has several planned workouts, exact visual treatment
   (one big card + compact rows vs a stacked list of equal cards, and Start-per-workout placement).
   Deferred to design/frontend; behavior (list all, Start each) is fixed here.
4. **Phone nav slot for Schedule.** The phone tab bar currently holds four tabs (This Week · Workouts
   · Build · History) and deliberately omits Exercises. Does Schedule become a fifth phone tab, replace
   a slot, or is it reached from within This Week on phone? (Desktop sidebar clearly gets a Schedule
   item under This Week.)
5. **Deep-link to a month** (`/schedule?month=YYYY-MM`) — include in v1 or default to current month
   only? Low-cost; defaulting to current month is acceptable if deferred.
6. **Adjacent-month cells.** Show muted prev/next-month dates in the padding cells (read-only), or
   leave them blank? (Standard calendars show them; either is fine.)
7. **Completion overlay in the calendar (`status`/done check per cell).** Include the done/missed
   overlay in `GET /api/schedule` and the cell in v1, or ship the planning-only calendar first and add
   the completion overlay later? The cell renders correctly from planned data without it.

---

## Definition of done for this spec
- **Spec file:** `/Users/carsongranese/dev/GitHub/Exercise/specs/schedule.md`
- **Acceptance criteria:** per screen in §2 (month calendar, day editor) and per redefined rule in §5.
- **Edge cases / failure states:** §2 (per screen), §7 (deletion cascade / dangling refs), and the
  timezone/past/duplicate/very-full-day cases throughout.
- **Open questions:** §9.
