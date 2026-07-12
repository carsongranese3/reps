# API — Reps server

Owner: backend-agent. The HTTP REST contract every frontend request goes through — no component
calls `fetch` ad hoc or touches SQL. Base URL in dev: `http://localhost:4000` (Express on
`PORT` env var, default `4000`); the Vite client runs on its own port and talks to this over CORS
(the server reflects the request origin — single-user, no-auth app). In production the same
Express server also serves the built client from `client/dist`.

All entity shapes referenced below (Exercise, Workout, Gym, Plan entry, Session, Week payload,
Stats payload) are fully specified in `docs/data-shapes.md` — this document is the
routes/params/status codes; that document is the JSON shapes.

## Conventions

- JSON in, JSON out. `Content-Type: application/json` except the two multipart upload routes.
- **Error shape** (consistent everywhere):
  ```json
  { "error": { "message": "human readable message" } }
  ```
  `404` for missing resources, `400` for validation failures, `500` for unexpected errors.
- No auth (single user, no login, per `CLAUDE.md`).
- Booleans round-trip as real JSON `true`/`false` (e.g. `favorite`, `has_demo`), never `0`/`1` —
  that coercion only happens inside the DB layer.

---

## Exercises

### `GET /api/exercises`
List the exercise library.

Query params (all optional):
| Param | Type | Effect |
|---|---|---|
| `q` | string | case-insensitive substring match on `name` |
| `category` | string | exact match on `category` |

Response: `200` → `Exercise[]` (sorted by `name` ascending). Never includes `last_time` (only the
single-exercise `GET` does, to avoid an N+1 query on the grid).

### `GET /api/exercises/:id`
Response: `200` → `Exercise` (includes `last_time`, see `docs/data-shapes.md`) · `404` if not found.

### `POST /api/exercises`
Create an exercise.

Body:
```jsonc
{
  "name": "Barbell Bench Press",       // required, non-empty after trim
  "category": "Push",                   // optional; if present must be one of Strength|Push|Pull|Legs|Cardio|Mobility
  "equipment": "Barbell",               // optional
  "difficulty": "Intermediate",         // optional
  "muscles_worked": ["Chest","Triceps"],// optional, string[]
  "how_to": ["Step 1", "Step 2"],       // optional, ordered string[]
  "step_times": [10, 15],               // optional, number[] — dropped if length != how_to.length
  "tags": ["compound"],                 // optional, string[]
  "image": null,                        // optional
  "source_url": null,                   // optional
  "video_url": null,                    // optional — YouTube demo link (see decision #16);
                                         //   only kept if it's a well-formed http(s) URL, else stored as null
  "draft_token": "..."                  // optional — claims a prior POST /api/exercises/demo/draft upload as this exercise's demo
}
```
Response: `201` → `Exercise` · `400` if `name` is empty or `category` is invalid.

### `PUT /api/exercises/:id`
Update an exercise in place (same id, no duplicate). Body: same shape as `POST`, but any field you
omit keeps its current value (patch semantics) — `name` still can't be blanked out. `draft_token`
may also be supplied here to replace the demo. `video_url` follows the same patch semantics: omit
it to keep the current value, send `null`/an empty string to clear it, or send a non-http(s) value
to have it dropped to `null`.

Response: `200` → `Exercise` · `400` invalid `name`/`category` · `404` if not found.

### `DELETE /api/exercises/:id`
Deletes the exercise row and its demo file on disk, if any. Workouts/sessions that reference this
`exercise_id` are **not** touched server-side (per spec, the frontend renders a "removed exercise"
placeholder when a lookup misses) — this is intentionally never a hard block.

Response: `200` → `{ "deleted": true, "id": "..." }` · `404` if not found.

### `POST /api/exercises/autofill`
AI Autofill (decision #16). Calls Google **Gemini** server-side to suggest an exercise's fields
from just its **name**. **Never creates or modifies an exercise** — it only returns a suggestion;
the client fills the add/edit form and the user must still hit Save (`POST`/`PUT` as normal) for
anything to persist. The Gemini API key lives only in `server/.env` (`GEMINI_API_KEY`) and is never
sent to the client or echoed in any response.

Body:
```jsonc
{ "name": "Barbell Bench Press" }   // required, non-empty after trim
```

Response `200`:
```jsonc
{
  "suggestion": {
    "category": "Push",                 // one of Strength|Push|Pull|Legs|Cardio|Mobility, or null if Gemini's guess didn't match
    "equipment": "Barbell",             // string or null
    "difficulty": "Intermediate",       // string or null (free text; Gemini is steered toward Beginner|Intermediate|Advanced)
    "muscles_worked": ["Chest", "Triceps"],
    "how_to": ["Lie flat, feet planted...", "Unrack and hold...", "Lower to the chest...", "Press back up."],
    "tags": ["compound", "push"],
    "video_url": "https://www.youtube.com/watch?v=..." // YouTube demo link, or null
  }
}
```
This is the exact shape of the `Exercise` fields the client should merge into its form state
(overwriting current values per user choice — decision #16); it does not include `id`, `name`,
`image`, `source_url`, `step_times`, `has_demo`, or timestamps.

Errors:
- `400` — `name` missing/blank: `{ "error": { "message": "name is required" } }`
- `501` — no `GEMINI_API_KEY` configured: `{ "error": { "message": "Autofill unavailable — no GEMINI_API_KEY configured" } }`
  (the client should show this as "Autofill unavailable (no API key)")
- `502` — Gemini network/HTTP/parse failure: `{ "error": { "message": "Autofill is temporarily unavailable — could not get a suggestion from Gemini" } }`
  (upstream error internals are never leaked)

### `POST /api/exercises/demo/draft`
Upload a demo file **before** the exercise has an id (create-exercise flow). `multipart/form-data`
with a single field `file`. Accepted types: `video/mp4`, `video/webm`, `video/quicktime`,
`image/gif`, `image/png`, `image/jpeg`, `image/webp`. Max size 25MB.

Response: `201` → `{ "draft_token": "...", "filename": "<token>.<ext>" }` · `400` bad/missing
file or unsupported type. The draft is swept if not claimed within 24h.

### `POST /api/exercises/:id/demo`
Upload a demo file directly onto an **existing** exercise (edit flow — no draft needed).
`multipart/form-data`, field `file`, same constraints as above.

Response: `200` → updated `Exercise` (`has_demo: true`) · `400` bad file · `404` exercise not found.

### `GET /api/exercises/:id/demo`
Streams the demo file with HTTP **Range** support (`206 Partial Content` when a `Range` header is
sent, `200` + `Accept-Ranges: bytes` otherwise). `Content-Type` derived from the file extension.

Response: `200`/`206` binary stream · `404` if the exercise doesn't exist or has no demo file (or
the file is missing on disk).

---

## Workouts

### `GET /api/workouts`
List saved workouts.

Query params (all optional):
| Param | Type | Effect |
|---|---|---|
| `q` | string | matches `title` OR the name of any exercise contained in the workout |
| `category` | string | exact match on `category` (the Workouts filter chips) |
| `favorite` | `1`/`true` or `0`/`false` | filter by favorite state |

Response: `200` → `Workout[]` (stable insertion order — `created_at`, then row order).

### `GET /api/workouts/:id`
Response: `200` → `Workout` · `404` if not found.

### `POST /api/workouts`
Create a workout. **Requires a non-empty `title` and ≥1 exercise** (decision #7) — no silent
nameless/empty drafts.

Body:
```jsonc
{
  "title": "Push Day A",                 // required
  "type": "Strength",                     // optional, default "Strength"; must be Strength|Hypertrophy|Power if present
  "category": "Push",                     // optional, default "Strength"; must be Strength|Push|Pull|Legs|Cardio|Mobility if present
  "favorite": false,                      // optional
  "image": null,                          // optional
  "exercises": [                          // required, length >= 1
    { "exercise_id": "uuid", "sets": 4, "reps": "8-10", "rest": 90 }
  ]
}
```
`est_minutes` is **always computed server-side** (decision #11 formula) — any client-supplied
value is ignored.

Response: `201` → `Workout` · `400` missing title / zero exercises / invalid `type`/`category`.

### `PUT /api/workouts/:id`
Update a workout. **Patch semantics**: any field omitted from the body keeps its current stored
value — this is what lets the Workouts grid's favorite-heart toggle send just
`{ "favorite": true }` without resending the whole workout. The merged result is re-validated
against the same rules as `POST` (so you can't patch `title` to empty or `exercises` to `[]`).
`est_minutes` is recomputed whenever `exercises` changes.

Response: `200` → `Workout` (same `id`, never a duplicate) · `400` validation failure ·
`404` if not found.

### `DELETE /api/workouts/:id`
Deletes the workout. **Cascades**: any `plan` day pointing at this workout is set to Rest
(`workout_id = NULL`). Past `sessions` referencing this workout are left untouched — they keep
their `workout_title`/`workout_category` snapshot and render as historical/orphaned (see
`docs/data-shapes.md`).

Response: `200` → `{ "deleted": true, "id": "..." }` · `404` if not found.

---

## Gyms (decision #17 — reference library of places + their equipment)

Storage/display only for now: gyms are **not** referenced by workouts, exercises, or sessions —
no cascade concerns, no filtering by a gym's equipment yet.

### `GET /api/gyms`
List gyms.

Query params (all optional):
| Param | Type | Effect |
|---|---|---|
| `q` | string | case-insensitive substring match on `name` |
| `favorite` | `1`/`true` or `0`/`false` | filter by favorite state |

Response: `200` → `Gym[]` (stable insertion order — `created_at`, then row order).

### `GET /api/gyms/:id`
Response: `200` → `Gym` · `404` if not found.

### `POST /api/gyms`
Create a gym. **Requires a non-empty `name`.**

Body:
```jsonc
{
  "name": "Home Gym",                              // required, non-empty after trim
  "favorite": false,                                 // optional, default false
  "image": null,                                     // optional
  "equipment": ["Dumbbells", "Pull-up bar"]          // optional, string[] — trimmed, deduped,
                                                      //   non-strings/blanks dropped
}
```

Response: `201` → `Gym` · `400` if `name` is empty/whitespace-only.

### `PUT /api/gyms/:id`
Update a gym in place (same id, no duplicate). **Patch semantics**: any field omitted from the
body keeps its current stored value — this is what lets a favorite-heart toggle send just
`{ "favorite": true }` without resending the whole gym. `name` still can't be patched to blank.

Response: `200` → `Gym` · `400` if the merged `name` is empty · `404` if not found.

### `DELETE /api/gyms/:id`
Deletes the gym. No cascade — nothing else references a gym.

Response: `200` → `{ "deleted": true, "id": "..." }` · `404` if not found.

---

## Plan (fixed Mon–Sun weekly template)

### `GET /api/plan`
Response: `200` → array of 7 entries, **always** `mon, tue, wed, thu, fri, sat, sun` in that order:
```jsonc
[{ "day": "mon", "workout": { /* Workout */ } | null }, ...]
```
`workout: null` means Rest (no entry, or the referenced workout was deleted).

### `PUT /api/plan/:day`
Set or clear a single day. `:day` must be one of `mon..sun`.

Body: `{ "workout_id": "uuid" | null }` (`null` or omitted clears the day to Rest).

Response: `200` → `{ "day": "mon", "workout": { /* Workout */ } | null }` · `400` invalid `day` ·
`404` if `workout_id` doesn't reference an existing workout.

---

## Sessions (completed workouts only)

Per decision #5, only **completed** sessions are ever written to the server; in-progress/paused
sessions live in client-side local storage for Resume and never hit this API until Finished.

### `GET /api/sessions`
History list, most-recent-first (`date` desc, `created_at` desc as tiebreak).

Query params: `limit` (default 50, max 200), `offset` (default 0) — for pagination/lazy-loading a
long history.

Response: `200` → `{ "sessions": Session[], "total": number }`.

### `GET /api/sessions/:id`
Response: `200` → `Session` (read-only per-exercise breakdown for a session detail view) ·
`404` if not found.

### `POST /api/sessions`
Create a completed session from the Track flow's logged actuals. Server derives
`duration_sec`/`total_sets`/`total_volume`/`prs`; never trusts client-computed aggregates.

Body:
```jsonc
{
  "workout_id": "uuid",                 // required unless workout_title is supplied directly (freeform/ad-hoc logging)
  "workout_title": "Push Day A",        // only used as a fallback when workout_id is omitted
  "date": "2026-07-08T18:30:00.000Z",   // optional, ISO datetime; the client's local wall-clock moment. Defaults to server now if omitted
  "duration_sec": 3120,                 // optional if started_at/ended_at are given
  "started_at": "2026-07-08T17:38:00.000Z", // optional — if paired with ended_at, duration_sec is computed from the difference instead
  "ended_at": "2026-07-08T18:30:00.000Z",
  "distance_km": null,                  // optional, cardio
  "entries": [
    {
      "exercise_id": "uuid",
      "exercise_name": "Barbell Bench Press", // optional — filled from the library if omitted
      "sets": [{ "weight": 140, "reps": 8, "completed": true }]
    }
  ]
}
```
Notes:
- If `workout_id` is given, the workout row is looked up and its `title`/`category` are snapshotted
  onto the session (overriding any client-supplied `workout_title`/`workout_category`) — `404` if
  that `workout_id` doesn't exist.
- Only sets with `completed: true` count toward `total_sets` and `total_volume`; unchecked/blank
  sets are stored but excluded from the math (never crash on a null weight/reps — treated as 0).
- Zero logged sets is allowed — the session still completes (`total_sets: 0`, `total_volume: 0`)
  and still marks the day Done.
- `prs`: computed once at creation against every prior completed session already in the DB — see
  the PR rule in `docs/data-shapes.md`.

Response: `201` → `Session` · `400` no `workout_id` and no `workout_title` · `404` unknown
`workout_id`.

### `DELETE /api/sessions/:id`
Not required by the spec's screens, but included for correcting a mis-logged session. Deletes the
session (no cascading effects — nothing else references a session).

Response: `200` → `{ "deleted": true, "id": "..." }` · `404` if not found.

---

## Derived / home

Both endpoints below share one streak/day-status helper (`server/lib/week.js`), so the streak
value is guaranteed identical wherever it's shown, per the spec's normative requirement.

### `GET /api/week`
The This Week payload: the fixed plan resolved against the calendar week containing `today`, each
day's status, N-of-M, and streak.

Query params: `today` (optional) — an ISO date string `YYYY-MM-DD` representing the **client's
local calendar date**. Because "today"/week boundaries are defined in device-local time (spec
§1) and the server has no reliable way to know the client's timezone otherwise, **the frontend
should always pass its own local date here**; if omitted, the server falls back to its own local
date (fine for same-timezone dev/deploy, but the client-supplied value is authoritative for
correctness across timezones).

Response: `200` → Week payload (see `docs/data-shapes.md` for the exact shape: `today_date`, `n`,
`m`, `streak`, `days[]`, `today`) · `400` if `today` is present but not a valid `YYYY-MM-DD` date.

Normative day `status` values — `done | rest | missed | planned`:
- **done**: a completed session exists on that calendar date (checked first — this is true even
  for an off-plan/non-planned day, per decision #4).
- **rest**: no `done` session, and the day has no planned workout in `plan` (or its planned
  workout was deleted).
- **missed**: no `done` session, the day has a planned non-rest workout, and the date is strictly
  before `today`.
- **planned**: no `done` session, the day has a planned non-rest workout, and the date is `today`
  or in the future.

`m` = count of the week's 7 days with a planned non-rest workout (regardless of status). `n` =
count of the week's 7 days with `status: "done"` — this can include off-plan Done days that don't
count toward `m` (decision #4), so `n` is not strictly "a subset of `m`".

`streak` = consecutive days walking backward from `today`: `done` days increment it, `rest` days
pass through without incrementing or breaking it, a `missed` day breaks it, and `today` itself is
skipped entirely (neither counted nor breaking) when its status is `planned` (not yet done, day
not over).

### `GET /api/stats`
History summary tiles + the weekly-volume chart.

Query params: `today` (optional, same contract as `GET /api/week`).

Response: `200` →
```jsonc
{
  "this_month_count": 12,     // completed sessions whose date falls in today's calendar month
  "total_volume": 82412.5,    // Σ total_volume across ALL sessions, all-time, lb
  "current_streak": 6,        // identical value to GET /api/week's `streak`
  "prs_this_month": 3,        // Σ session.prs.length for sessions in today's calendar month
  "weekly_volume": [
    { "week_start": "2026-05-18", "week_end": "2026-05-24", "volume": 9100 }
    // 8 entries, oldest -> newest, the last one being the current Mon-Sun week
  ]
}
```
`400` if `today` is present but invalid.

### `GET /api/health`
Trivial liveness check. Response: `200` → `{ "ok": true }`.

---

## Environment variables

| Var | Default | Purpose |
|---|---|---|
| `PORT` | `4000` | Express listen port |
| `REPS_DB_PATH` | `server/reps.db` | override the SQLite file location (used by the test suite to point at scratch files) |
| `REPS_MEDIA_DIR` | `server/media` | override the media root (drafts live at `<dir>/drafts`) |
| `GEMINI_API_KEY` | *(unset)* | Google Gemini key that powers `POST /api/exercises/autofill` (decision #16). Lives in `server/.env` (gitignored, see `server/.env.example`), never sent to the client. Missing key → the endpoint returns `501` and the feature degrades gracefully; everything else in the app works with no key at all. |
| `GEMINI_MODEL` | `gemini-2.0-flash` | which Gemini model the autofill endpoint calls |

`server/.env` (if present) is loaded automatically via Node's `--env-file-if-exists` flag in the
`dev:server`/`start` npm scripts — no dotenv dependency, and the app boots fine with no `.env` at
all (autofill just returns `501`).

## Running it

```bash
npm install
cp server/.env.example server/.env   # optional — only needed for the Gemini autofill feature; fill in GEMINI_API_KEY
npm run seed        # idempotent — seeds exercises/workouts/plan if not already present
npm run dev:server  # Express API on :4000 (or `npm run dev` to also start the Vite client)
npm test            # vitest — 97 tests across serialization, CRUD (workouts/exercises/gyms), plan,
                     # sessions/PRs, week/streak, Gemini autofill
```
