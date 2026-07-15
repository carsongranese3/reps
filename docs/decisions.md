# Decisions log — Reps

Cross-cutting calls made by the orchestrator. Append-only; newest at the bottom of each section.
Resolves the Open Questions in `specs/reps.md §7`.

## Architecture

1. **Storage architecture (resolves OQ#1).** **Express + better-sqlite3**, single-file SQLite
   (`server/reps.db`) in WAL mode, plain prepared statements (no ORM), per the cookbook pattern in
   `CLAUDE.md`. Demo media on disk under `server/media/`, streamed via
   `GET /api/exercises/:id/demo` with HTTP Range. The React client talks to a REST API through a
   typed client module. This supersedes any "client-only / IndexedDB" reading of an earlier draft.
2. **Hosting & sync.** One **hosted** server with a persistent volume for `reps.db` + `media/`.
   **Single user, no login.** Because data lives in one shared DB, computer and phone **do** sync —
   this **overrides** the spec's "local to device" non-goal. Cross-device sync of *this single
   user's* data is in scope; multi-user/accounts remain out of scope.
3. **PWA / offline (resolves the offline note).** Installable PWA with a cached app **shell**. User
   data and demo media are server-backed, so full offline use of data is **not** a v1 guarantee;
   the app shell loads offline and reads/writes require the server. Never hotlink external media.

## Product rules

4. **`plan` shape + off-plan sessions (resolves OQ#3).** `plan` is a fixed **Mon–Sun weekly
   template**: day-of-week (`mon`…`sun`) → `workout_id`; a day with no entry = Rest. A completed
   session for a **non-planned** workout marks that day **Done** (counts toward N and the streak)
   but does **not** change **M** (the denominator stays the count of planned non-rest days). **No
   seed sessions** ship — a new user starts with a genuinely empty History.
5. **Session persistence (resolves OQ#2).** The server `sessions` table stores **completed**
   sessions only (`status = complete`). An in-progress/abandoned session lives in **client-side
   local state** (e.g. `localStorage`) to power **Resume**; it is not written to the server and
   never appears in History until finished. No `abandoned` rows.
6. **Workout `category` vs `type` (resolves OQ#4).** A workout stores **both**: `type` = training
   emphasis (**Strength · Hypertrophy · Power**, the Build chips per the design) and `category` =
   a single library-filter label (**Strength · Push · Pull · Legs · Cardio · Mobility**). Build
   gets a small `category` selector in addition to the `type` chips. The Workouts filter chips
   filter on `category`.
7. **Save validation (resolves OQ#5).** Saving a workout **requires a non-empty name and ≥1
   exercise**; block with inline validation otherwise. No silent nameless/empty drafts.
8. **Units (resolves OQ#6).** **lb only** in v1. No kg toggle (remains a non-goal).
9. **Cardio & progress depth (resolves OQ#7).** v1 is simple: weight×reps exercises log
   per-set actuals; cardio/timed exercises log a single **done-check** with optional
   **duration/distance**. History progress = **weekly-volume bar chart (last 8 weeks)** +
   stat tiles + recent sessions. Per-exercise progression/1RM charts are out of v1.
10. **PR definition (resolves OQ#8).** A **PR** = a completed set whose **weight exceeds the prior
    best weight ever logged for that exercise** (max weight, any rep count). "PRs this month" and
    the session PR badge use this same rule. Cardio exercises have no PR in v1.

## Duration estimate

11. **Build estimate constants.** `est_minutes = round_to_5( Σ over exercises [ sets ×
    (avg_reps × 3.5s + rest_s) ] / 60 )`, where `avg_reps` = midpoint of the rep range. Constants
    are tunable; the requirement is the estimate is derived and updates live. Server computes it.

## Build notes (backend, resolved during implementation)

12. **Client timezone.** The server has no client TZ. `GET /api/week` and `GET /api/stats` take an
    optional `?today=YYYY-MM-DD` (client local date), falling back to server-local. **The frontend
    must always pass `?today` with the device's local date.**
13. **Off-plan Done day.** Per decision #4, an off-plan completed session marks that day **Done**
    (counts toward N and streak) even if it was nominally a Rest day, but never changes **M**.
14. **Seed library is 21 exercises** (the 13 named + 8 added: Lat Pulldown, Seated Cable Row,
    Barbell Bicep Curl, Face Pull, Plank, Dead Bug, Cat-Cow Stretch, Interval Run) so Pull/Core/
    Cardio workouts reference real movements. No seed sessions.
15. **PUT is patch semantics** (merge onto existing row) for workouts & exercises — supports cheap
    favorite-toggle-only updates.

## Gemini autofill (added feature)

16. **AI Autofill on the add/edit-exercise form.** An **Autofill** action calls Google **Gemini**
    to populate an exercise's fields from just its **name**. This adds the app's **one** external
    API (reverses the earlier "no external API" stance — recorded here deliberately).
    - **Server-side only.** New endpoint `POST /api/exercises/autofill` `{name}` → the server calls
      Gemini and returns suggested fields. The key (`GEMINI_API_KEY`) lives in `server/.env`, is
      never sent to the client, never returned in a response, never committed. Model configurable
      via `GEMINI_MODEL` (default `gemini-2.0-flash`). Env loaded via
      `node --env-file-if-exists=server/.env`.
    - **Fills all text fields** (category, equipment, difficulty, muscles_worked, how_to, tags) and
      **overwrites** the current form values; **nothing saves until the user hits Save** (they
      review/edit first). Per user choice.
    - **Video = YouTube link.** Gemini also returns a best-effort YouTube URL, stored in the
      `exercises.video_url` column. The user can also paste one manually. It renders as an inline
      embed on the exercise detail and in the edit form, and its thumbnail becomes the exercise's
      library photo. It does **not** power the local seek-per-step demo (that still needs a real
      uploaded clip in `demo_file`). (This is a single-user personal app — earlier "unverified"
      labeling was removed at the user's request; a bad link simply shows no player/thumbnail.)
    - **Graceful degradation.** Missing key → the endpoint returns a clear error and the button
      shows "Autofill unavailable (no API key)"; Gemini/network/parse errors → friendly message, no
      crash. The feature is entirely opt-in per click.

## Gym section (added feature)

17. **Gyms — a reference library of places and their equipment.** New top-level section, styled
    like Workouts.
    - **Nav:** a **Gym** tab directly under This Week, on both desktop sidebar and phone tab bar.
      Routes `/gyms`, `/gyms/:id`, `/gyms/new`.
    - **Entity `gyms`** (mirrors the storage pattern): scalars `id, name, favorite (0/1), image,
      created_at, updated_at`; JSON column `equipment` = `string[]`. `normalizeGymBody()` /
      `rowToGym()` serialization boundary; idempotent `gyms` table + migration in `server/db.js`.
      REST: `GET/POST /api/gyms`, `GET/PUT/DELETE /api/gyms/:id` (PUT patch semantics, like
      workouts). Seed a couple of example gyms.
    - **Equipment input** = a checklist of common gym equipment **plus add-custom** (free string).
      Stored as a plain `string[]`; the common-equipment list is a client-side constant.
    - **Role for now = storage/display only.** No filtering of exercises/workouts by a gym's
      equipment and no "current gym" concept yet (deliberately deferred). Per user choice.
    - **Look = Workouts:** searchable card grid, colored block (color derived from the gym name for
      variety, since gyms have no category), name, "N equipment" meta, favorite heart, "New gym"
      button. No category filter chips. Detail page shows equipment as chips + Edit/Delete.

18. **Assign a workout to a gym + filter Build by equipment** (extends #17, supersedes its
    "storage/display only" clause).
    - **`workouts.gym_id`** (nullable TEXT) links a workout to a gym. **`null` = "Any gym"** — the
      generic option: not a real gym row, never appears in the Gym tab, and applies **no** filtering.
      New workouts default to it. Threaded through `normalizeWorkoutBody()`/`rowToWorkout()`; no FK
      enforcement (deleting a gym leaves the workout as "Any gym" — the client treats an unknown
      `gym_id` as Any gym).
    - **Build gym selector:** "Any gym" (default) + the user's gyms. When a specific gym is chosen,
      the exercise library picker **hides** exercises not doable there (per user choice).
    - **`exerciseDoableAtGym(exercise, gym)`** (shared, testable helper): TRUE if the exercise's
      `equipment` is empty / `None` / `Bodyweight` (bodyweight is **always** available, per user
      choice), OR if its `equipment` **loosely matches** any of the gym's `equipment` items —
      normalize both (lowercase, trim, strip a trailing "s", substring match either direction) to
      bridge the exercise vocab (`Dumbbell`, `Cable`) vs the gym checklist (`Dumbbells`,
      `Cable machine`). "Any gym"/`null` → everything is doable.
    - **Existing exercises are not auto-removed** when a stricter gym is assigned; they stay but are
      **subtly flagged** "not at this gym" (per user choice). Only new additions are filtered.
    - **Display:** the assigned gym's name shows on the workout detail (and card where it fits);
      "Any gym" shows nothing special.

19. **Muscle heat-map visual for workouts/exercises.** A stylized **front + back** body map
    (`MuscleMap`) highlights the muscles a workout/exercise works, as a **heat map** (muscles hit by
    more exercises glow stronger). Replaces the colored box on workout cards; shown large on the
    workout detail and on the exercise detail.
    - **Client-only** — no backend change. A workout's muscles are aggregated from its exercises'
      `muscles_worked` via the exercises map (the workout list already returns `exercises[]`).
    - **Asset:** a hand-authored, bundled **inline SVG** (no external calls, offline-safe), stylized
      "muscle blocks," tinted in the terracotta accent `#B15834` with opacity/scale by intensity.
    - **Muscle mapping** (`lib/muscles.ts`): forgiving case-insensitive map from the app's free-text
      muscle names → canonical regions; unknown names ignored. Colored-box fallback when a
      workout/exercise has no mappable muscles.
    - Gyms are unchanged (no muscles); gym card covers revisited separately.

20. **Workout mode: two tracking styles + finish/pause/cancel.**
    - After **Begin**, the user picks a tracking style: **Checklist** (the existing free
      log-everything view) or **Guided** (timed, one set at a time). The choice is persisted on the
      active session so Pause/Resume keeps it; a resumed session with no saved style re-shows the
      picker.
    - **Guided flow (per user spec):** one **set** at a time — show the exercise, "Set X of Y", the
      target + last-time, and weight/reps inputs (prefilled). Hit **Next** → the set is recorded
      (completed) → a **rest timer pops up**, counting down from the exercise's configured `rest`
      (**fixed to the plan, not adjustable**). When it hits 0 it **keeps running** (overtime) rather
      than auto-advancing; a **Next set** button (which also works during the countdown, doubling as
      skip) advances to the next set's logging screen. After the final set, Next goes to finish.
    - **Controls (both styles):** header has **Finish**, **Pause**, **Cancel**. **Cancel** always
      confirms (discards; Pause keeps progress via localStorage + This Week Resume). **Finish**
      confirms only when not every set is logged ("logged X of Y — finish anyway?"); if all sets are
      done it finishes directly. Both styles write the same completed `session`.

21. **Schedule tab — plan the month (date-specific), driving This Week.** New top-level tab under
    This Week; a month calendar to plan workouts on specific dates. (Full semantics in
    `specs/schedule.md`.) Resolved user choices:
    - **Date-specific overrides that drive This Week/streak**, layered over the existing weekly
      `plan` template: a date's planned workouts = its schedule entries if the date is *set*,
      otherwise a fallback to the weekly template for that weekday. The weekly template stays as the
      baseline (and `GET/PUT /api/plan` stays).
    - **Multiple workouts per day** allowed. New `schedule` table = rows `{date, workout_id}`; a date
      is "set" if it has ≥1 row. Explicit **Rest** on a date = a rest marker (`workout_id` NULL row)
      so it overrides the template with nothing (vs. an unset date that falls back). Unset date → no
      rows → template fallback.
    - **Interaction:** tap a day → add workout(s) from the library, mark Rest, or clear (back to
      template). Month navigation (prev/next).
    - This Week, today, streak, and N-of-M must be recomputed to resolve each date via
      schedule-override → weekly-template fallback, and to handle multiple workouts per day —
      defined in `specs/schedule.md`.
    - **Resolved open questions (orchestrator calls, approved):**
      1. **N-of-M off-plan accounting:** keep the simple rule (one off-plan credit per day; §5.2).
      2. **Editing past dates:** allowed, **no warning** (streak just recomputes).
      3. **Today card with multiple workouts:** primary card for the first + compact rows for the rest.
      4. **Phone nav:** add **Schedule as a 5th phone tab** (and to the desktop sidebar, under This Week).
      5–7. **Calendar status overlay ships in v1** (light): mark today + a subtle done/missed on past
        dates using the resolution rule.
    - **Cross-cutting contract changes (approved):** `GET /api/week` per-day `workout` (single) →
      **`workouts[]`** (array), and `today.workout` → `today.workouts[]`; `DELETE /api/workouts/:id`
      also **deletes** referencing `schedule` rows (never nulls them — NULL means explicit Rest).

22. **History: week drill-down + edit/delete a logged session.**
    - **Weekly-volume bars become clickable.** Selecting a week highlights it; the right-hand panel
      switches from "Recent sessions" to **that week's sessions** (the days a workout happened + the
      workout), same row style. Default selection = the latest week. An empty selected week shows a
      **"No workouts this week"** state (with the week's date range).
    - **A session can be edited or deleted.** **Delete** uses the existing `DELETE /api/sessions/:id`
      (confirm first). **Edit** reopens the logged **sets** (weight × reps, add/remove sets) like the
      tracking screen; saving recomputes `duration`/`total_sets`/`total_volume` and **PRs**.
    - **New endpoint `PUT /api/sessions/:id`** — accepts updated `entries` (same shape as POST),
      recomputes derived totals, and **recomputes this session's PRs against the best of all OTHER
      sessions** (excluding itself). Keeps the session's `date`/`workout_id` snapshot unless the edit
      changes them.

23. **Equipment as a managed entity + a new Equipment tab; nav reorder.**
    - **New `equipment` table/entity**: `{ id, name (unique, required), created_at, updated_at }`
      (name-only for now). CRUD API `GET/POST /api/equipment`, `GET/PUT/DELETE /api/equipment/:id`.
      Seeded from the former `COMMON_EQUIPMENT` list. Idempotent migration.
    - **New Equipment tab**, same look as Exercises: a searchable grid (`/equipment`) of equipment
      tiles with New / edit / delete. Desktop sidebar item (like Exercises — **not** a phone tab, to
      avoid crowding; reachable by route on phone).
    - **The equipment list now feeds the pickers:** the exercise Equipment datalist and the gym
      equipment checklist source their suggestions from `GET /api/equipment` (+ "Bodyweight" for
      exercises) instead of the hardcoded constant. Exercises/gyms still **store** equipment as
      strings (names) — the entity is the curated suggestion source, no relational refactor.
    - **Nav reorder:** **History moves directly under Schedule.** Desktop sidebar order:
      This Week · Schedule · History · Gym · Workouts · Exercises · Equipment. Phone tabs:
      This Week · Schedule · History · Gym · Workouts.

24. **Equipment substitutes ("also counts as") — configurable equipment hierarchy.**
    - Each `equipment` row gains a **`substitutes` (JSON string[])** field: the equipment this item
      **also counts as / can replace** (one-way superset). e.g. **Adjustable bench → ["Bench"]** so a
      gym with an adjustable bench covers any exercise that needs a flat Bench (but not the reverse).
    - **Editable in the Equipment tab** (a multi-select of other equipment names). Seeded so
      "Adjustable bench" defaults to substituting "Bench"; back-filled onto the existing row.
    - **Matching becomes data-driven:** `exerciseDoableAtGym` expands a gym's equipment by each
      item's `substitutes` (from the managed equipment list) and requires an exact (normalized)
      match — replacing the old fuzzy substring loose-match. Bodyweight/None always doable; "Any
      gym" always doable.

25. **Exercise equipment → multi-equipment "groups" (AND-of-ORs).**
    - **Problem:** an exercise needed a *single* equipment string, so it couldn't say "needs a
      Barbell **and** a Bench" or "a Flat Bench **or** an Adjustable bench".
    - **Model — AND-of-ORs (CNF).** Exercise equipment becomes **`equipment_groups: string[][]`**:
      the outer array is **AND** (every group is required), each inner array is **OR** (any one item
      in it — substitutes — satisfies that group). e.g. Barbell Bench Press =
      `[["Barbell"], ["Flat Bench", "Adjustable Bench"]]` → needs a Barbell **and**
      (Flat Bench **or** Adjustable Bench). Empty `[]` = bodyweight / no equipment.
    - **Storage:** the exercise `equipment` scalar TEXT column is **repurposed to a JSON column**
      holding `string[][]`. `normalizeExerciseBody` cleans it (trim/drop-blank items, drop empty
      groups, dedupe within a group); `rowToExercise` `safeParseArray`s it back. A **one-time boot
      data migration** in `server/db.js` converts every legacy scalar value (`"Barbell"`) →
      `[["Barbell"]]` (empty/None → `[]`); `rowToExercise` also defensively coerces any still-legacy
      scalar on read. Items store equipment **names** (not ids) — keeps the existing string-match,
      no-FK decoupling from equipment deletion (consistent with #23/#24).
    - **Backward-compat display:** `rowToExercise` also returns a derived read-only
      **`equipment` summary string** ("Barbell + (Flat Bench or Adjustable Bench)", "Bodyweight" when
      empty) so existing display sites keep working. `equipment` is **never written** — writes go
      through `equipment_groups`.
    - **Gym doability (`client/src/lib/equipment.ts`):** `exerciseDoableAtGym` now takes
      `equipment_groups`. For **each** group it expands the gym's equipment via managed `substitutes`
      (#24) and requires **at least one** item in the group to be provided (OR); the exercise is
      doable only if **all** groups are satisfied (AND). Empty groups → always doable.
      `equipmentNeedsLabel` returns the same summary string for the "not available" tooltip.
    - **Exercise form (`ExerciseFormPage.tsx`):** the single equipment input becomes a **grouped-rows
      builder** — "Add required equipment" adds an AND row; within a row "+ or…" adds substitutes.
      Options come from the managed Equipment list (+ "Bodyweight"). Shows the live summary.
    - **Gemini autofill:** the prompt asks for `equipment_groups` (array of OR-groups, names spelled
      exactly from the managed list); `parseAutofillResponse` validates the nested shape. Suggestion
      is reviewed/edited before saving as before.
    - **Docs updated:** `docs/data-shapes.md` (exercises `equipment_groups` column + derived
      `equipment`; Gemini suggestion shape) and `docs/api.md` (request/response shapes). Seed +
      `importExercises.js` write `equipment_groups`.

26. **Simplify exercise equipment to a flat required list — drop the per-exercise OR groups.**
    - **Supersedes the OR dimension of #25.** The per-exercise "substitute" picker (OR-within-a-group)
      is **redundant** with the managed Equipment `substitutes[]` ("also counts as", #24): alternates
      are configured **once** on the equipment item, not repeated on every exercise. So an exercise's
      equipment collapses from `string[][]` (AND-of-ORs) to a flat **`equipment: string[]`** — the
      list of pieces the exercise needs, **all required (AND / used together)**.
    - **Substitution stays, centrally.** `exerciseDoableAtGym` still expands the gym's equipment via
      each managed item's `substitutes` (#24), then requires **every** item in `equipment` to be
      provided. e.g. an exercise needing `["Barbell","Bench"]` is doable at a gym with a Barbell + an
      Adjustable Bench (because Adjustable Bench substitutes Bench). No per-exercise alternatives.
    - **Storage:** the `equipment` JSON column now holds `string[]`. A one-time idempotent boot
      migration flattens any existing `string[][]` (from #25) to `string[]` (single-item groups →
      the item; the clean-slate DB has no genuine multi-item OR groups to lose). `normalizeExerciseBody`
      cleans a flat `string[]` (trim/dedupe/drop-blank); `rowToExercise` returns `equipment: string[]`.
      The derived summary string from #25 is dropped — a flat list renders directly (joined with " + ").
    - **UI:** the exercise form's grouped-rows builder loses "+ or…" and the "or" rendering — it's a
      simple list of required-equipment inputs ("+ Add equipment"). Detail page shows the joined list.
    - **Gemini** suggests a flat `equipment: string[]` of required names from the managed list.
    - Docs (`data-shapes.md`, `api.md`) updated to `equipment: string[]`.

27. **History: manually log a past ("forgot to track") workout.**
    - **New "Add workout" action on History** (header button next to the H1) opens a manual-log form
      → new route `/history/new` (page `AddSessionPage`). For logging a workout you did but forgot to
      track live — **not** a new tracking mode.
    - **Flow (pick a saved workout):** choose a **date** (defaults to today; may be in the past) and a
      **saved workout**. Picking the workout **prefills** its exercises + target sets (same transform
      as live tracking's `buildActiveSessionFromWorkout`), then you enter actual **weight × reps** per
      set (rows reuse `SessionDetailPage`'s edit-mode set UI; add/remove set), sets default to
      completed. Save → `useCreateSession` with `{ workout_id, date, entries }`.
    - **No backend change** — `POST /api/sessions` already accepts a client-supplied `date`
      (backdating) and snapshots `workout_title`/`workout_category`, and computes
      `total_sets`/`total_volume`/`prs` server-side. `useCreateSession` already invalidates
      `sessions`/`week`/`stats`, so the backdated session lands correctly in History, This Week, and
      the streak (server buckets by `date` slice, decision #12).
    - **Known limitation (documented, not fixed):** `prs` are computed against **all** sessions in the
      DB at insert time, not chronologically (decision #10). A backdated entry inserted after later,
      heavier sessions may get an incorrect PR flag, and existing later sessions aren't retroactively
      recomputed. Accepted tradeoff — surfaced to the user, not silently patched.
    - Freeform (no saved workout) logging is a possible follow-up; the API already supports it via the
      `workout_title` fallback, but this iteration ships pick-a-saved-workout only.

28. **Restore per-exercise OR — back to AND-of-ORs `equipment_groups` (reverses #26).**
    - **Why the reversal:** #26 removed per-exercise alternatives assuming central `substitutes` (#24)
      covered them. But some alternatives are **exercise-specific**, not global equivalences — e.g.
      **Dips** can be done on a **Dip Station _or_ a Bench** (bench dips), yet a Bench is NOT globally a
      Dip Station. Central substitutes can't express that; per-exercise OR can. So we restore #25's
      model. The two mechanisms **coexist**: central `substitutes` = global "also counts as";
      per-exercise OR = alternatives that only apply to that movement.
    - **Model = AND-of-ORs.** Exercise equipment is **`equipment_groups: string[][]`**: outer array =
      **AND** (every group required, "used together"), inner array = **OR** (any one item — an
      exercise-specific alternative — satisfies that group). Empty `[]` = bodyweight. e.g. Bench Press
      = `[["Barbell"],["Bench"]]`; Dips = `[["Dip Station","Bench"]]`.
    - **Storage / API:** the `equipment` JSON column holds `string[][]`. API returns
      `equipment_groups` (source of truth) + a derived read-only `equipment` **summary string**
      ("Barbell + Bench", "Dip Station or Bench") for display; writes go through `equipment_groups`.
      One-time idempotent boot migration converts ANY prior shape → `string[][]`: legacy scalar →
      `[["x"]]`; **#26 flat `string[]` → each item its own required group** `[["a"],["b"]]` (current
      items are all "used together"); already-grouped `string[][]` → kept.
    - **Gym doability:** for each group, the gym's equipment (expanded via managed `substitutes`, #24)
      must provide **at least one** item (OR); the exercise is doable only if **all** groups are
      satisfied (AND). Empty groups → always doable.
    - **UI:** the exercise form's **grouped-rows** builder returns — "+ Add required equipment" adds an
      AND row, "+ or…" adds an alternative within a row. Detail page + Build tooltip show the summary.
    - **Gemini** suggests `equipment_groups`. Docs (`data-shapes.md`, `api.md`) back to the grouped
      shape. **Data note:** after migration, the curated exercises stay as single-item groups except
      **Dips → `[["Dip Station","Bench"]]`** (the OR the user asked for), set explicitly.
