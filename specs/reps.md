# Spec: Reps — personal workout tracker

Status: draft (greenfield). Source of truth for the build. Design reference: `design/Reps.dc.html`
+ `docs/design.md` (Pantry theme). Field names follow `CLAUDE.md`; exact column types are deferred to
`docs/data-shapes.md` (data/backend agents) and the data-layer contract to `docs/api.md`.

> **Blocking discrepancy to resolve before build (see Open Questions #1).** `CLAUDE.md` describes a
> **client-only** app (React + Vite, persistence in IndexedDB via `idb`, no server, demo media bundled
> locally). The task brief and `docs/design.md` describe an **Express + better-sqlite3 server** with
> demo media on disk streamed via `GET /api/exercises/:id/demo` (Range). This spec is written at the
> **product level** so it holds under either architecture: it names entities, fields, screens,
> behaviors, and acceptance criteria without depending on where the bytes live. Wherever storage
> matters (demo streaming, "last time" lookups), the behavior is specified; the mechanism is left to
> the storage decision recorded in `docs/decisions.md`.

---

## 1. Overview

Reps is a single-user, no-login workout app delivered as one responsive web app (desktop + phone,
same routes, installable PWA). The user can:

- **Design a workout** (Build): name it, pick a type, add exercises from a library, set per-exercise
  sets/reps/rest, reorder, remove.
- **Track a workout** (active session): go through it exercise-by-exercise, check off sets, log actual
  weight × reps, optional rest timer, complete the session — which updates This Week and the streak.
- **Learn each movement**: every exercise has a demo clip/illustration and numbered "how to" steps.
- **See the week and progress**: This Week home (plan, today, streak) and History (past sessions +
  simple progress over time).
- **Own the exercise database**: the library is user-built (create/edit exercises), seeded with a small
  starter set so the app is not empty on first run.

Five sections / routes: **This Week · Workouts · Build · Exercises · History.**

### Global rules
- **Single user, no auth.** No accounts, no sharing.
- **Installable PWA** with a cached app shell. User data + demo media are server-backed (Express +
  better-sqlite3; media served locally, never hotlinked), so reads/writes require the server; full
  offline data use is not a v1 guarantee (see `docs/decisions.md`).
- **Components never touch storage directly** — all reads/writes go through the typed data-layer
  functions documented in `docs/api.md`.
- **Units.** Weight is displayed and entered in **lb** (matches design: "140 lb × 8", "82.4k lb").
  A global unit toggle (lb/kg) is out of scope for v1 (Open Question #6).
- **"Today" and week boundaries** use the device's **local timezone**. A day is a calendar date in
  local time; the week is **Monday–Sunday** (design shows M–S day dots and a Mon-first rail).

---

## 2. Screens & flows

Each screen exists as a desktop layout (left sidebar) and a phone layout (bottom tab bar), same route.
Design option ids in parentheses.

### 2.1 This Week — home (`2a` desktop / `2b` phone) — route `/week`

The landing screen. Top to bottom: weekly summary strip, 7-day rail, Today card, today's exercise list.

**Weekly summary strip**
- **"N of M workouts"** — N = count of **planned, non-rest** days in the current week that are **Done**;
  M = count of **planned, non-rest** days in the current week (see definitions below). Design shows
  "2 of 5 workouts".
- **Streak** — a day count with the terracotta accent ("6 days" / "6-day streak" on phone). Definition below.
- **M–S day-dot row** — seven dots, Monday→Sunday, each colored by that day's **status**:
  - **Done** = green filled with a check.
  - **Rest** = neutral grey with a dash (a day with no planned workout, or explicitly a rest day).
  - **Missed** = terracotta/red ring with an ✕ on a light red fill (a past, planned, non-rest day with
    no completed session).
  - **Planned** = dashed outline, empty (a future or today's planned, non-rest day not yet done).
  - **Today** is additionally marked (black ring + center dot on the dot row; "TODAY" pill on the rail).
- **Legend** — Done / Rest / Missed / Planned, plus the italic note **"Rest days don't count against
  your streak."**

**7-day rail** — seven day cards Mon→Sun, each showing weekday label + date number and either the
**planned workout's name** (category-colored pill) or **"Rest"**. Done days show a check on the pill
(design shows completed days at reduced opacity with a check). **Today** card has a black border and a
"TODAY" badge. Tapping a day card with a planned workout opens that workout (see 2.2 open flow); tapping
a rest day does nothing (or shows "Rest day").

**Today card** — prominent gradient card (category color) with eyebrow "TODAY · <WEEKDAY>", the workout
name, a meta line ("Quads · Hamstrings · Glutes — 60 min · 6 exercises"), and a **"Start workout"**
button (phone: "Start"). Starting launches the Track flow (2.4) for today's workout.

**Today's exercise list** — below the card: each exercise as a row (color chip + play glyph, name,
muscles subtitle, "sets × reps" e.g. "4 × 6–8", chevron). Header shows "N exercises · ~X min". Tapping a
row opens that Exercise detail (2.5).

**Status definitions (normative)**
- A day's **planned workout** = `plan[<that weekday>]` → `workout_id`, or none.
- **Rest day** = no planned workout for that day (`plan` entry empty). Rest days are neutral and never
  count for or against N/M or the streak.
- **Done** = there exists a **completed** `session` whose `date` falls on that calendar day (and, if a
  workout was planned, ideally references that workout — but any completed session on the day marks the
  day Done for N-of-M and streak purposes; see Open Question #3).
- **Missed** = the day is in the **past** (strictly before today), had a planned non-rest workout, and
  has **no** completed session.
- **Planned** = the day is **today or in the future**, has a planned non-rest workout, and is not yet Done.

**"N of M workouts" (normative)**
- M = number of planned, non-rest days in the current Mon–Sun week.
- N = number of those days that are **Done**.
- Rest days are excluded from both. A day can be Done even if today/future (if a session was completed).

**Streak (normative)**
- The streak counts **consecutive calendar days, walking backward from today**, where each day is either
  **Done** or a **Rest day** — i.e., the run breaks only on a **Missed** day.
- Rest days do **not** increment the streak but do **not** break it ("rest days don't count against your
  streak"): they are skipped/passed through.
- **Today** counts toward the streak if it is Done or a Rest day; if today is Planned-not-yet-done, the
  streak reflects the run ending yesterday (today doesn't break it until it becomes Missed at day end).
- The streak value shown on This Week and History must be identical (single computation in the data layer).

**Acceptance criteria**
- Given a plan and completed sessions, the strip shows N, M, streak, and seven correctly-colored dots
  matching the definitions above.
- The rail shows each day's planned workout name or "Rest", Mon→Sun, with today marked.
- The Today card shows today's planned workout and "Start workout" launches the Track flow for it.
- Tapping an exercise row opens its detail screen; tapping a rail day with a workout opens that workout.
- Streak and N-of-M recompute after a session is completed and after the plan changes, with no reload.

**Edge cases**
- **Nothing planned today** (today is a rest day): Today card shows a rest state ("Rest day — nothing
  planned", no Start button, or a "Browse workouts" affordance). No error.
- **No plan at all / brand-new user**: strip shows "0 of 0 workouts", streak 0, all dots Rest/empty; rail
  shows all "Rest"; empty-state Today card invites the user to Build a workout or pick one to schedule.
- **Planned workout references a deleted workout** (`plan` day → missing `workout_id`): that day renders
  as Rest (or a subtle "Workout removed") rather than crashing; it is excluded from M.
- **Multiple sessions completed on one day**: the day is Done once (not double-counted in N).
- **A completed session today for a non-planned workout** (user did something off-plan): day is Done for
  streak/N purposes; see Open Question #3 on whether it counts toward M.
- **Day boundary / timezone**: "today", "past", "future", and the week window are computed in device
  local time; crossing midnight re-buckets days (a Planned day becomes Missed at the next local midnight).
- **Very long today exercise list**: list scrolls; card and strip stay usable.

### 2.2 Workouts library (`1a` desktop / `1i` phone) — route `/workouts`

Searchable, filterable grid of saved workouts.

- **Header**: eyebrow "My Training", title "Workouts", search field ("Search workouts, exercises…"),
  and a workout count (phone shows the count next to the title).
- **Filter chips**: **All · Strength · Push · Pull · Legs · Cardio · Mobility** (single-select; "All"
  default). Note: these filter chips are a broader taxonomy than the Build **type** field
  (Strength/Hypertrophy/Power) — see Entities and Open Question #4 for how a workout maps to a filter
  category.
- **Grid**: desktop 3-column, phone 2-column cards. Each card: a category-colored gradient block, a
  **heart/favorite** toggle (filled terracotta when favorited), title, and a meta line
  ("55 min · 8 exercises · Strength"; cardio shows "35 min · Cardio").
- **Actions**: tap a card → open the workout (read view showing its exercises, with options to **Start**
  (Track, 2.4), **Edit** (Build, 2.3), **Favorite**, **Delete**, and **Schedule to a day**); toggle heart
  favorites without opening; a "New workout" / "+" affordance → Build a new workout (2.3).
- **Search** matches on workout name and (per placeholder) exercise names contained in the workout.

**Acceptance criteria**
- Selecting a filter chip narrows the grid to matching workouts; "All" shows everything.
- Typing in search filters the grid live by name (and by contained exercise name).
- Tapping the heart toggles `favorite` and persists immediately; the icon reflects state.
- Estimated duration and exercise count on each card are derived (see duration estimate in 2.3), not
  free-typed.

**Edge cases**
- **Empty library (no workouts)**: friendly empty state with a primary "Build your first workout" CTA;
  no empty grid.
- **Search/filter yields nothing**: "No workouts match" state with a clear-filters affordance.
- **Very long library**: grid scrolls/paginates; performance acceptable for e.g. 100+ workouts.
- **Workout with zero exercises** (allowed to save? see Open Question #5): card meta reads "0 exercises",
  duration "—".
- **Deleting a workout** that is referenced by `plan` days or past `sessions`: allowed; the plan day
  becomes Rest/"removed" (2.1) and past sessions become orphaned (`workout: null`, see 2.6). Deletion is a
  destructive action → confirm first (per CLAUDE.md, destructive actions surface to the user).

### 2.3 Build — design / edit a workout (`1e` desktop / `1j` phone) — route `/build` (new) and `/build/:workoutId` (edit)

Same screen for creating and editing.

- **Header**: eyebrow "Build", title "New workout" (or the workout name when editing), **Cancel** and
  **Save workout** (phone: "Save").
- **Name field**: editable large text (design shows "Push Day A" in a panel).
- **Type chips**: **Strength · Hypertrophy · Power** (single-select). This is the workout's `type`.
- **Estimate**: running "N exercises · ~X min" (design "8 exercises · ~55 min"), recomputed as exercises
  and sets/reps/rest change. Estimate formula defined below.
- **Exercise list**: ordered rows, each with a **drag handle** (reorder), a color chip, exercise name +
  muscles subtitle, and three **steppers**: **Sets**, **Reps**, **Rest**. A row can be **removed**.
  Reps may be a single number or a range (e.g. "8–10"); rest is in seconds (e.g. "90s"). An
  **"Add exercise"** dashed row appends from the library.
- **Exercise library panel** (desktop: right sidebar; phone: sheet/modal on "Add exercise"): searchable
  list of exercises, each with a "+" to add it to the workout. Also an affordance to **create a new
  exercise** (2.5 create) when the movement isn't in the library yet.
- **Save**: persists the `workout` (name, type, ordered `exercises[]` of `{exercise_id, sets, reps, rest}`)
  and returns to the workout view / library. **Cancel**: discards unsaved changes (confirm if dirty).

**Duration estimate (normative, tunable)** — sum over exercises of
`sets × (avg_reps × per_rep_seconds + rest_seconds)`, using a fixed `per_rep_seconds` (e.g. 3.5s) and
`avg_reps` = midpoint of the rep range; rounded to the nearest 5 min. Exact constants are an
implementation detail recorded in `docs/decisions.md`; the requirement is that the estimate is derived
and updates live.

**Acceptance criteria**
- A user can set a name, pick a type, add ≥1 exercise, set sets/reps/rest per exercise, reorder via drag,
  remove an exercise, and Save; the saved workout appears in the library with correct meta.
- Editing an existing workout pre-fills all fields; Save updates in place (same `workout` id); it does not
  create a duplicate.
- The "N exercises · ~X min" estimate updates immediately on any add/remove/stepper change.
- Steppers enforce sane bounds (sets ≥ 1, reps ≥ 1, rest ≥ 0); reps supports a range.
- Adding an exercise from the library inserts it at the end with sensible default sets/reps/rest.

**Edge cases**
- **Save with no name**: block with inline validation ("Name your workout") or default a name — pick one
  (Open Question #5); do not save a nameless workout silently.
- **Save with zero exercises**: warn/confirm; whether allowed is Open Question #5.
- **Duplicate exercise added twice**: allowed (e.g. two bench blocks); each row is independent.
- **Editing a workout that is scheduled/has past sessions**: edits apply going forward; past `sessions`
  are historical snapshots and are **not** retro-changed (see 2.4/2.6).
- **Reorder on phone** (no precise drag): provide up/down or long-press drag; order persists in
  `exercises[]` sequence.
- **Cancel with unsaved changes**: confirm before discarding.
- **Exercise deleted from library while in a workout**: the row shows a "removed exercise" placeholder and
  can be removed; Save drops it (see 2.6 orphan handling).

### 2.4 Track a workout — active session — route `/track/:workoutId` (new screen; not in the prototype)

The "track it" flow. **Not shown in the design**, so defined here; it must use the Pantry design language
(same tokens, cards, chips, terracotta accent) and feel consistent with This Week / Build.

**Purpose**: guide the user through the workout exercise-by-exercise, capturing **actuals** per set, and
on completion write a `session` and update This Week / streak / History.

**States**
1. **Not started** — entered from "Start workout" (This Week Today card, or a workout's Start action). A
   brief summary (name, N exercises, est. time) with a **"Begin"**/start affordance. A session in this
   state is not yet persisted as complete.
2. **In progress** — the working state:
   - The workout's exercises are shown as a checklist grouped by exercise. Each exercise shows its target
     ("4 × 8–10 · 90s rest"), a link to its **Exercise detail** (demo + how-to, 2.5), and a **"Last time:
     140 lb × 8"** hint per exercise when prior data exists.
   - For each **set**, the user enters **actual weight** and **actual reps** and checks the set off.
     Checking a set marks it complete; unchecking reverts. Prefill each set's inputs with the target reps
     and the last-time weight to minimize typing.
   - **Rest timer** (optional): checking off a set may start a countdown for that exercise's `rest`
     seconds, with a visible timer and skip/dismiss. The timer is a convenience; it does not block
     logging.
   - Progress indicator: "X of Y sets done" for the session.
   - The user can add a set, skip a set, or skip an exercise.
3. **Paused / abandoned** — the user navigates away or explicitly leaves without completing. In-progress
   actuals are **preserved locally** so the session can be resumed (a "Resume workout" affordance appears
   on This Week / the workout). An abandoned session is **not** counted as Done and does **not** create a
   completed `session` (see Open Question #2 on whether partial sessions are persisted as `abandoned`).
4. **Complete** — the user taps **"Finish workout"**. This creates a `session` row with `date` = now
   (local), `workout_id`, and per-set actuals (`weight`, `reps`, completed flag per set), plus derived
   totals (duration, total sets, total volume). On completion: This Week marks today Done, the streak/N-of-M
   recompute, and the session appears in History. Show a brief completion summary (duration, sets, volume,
   any PRs).

**Acceptance criteria**
- Starting from This Week's "Start workout" opens the Track flow for today's planned workout.
- The user can enter weight × reps and check off each set; entries persist across set/exercise navigation
  within the session.
- Finishing creates exactly one completed `session` with all logged actuals and correct derived totals.
- After finishing, This Week (Done dot, N-of-M, streak) and History reflect the new session without reload.
- Leaving mid-session preserves progress and offers Resume; it does not mark the day Done.
- Each exercise in the flow links to its Exercise detail; "Last time" reflects the most recent prior
  completed session for that exercise (or is hidden if none).

**Edge cases**
- **Finish with some sets unchecked**: allowed; only checked/entered sets are recorded, session still
  completes and marks the day Done. (Confirm if zero sets were logged — see below.)
- **Finish with zero sets logged**: warn/confirm ("Nothing logged — finish anyway?"); if confirmed, decide
  whether it counts as Done (Open Question #3).
- **Weight/reps left blank on a checked set**: treat as bodyweight/0 or require entry — record as 0/blank
  gracefully; do not crash volume math (skip nulls in volume).
- **Workout edited or exercise deleted mid-session**: the active session uses a **snapshot** taken at
  start; changes to the source workout do not mutate the in-progress session.
- **App closed / reload mid-session**: in-progress actuals restored from local persistence (Resume).
- **Cardio/timed workouts** (e.g. "5K Interval Run") that aren't weight×reps: the set model degrades to
  distance/time or a simple "done" check — v1 may log these as a single completed entry; full cardio
  logging is Open Question #7.
- **Starting a workout that has zero exercises**: nothing to track — block start with a message.

### 2.5 Exercises library + Exercise detail (`1g` desktop / `1k` phone) — routes `/exercises` and `/exercises/:exerciseId`

**Exercises library grid** (`/exercises`) — desktop-only nav item (phone reaches exercise detail via
Build/Workout/This Week rows; see 3. Responsive). A searchable/filterable grid of the exercise database;
each tile shows the exercise (color chip, name, muscles) and opens its detail. Includes a **"New exercise"**
affordance to add to the user-built database.

**Exercise detail** (`/exercises/:exerciseId`) — the "show me how to do it" surface:
- **Demo** — a clip/illustration with a **play button** and a **duration** badge (design "0:45"). The
  media is served/bundled locally and streamed on demand (Range where server-backed); it must play
  offline. When the exercise has no demo (`has_demo` = false / no asset), show a graceful placeholder
  (illustration or "No demo yet") instead of a broken player.
- **Title** + **tag pills**: muscles worked (e.g. Chest · Triceps · Front delts), equipment (Barbell),
  and difficulty (Intermediate).
- **"How to"** — an ordered, numbered step list (design shows 4 steps for Bench Press).
- **"In this workout"** panel — when the detail is opened from within a workout/session context, shows
  that workout's prescription for the exercise ("4 sets × 8–10 reps · 90s rest") and **"Last time:
  140 lb × 8"** (most recent completed session actuals for this exercise). When opened standalone (from
  the Exercises grid), this panel is hidden or shows only "Last time".
- **Back** link reflects context (design "← Push Day A").

**Create / edit an exercise** — the user builds this database. Form fields: **name**, **category**,
**equipment**, **difficulty**, **muscles worked** (list/tags), ordered **how-to steps**, and an optional
**demo clip upload**. Editing an existing exercise updates it in place; the change is reflected everywhere
the exercise appears.

**Acceptance criteria**
- Detail shows demo (play + duration), muscle/equipment/difficulty tags, numbered how-to steps, and the
  in-this-workout panel with last-time data when available.
- Play controls actually play the local demo; offline playback works.
- Creating an exercise with name + at least the required fields adds it to the library and makes it
  selectable in Build immediately.
- Editing an exercise updates its detail and every workout row that references it (by `exercise_id`).
- "Last time" shows the most recent completed session's actuals for that exercise, or is hidden if none.

**Edge cases**
- **`has_demo` false / missing/broken demo asset**: placeholder, not a broken player; duration badge hidden.
- **No how-to steps** (user-created, left blank): show "No steps yet" rather than an empty list.
- **Exercise referenced by workouts/sessions is deleted**: workouts show a "removed exercise" placeholder
  (2.3), past sessions keep the logged name snapshot (2.6); the detail route for a deleted exercise shows
  a "not found" state.
- **Very long muscle/step lists**: wrap/scroll gracefully.
- **Large demo upload**: enforce a sane size/type limit with clear feedback (mechanism per storage
  decision; must remain offline-capable).

### 2.6 History / progress (`1h` desktop / `1l` phone) — route `/history`

Past sessions + simple progress over time.

- **Summary stat tiles** (desktop 4-up): **This month** (N workouts), **Total volume** (e.g. "82.4k lb"),
  **Current streak** (days, terracotta — same value as This Week), **PRs this month** (count).
- **Progress chart**: **Weekly volume**, last 8 weeks, bar chart (lb), latest week highlighted terracotta.
  v1 is a simple derived bar chart; deeper per-exercise progression is a nice-to-have (Open Question #7).
- **Recent sessions list**: each row = category chip + workout name + meta ("Today · 52 min · 24 sets";
  "Sun · 61 min · 18 sets"; cardio "Thu · 34 min · 4.9 km") + optional **PR badge** ("+5 lb PR"). Tapping a
  session opens a session detail (per-exercise actuals) — session detail view is implied; spec it as a
  read-only breakdown of the logged sets.

**Acceptance criteria**
- Stat tiles derive from completed `sessions`; current streak equals This Week's streak.
- Recent sessions list is ordered most-recent-first with correct date labels (Today/Yesterday/weekday/date)
  and derived meta (duration, set count, volume or distance).
- The weekly-volume chart reflects the last 8 local weeks of completed sessions.
- A session whose workout was later deleted still appears with a graceful label (see below).

**Edge cases**
- **Orphaned session** (`workout` since deleted → the join returns `workout: null`): the row renders using
  the session's own snapshot (stored workout name/category at session time) or a neutral "Deleted workout"
  label; it still contributes to volume/streak/counts. Never crash on a null workout.
- **No sessions yet (new user)**: empty state ("No sessions yet — finish a workout to see it here"); stat
  tiles show zeros; chart shows an empty/zero baseline.
- **PR definition**: a PR = a completed set whose weight (at given reps) exceeds the prior best for that
  exercise. Exact rule recorded in `docs/decisions.md`; "PRs this month" and the badge use the same rule.
- **Cardio session with no weight volume**: excluded from "Total volume"/weekly-volume (or counted as 0);
  shows distance/time in its row instead.
- **Very long history**: list paginates / lazy-loads; chart stays fixed to last 8 weeks.

---

## 3. Entities / fields (product level)

Names match `CLAUDE.md`. Exact column types, the scalar+JSON split, and indexes belong in
`docs/data-shapes.md`; the typed accessor contract belongs in `docs/api.md`. Product-level shapes:

- **`exercises`** — the user-built movement database. Fields: `id`, `name`, `category`, `equipment`,
  `difficulty`, `muscles` (worked; list), `how_to` (ordered steps; list of strings), `has_demo` (bool),
  and a reference to the demo asset (path/blob per storage decision). Seed set ships built-in.
- **`workouts`** — a designed workout. Fields: `id`, `name`, `type` (Strength | Hypertrophy | Power),
  `favorite` (bool), a display/filter `category` (for the Workouts filter chips: Strength/Push/Pull/Legs/
  Cardio/Mobility — see Open Question #4), and `exercises[]`, an **ordered** list of
  `{ exercise_id, sets, reps, rest }` where `reps` may be a single value or a range and `rest` is seconds.
- **`plan`** — the weekly schedule mapping **day → `workout_id`** (a day with no entry = Rest). Whether the
  plan is a fixed Mon–Sun weekly template or date-keyed is Open Question #3; product behavior above assumes
  a Mon–Sun weekly mapping applied to the current week.
- **`sessions`** — a completed (or in-progress) tracked workout. Fields: `id`, `workout_id` (nullable once
  the workout is deleted → orphan), a **snapshot** of workout name/category at completion, `date`
  (local datetime), `status` (in_progress | complete | possibly abandoned — Open Question #2), per-exercise
  **actuals**: per set `{ weight, reps, completed }`, and derived totals (`duration`, `total_sets`,
  `total_volume`, distance for cardio). Sessions are historical and are not mutated by later edits to the
  source workout.

Relationships: a `workout.exercises[].exercise_id` → `exercises.id`; a `plan[day]` → `workouts.id`; a
`session.workout_id` → `workouts.id` (nullable). Deleting an exercise or workout must degrade gracefully
everywhere per the edge cases above (never a hard crash).

---

## 4. Responsive behavior

One app, one set of routes, layout switches at a breakpoint (do not fork).

- **Desktop (≥ breakpoint)**: left **sidebar** with brand "Reps", **five** nav items —
  This Week · Workouts · Build · Exercises · History — and a "My Training" user footer ("8 workouts").
- **Phone (< breakpoint)**: bottom **tab bar** with **four** tabs — **This Week · Workouts · Build ·
  History** (per design). **Exercises** has **no** dedicated phone tab; on phone the exercise library/detail
  is reached contextually (tapping an exercise row in This Week, a Workout, the Build library sheet, or a
  session). The route `/exercises` still exists and works if navigated to directly.
- Screen content reflows: grids go 3-col → 2-col (Workouts) / single column; the Build library sidebar
  becomes an "Add exercise" sheet; the exercise detail stacks demo → title → tags → how-to → panel.
- Same URLs on both; deep links (e.g. `/exercises/:id`, `/track/:workoutId`) work in either layout.
- PWA: installable on desktop and phone; offline shell + demo media available offline.

---

## 5. Seed data

The app ships with a small **built-in starter set** so it is not empty on first run:

- **Seed exercises** (with real muscles/equipment/difficulty and genuine numbered how-to steps): at
  minimum those shown in the design — **Back Squat, Romanian Deadlift, Leg Press, Walking Lunge, Seated Leg
  Curl, Standing Calf Raise, Barbell Bench Press, Incline Dumbbell Press, Overhead Press, Cable Fly, Dips,
  Lateral Raise, Skullcrusher**. Bench Press ships with the four how-to steps and a 0:45 demo shown in the
  design. Each seed exercise should have a bundled demo asset where feasible; where not, `has_demo=false`
  with a placeholder is acceptable.
- **Seed workouts** (optional but recommended so Workouts/This Week aren't empty): the ones in the design —
  **Push Day A, Pull Day A, Leg Day, Full Body Express, Core & Mobility, 5K Interval Run** — with their
  meta as shown.
- **Seed plan** (optional): a sample Mon–Sun plan matching the design rail (Mon Pull Day A, Tue Rest, Wed
  Push Day A, Thu Leg Day, Fri Core & Mobility, Sat Rest, Sun 5K Interval Run) so This Week demonstrates the
  strip/rail/streak on first run.
- Whether seed sessions ship (to demo History/streak on first run) is Open Question #3/#8; default: no seed
  sessions, so a real new user starts with a genuine empty History.

Exact seed contents live in a seed module and are documented alongside `docs/data-shapes.md`.

---

## 6. Non-goals (explicitly out of scope for v1)

- Multi-user, accounts, or login of any kind.
- Cross-account or social features (sharing, following, feeds, comments, leaderboards).
- Native app-store apps (iOS/Android) — this is a responsive web app / PWA only.
- External exercise APIs / third-party exercise databases or CDNs — the library is user-built and all
  media is local.
- Multi-user cloud accounts. (Single-user cross-device sync **is** in scope — one shared hosted DB;
  see `docs/decisions.md`.)
- Advanced coaching: auto-progression/programming, 1RM calculators, nutrition, bodyweight tracking, wearables.
- A global unit (kg/lb) toggle (v1 is lb) — see Open Question #6.

---

## 7. Open questions

1. **Storage architecture (blocking).** `CLAUDE.md` says client-only (IndexedDB via `idb`, no server,
   demo media bundled locally). The task brief and `docs/design.md` say Express + better-sqlite3 with
   demo media on disk streamed via `GET /api/exercises/:id/demo` (Range). Which is authoritative? This
   determines how demo playback, uploads, and "last time" lookups are implemented. Needs an entry in
   `docs/decisions.md` before data/backend agents start. (Spec is written to hold either way.)
2. **Abandoned/in-progress session persistence.** Is a paused/abandoned session persisted with
   `status = in_progress`/`abandoned` (enabling Resume across app restarts and appearing nowhere in
   History), or kept only in volatile local state? Affects the `sessions.status` field and Resume UX.
3. **Off-plan sessions & `plan` shape.** Is `plan` a fixed Mon–Sun weekly template or date-keyed to actual
   dates? And does a completed session for a **non-planned** workout count toward "M" (denominator) or only
   toward N/streak? Also: do any seed sessions ship to demo History on first run?
4. **Workout `category` vs `type`.** The Workouts filter chips (Strength/Push/Pull/Legs/Cardio/Mobility) are
   a different axis than the Build `type` (Strength/Hypertrophy/Power). Is `category` a separate stored
   field chosen in Build, derived from the exercises, or free-form? Design implies a stored category per
   workout.
5. **Validation on Save (Build).** Is a workout with no name and/or zero exercises allowed to save (draft),
   or blocked with validation? Pick one and record it.
6. **Units.** v1 is lb-only. Is a kg option needed, and if so is it global or per-set? (Currently a non-goal.)
7. **Cardio/timed logging & progress depth.** How rich should cardio session logging be (distance/time vs a
   simple done-check), and how deep should History progress go (weekly-volume bars only vs per-exercise
   progression / PR history charts)?
8. **PR definition.** Exact rule for a PR (heaviest weight at any reps? estimated 1RM? per-rep-scheme best?)
   used by the History PR badge and "PRs this month" tile — needs to be pinned in `docs/decisions.md`.
