# Data shapes — Reps server

Owner: backend-agent. Source of truth for the SQLite schema (`server/db.js`) and the JSON
entity shapes the API returns (`rowTo*()` in `server/lib/serialize.js`). Field names match
`CLAUDE.md` / `docs/decisions.md` exactly — the frontend should build against this document and
`docs/api.md`, not against the DB directly.

Storage: single-file SQLite `server/reps.db`, WAL mode, accessed via `better-sqlite3` with plain
prepared statements (no ORM). Schema + idempotent boot migrations live in `server/db.js`. Every
JSON column below is `TEXT` in SQLite, `JSON.stringify`'d on write and `JSON.parse`'d (with a
safe fallback to `[]`) on read — that boundary is the *only* place this app touches JSON strings;
routes and the frontend always see real arrays/objects.

---

## Tables

### `exercises`

The user-built movement database.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | `crypto.randomUUID()` |
| `name` | TEXT | required |
| `category` | TEXT | one of `Strength · Push · Pull · Legs · Cardio · Mobility`, nullable |
| `equipment` | TEXT | free text, nullable |
| `difficulty` | TEXT | free text (e.g. `Beginner/Intermediate/Advanced`), nullable |
| `demo_file` | TEXT | bare filename on disk under `server/media/`; **never returned by the API** |
| `image` | TEXT | optional small thumbnail reference/URL, nullable |
| `source_url` | TEXT | optional, nullable |
| `video_url` | TEXT | YouTube demo link, nullable — set manually or via the Gemini Autofill suggestion (decision #16); only ever stored if it's a well-formed http(s) URL, otherwise coerced to `NULL`. Renders as an inline embed + library thumbnail. Does **not** power the local seek-per-step demo (that's `demo_file`) |
| `muscles_worked` | TEXT (JSON `string[]`) | e.g. `["Chest","Triceps"]` |
| `how_to` | TEXT (JSON `string[]`) | ordered numbered steps |
| `step_times` | TEXT (JSON `number[]`) | seconds, positionally parallel to `how_to`; `[]` if lengths don't match |
| `tags` | TEXT (JSON `string[]`) | free-form |
| `created_at` / `updated_at` | TEXT | ISO datetime |

Demo media lives on disk, never in the DB — see "Media on disk" below.

### `workouts`

A designed workout.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `title` | TEXT | required |
| `type` | TEXT | one of `Strength · Hypertrophy · Power` (Build's type chips) |
| `category` | TEXT | one of `Strength · Push · Pull · Legs · Cardio · Mobility` (Workouts filter chips) — decision #6: stored separately from `type` |
| `favorite` | INTEGER (0/1) | |
| `est_minutes` | INTEGER | **always server-computed**, never trusted from the client — decision #11 |
| `image` | TEXT | nullable |
| `gym_id` | TEXT, nullable | assigns the workout to a gym (decision #18). `NULL` = **"Any gym"** — the generic default, not a real gym row, applies no filtering. **No FK enforcement**: an unknown/dangling `gym_id` (e.g. its gym was deleted) is stored and returned as-is; the client treats any `gym_id` that doesn't resolve to a real gym as "Any gym" |
| `exercises` | TEXT (JSON array) | ordered `[{ exercise_id, sets, reps, rest }]` — `reps` is a number or a range string (`"8-10"`); `rest` is seconds |
| `created_at` / `updated_at` | TEXT | ISO datetime |

### `gyms`

A reference library of gyms/places and their equipment (decision #17). Storage/display only for
now — not referenced by `workouts`, `exercises`, or `sessions`, so `DELETE` has no cascade.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | `crypto.randomUUID()` |
| `name` | TEXT | required |
| `favorite` | INTEGER (0/1) | default 0 |
| `image` | TEXT | nullable |
| `equipment` | TEXT (JSON `string[]`) | e.g. `["Dumbbells","Pull-up bar"]` — trimmed, deduped, non-string/blank entries dropped on write |
| `created_at` / `updated_at` | TEXT | ISO datetime |

### `plan`

Fixed **Mon–Sun weekly template** (not date-keyed) — decision #4. One row per weekday, seeded
by `migrate()` on first boot.

| Column | Type | Notes |
|---|---|---|
| `day` | TEXT PK | one of `mon,tue,wed,thu,fri,sat,sun` |
| `workout_id` | TEXT, nullable | `NULL` = Rest day. No enforced FK — deleting a workout nulls every plan row pointing at it (handled explicitly in the `DELETE /api/workouts/:id` route, not via SQLite FK cascade) |

### `schedule`

Date-keyed overrides layered over the `plan` weekly template (specs/schedule.md, decision #21).
An empty table means every date is **unset** and falls back to `plan[weekday]` — the app behaves
exactly as before this feature until the user schedules a specific date. No seed rows.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | `crypto.randomUUID()` |
| `date` | TEXT | local calendar date `YYYY-MM-DD` (device-local, decision #12 — no timezone conversion) |
| `workout_id` | TEXT, nullable | a workout planned on that date; **`NULL` = the date's explicit Rest-marker**. No enforced FK — a dangling `workout_id` (its workout was deleted) is defensively skipped on read; in practice `DELETE /api/workouts/:id` deletes the referencing rows outright (see cascade below), so a dangling row should only ever be transient |
| `sort_order` | INTEGER | stable order of multiple workouts on one date, ascending; ties broken by `created_at`/row order |
| `created_at` | TEXT | ISO datetime |

**Set vs unset vs Rest (normative, mirrors `plannedWorkoutsForDate` below):**
- A date is **"set"** iff it has **≥ 1** row in `schedule`.
- **Explicit Rest** = a date that is set with exactly **one** row whose `workout_id` is `NULL`.
  Overrides the template with *nothing* (no planned workout that date).
- **Unset** = a date with **zero** rows → falls back to the weekly `plan` template for that weekday.
- Duplicate workouts on one date are allowed (two rows, same `workout_id`) — N-of-M treats them as
  two distinct planned entries (see below).

**Index**: `schedule(date)` (all reads are by date/date-range).

**Workout deletion cascade** (delta to `DELETE /api/workouts/:id`): rows in `schedule` referencing
the deleted `workout_id` are **deleted**, never nulled — a NULL row means explicit Rest, which must
not be silently created. If that leaves a date with zero rows, it reverts to template fallback; any
other rows on the date are left alone.

### `sessions`

A **completed** tracked workout only (decision #5 — in-progress/abandoned sessions live in
client-side local state and never reach the server). No hard FK to `workouts`, by design, so a
session survives the deletion of its source workout — see snapshot fields below.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `workout_id` | TEXT, nullable | kept even after the workout is deleted (no FK enforcement) |
| `workout_title` | TEXT | **snapshot** of the workout's title at completion time |
| `workout_category` | TEXT, nullable | **snapshot** of the workout's category at completion time |
| `date` | TEXT | ISO datetime representing the local moment the session was logged; the API buckets sessions into calendar days by taking the first 10 characters (`YYYY-MM-DD`) of this string, so the **client should send its own local wall-clock ISO string** here (server does not attempt timezone conversion) |
| `duration_sec` | INTEGER | derived from `started_at`/`ended_at` if provided, else the client-supplied `duration_sec` |
| `total_sets` | INTEGER | server-derived: count of sets across all entries with `completed: true` |
| `total_volume` | REAL | server-derived: Σ `weight × reps` over completed sets (nulls treated as 0), lb |
| `distance_km` | REAL, nullable | optional cardio distance |
| `entries` | TEXT (JSON array) | `[{ exercise_id, exercise_name, sets: [{ weight, reps, completed }] }]` — `exercise_name` is a snapshot (filled from the live exercise if the client omits it) |
| `prs` | TEXT (JSON array) | server-derived at creation: `[{ exercise_id, exercise_name, prior_best, new_best, delta }]` — see PR rule below |
| `created_at` | TEXT | ISO datetime, server-set |

**Indexes**: `exercises(name)`, `exercises(category)`, `workouts(category)`, `workouts(favorite)`,
`sessions(date)`, `sessions(workout_id)`, `gyms(favorite)`, `schedule(date)`.

**Idempotent boot migration**: on every boot, `server/db.js` reads `PRAGMA table_info` for each
table and `ALTER TABLE ... ADD COLUMN`s anything missing, so an existing DB upgrades in place
without a separate migration runner.

---

## Media on disk

Demo clips/illustrations are never stored in the DB. `exercises.demo_file` holds a bare filename;
the actual bytes live at `server/media/<exerciseId>.<ext>`. Two upload paths:

- **Draft-then-claim** (used when creating a new exercise, before it has an id):
  `POST /api/exercises/demo/draft` → file lands at `server/media/drafts/<token>.<ext>`, returns
  `{ draft_token, filename }`. Passing that `draft_token` in the body of `POST /api/exercises` or
  `PUT /api/exercises/:id` moves (claims) the draft into `server/media/<exerciseId>.<ext>` and sets
  `demo_file`.
- **Direct upload** onto an existing exercise: `POST /api/exercises/:id/demo` (multipart) writes
  straight to `server/media/<id>.<ext>`, replacing any prior file.
- Drafts older than 24h are swept on boot and once every 24h thereafter (`sweepStaleDrafts` in
  `server/lib/media.js`).
- The API **never** exposes `demo_file`; every exercise shape instead carries a computed
  `has_demo: boolean` (true iff a file for that id exists on disk). Playback is
  `GET /api/exercises/:id/demo`, which streams the file with HTTP Range support.

---

## Gemini autofill (decision #16)

The **only** external API this app calls, and only server-side (`server/lib/gemini.js`). `POST
/api/exercises/autofill` (see `docs/api.md`) sends just an exercise `name` to Google Gemini and
returns a **suggestion** object — never persisted directly, never touching `exercises` until the
user reviews it in the form and hits Save via the normal `POST`/`PUT`. The suggestion shape:

```jsonc
{
  "category": "Push" | null,          // one of Strength|Push|Pull|Legs|Cardio|Mobility, or null
  "equipment": "Barbell" | null,
  "difficulty": "Intermediate" | null,
  "muscles_worked": ["Chest", "Triceps"],
  "how_to": ["Lie flat...", "Unrack...", "Lower...", "Press up."],
  "tags": ["compound", "push"],
  "video_url": "https://www.youtube.com/watch?v=..." | null   // YouTube demo link
}
```

Env: `GEMINI_API_KEY` (required for the feature to work; the server otherwise still boots and
runs fine, the endpoint just returns `501`) and `GEMINI_MODEL` (default `gemini-2.0-flash`), both
read from `server/.env` (see `server/.env.example`), never exposed to the client.

## API entity shapes (what `rowTo*()` returns)

These are the exact JSON shapes the REST API sends/receives — see `docs/api.md` for the routes
that produce them.

### Exercise

```jsonc
{
  "id": "uuid",
  "name": "Barbell Bench Press",
  "category": "Push",
  "equipment": "Barbell",
  "difficulty": "Intermediate",
  "muscles_worked": ["Chest", "Triceps", "Front delts"],
  "how_to": ["Lie flat, feet planted...", "Unrack and hold...", "..."],
  "step_times": [10, 10, 15, 10],
  "tags": ["compound", "push"],
  "image": null,
  "source_url": null,
  "video_url": null, // YouTube demo link (manual or Gemini Autofill, decision #16); null if none
  "has_demo": false,
  "created_at": "2026-07-01T12:00:00.000Z",
  "updated_at": "2026-07-01T12:00:00.000Z"
  // GET /api/exercises/:id only: also includes:
  // "last_time": { "session_id": "uuid", "date": "...", "weight": 140, "reps": 8 } | null
}
```

### Workout

```jsonc
{
  "id": "uuid",
  "title": "Push Day A",
  "type": "Strength",
  "category": "Push",
  "favorite": false,
  "est_minutes": 55,
  "image": null,
  "gym_id": null, // decision #18 — null = "Any gym"; no FK, an unknown id is treated as Any gym client-side
  "exercises": [
    { "exercise_id": "uuid", "sets": 4, "reps": "8-10", "rest": 90 }
  ],
  "exercise_count": 7,
  "created_at": "...",
  "updated_at": "..."
}
```

### Gym

```jsonc
{
  "id": "uuid",
  "name": "Home Gym",
  "favorite": false,
  "image": null,
  "equipment": ["Dumbbells", "Adjustable bench", "Pull-up bar", "Resistance bands", "Kettlebells"],
  "created_at": "...",
  "updated_at": "..."
}
```

### Plan entry

```jsonc
{ "day": "mon", "workout": { /* Workout shape, or null for Rest */ } }
```

### Resolution rule — `plannedWorkoutsForDate(date)` (specs/schedule.md §4)

The single function `GET /api/week`, `GET /api/stats`, and `GET/PUT /api/schedule` use to
determine a calendar date's planned workouts (server/lib/week.js). Replaces every prior
"read `plan[weekday]`" lookup:

```
plannedWorkoutsForDate(date):
  rows = schedule rows where schedule.date == date
  if rows is non-empty (date is "set"):
     if the only row is a Rest-marker (workout_id == NULL): return []   // explicit Rest
     return [ workout for each row with non-NULL workout_id, ordered by
              sort_order, resolved via workouts table, skipping any
              workout_id that no longer exists ]                        // 0..n
  else (unset):
     w = plan[weekday(date)].workout_id
     return w ? [resolve(w)] : []                                       // 0 or 1
```

An empty result means Rest for that date regardless of whether it came from an explicit Rest
override or an unset weekday with no template workout. `weekday(date)` and all date math are
device-local (decision #12).

### Schedule entry (`GET`/`PUT /api/schedule` — resolved shape)

```jsonc
{
  "date": "2026-07-16",
  "source": "schedule" | "template" | "rest",  // "schedule" = date-set override with workouts,
                                                 // "rest" = explicit Rest override (set, NULL marker),
                                                 // "template" = unset -> fell back to the weekly plan
  "is_set": true,                               // date has >=1 row in `schedule` (an override exists)
  "workouts": [ { /* Workout */ } ],             // resolved via plannedWorkoutsForDate; [] = Rest
  "status": "planned"                            // done | rest | missed | planned (completion overlay)
}
```

### Session

```jsonc
{
  "id": "uuid",
  "workout_id": "uuid | null",
  "workout_title": "Push Day A",
  "workout_category": "Push",
  "date": "2026-07-08T18:30:00.000Z",
  "duration_sec": 3120,
  "total_sets": 24,
  "total_volume": 8240,
  "distance_km": null,
  "entries": [
    {
      "exercise_id": "uuid",
      "exercise_name": "Barbell Bench Press",
      "sets": [{ "weight": 140, "reps": 8, "completed": true }]
    }
  ],
  "prs": [
    { "exercise_id": "uuid", "exercise_name": "Barbell Bench Press", "prior_best": 135, "new_best": 140, "delta": 5 }
  ],
  "created_at": "..."
}
```

### Week payload (`GET /api/week`)

Each day's plan is now resolved via `plannedWorkoutsForDate` (above), so a day can have **0, 1, or
several** planned workouts — the per-day `workout` (single) field from before this feature is
**replaced by `workouts` (array, possibly empty)** (decision #21 / specs/schedule.md §5.4):

```jsonc
{
  "today_date": "2026-07-08",
  "n": 2,
  "m": 5,
  "streak": 6,
  "days": [
    { "day": "mon", "date": "2026-07-06", "status": "done", "is_today": false, "workouts": [ { /* Workout */ } ] }
    // ... tue..sun — "workouts" may be [], [one workout], or several
  ],
  "today": { /* the one entry from `days` where is_today === true, same shape, "workouts" plural */ }
}
```
`status` is one of `done | rest | missed | planned` and is still computed at the **day level**
(decision #4 preserved — see `docs/api.md` for the normative rules). `n`/`m` are now computed at
the **workout level** per specs/schedule.md §5.2 (see `docs/api.md`) — with multiple workouts per
day, `m` sums every planned entry across the week and `n` sums each day's satisfied-entry count
plus at most one off-plan credit per day.

### Stats payload (`GET /api/stats`)

```jsonc
{
  "this_month_count": 12,
  "total_volume": 82412.5,
  "current_streak": 6,
  "prs_this_month": 3,
  "weekly_volume": [
    { "week_start": "2026-05-18", "week_end": "2026-05-24", "volume": 9100 }
    // ... 8 entries total, oldest -> newest, ending with the current week
  ]
}
```

---

## PR rule (decision #10)

A PR = a completed set whose **weight** exceeds the **heaviest weight ever logged** for that
exercise across all prior completed sessions (any rep count). The very first time an exercise is
ever logged is **not** a PR (nothing to exceed). `session.prs` is computed once, at session
creation, from every session already in the DB at that moment — it is a historical fact and is
never recomputed retroactively.

---

## Seed data (`server/seed.js`, idempotent — safe to re-run)

- **21 exercises** total:
  - The 13 required by the spec, each with real `muscles_worked`/`equipment`/`difficulty` and 3-4
    genuine `how_to` steps: **Back Squat, Romanian Deadlift, Leg Press, Walking Lunge, Seated Leg
    Curl, Standing Calf Raise, Barbell Bench Press** (the exact 4-step design copy),
    **Incline Dumbbell Press, Overhead Press, Cable Fly, Dips, Lateral Raise, Skullcrusher**.
  - 8 supplementary exercises added so **Pull Day A**, **Core & Mobility**, and **5K Interval Run**
    have real, sensible movements to reference (the required 13 are all push/leg movements and
    don't cover a pull day or cardio/mobility on their own): **Lat Pulldown, Seated Cable Row,
    Barbell Bicep Curl, Face Pull, Plank, Dead Bug, Cat-Cow Stretch, Interval Run**.
  - All seed exercises ship with `has_demo: false` (no bundled media) — the frontend should render
    the placeholder state.
- **6 workouts**: **Push Day A** (Push), **Pull Day A** (Pull), **Leg Day** (Legs), **Full Body
  Express** (Strength), **Core & Mobility** (Mobility), **5K Interval Run** (Cardio) — `est_minutes`
  computed by the same formula the live API uses, not hardcoded.
- **Plan**: Mon → Pull Day A, Tue → Rest, Wed → Push Day A, Thu → Leg Day, Fri → Core & Mobility,
  Sat → Rest, Sun → 5K Interval Run. Re-running the seed only fills days that are still unset
  (Rest), so it never clobbers a user's own schedule changes.
- **No seed sessions** — a new user's History is genuinely empty (decision #4 / spec §5).
- **2 gyms** (decision #17), so the Gym section isn't empty on first run: **Home Gym**
  (`Dumbbells, Adjustable bench, Pull-up bar, Resistance bands, Kettlebells`) and
  **Commercial Gym** (`Barbell, Squat rack, Cable machine, Leg press, Smith machine, Treadmill,
  Rowing machine, Dumbbells, Bench`).
