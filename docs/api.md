# API — Reps server

Owner: backend-agent. The HTTP REST contract every frontend request goes through — no component
calls `fetch` ad hoc or touches SQL. Base URL in dev: `http://localhost:4000` (Express on
`PORT` env var, default `4000`); the Vite client runs on its own port and talks to this over CORS
(the server reflects the request origin — single-user, no-auth app). In production the same
Express server also serves the built client from `client/dist`.

All entity shapes referenced below (Exercise, Workout, Gym, Plan entry, Schedule entry, Session,
Week payload, Stats payload) are fully specified in `docs/data-shapes.md` — this document is the
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
  "equipment_groups": [["Barbell"], ["Bench"]], // optional, AND-of-ORs string[][] — decision #28
                                         // (restores #25, reverses #26's flat collapse): outer array =
                                         // AND (every group required, "used together"), inner array =
                                         // OR (any one item — an exercise-specific alternative —
                                         // satisfies that group), e.g. [["Dip Station","Bench"]] for
                                         // Dips. This coexists with the managed Equipment `substitutes[]`
                                         // (decision #24, a global "also counts as"). [] (or omitted) =
                                         // bodyweight/no equipment. Cleaned on write: every item trimmed,
                                         // blanks dropped, deduped within a group, empty groups dropped.
                                         // Writes always go through `equipment_groups` — the read-only
                                         // `equipment` summary string on the response is never accepted.
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
to have it dropped to `null`. `equipment_groups` follows the same patch semantics: omit it to keep
the current stored groups, or send a full `string[][]` to replace it entirely (there is no
partial/per-group merge — sending `equipment_groups` replaces the whole thing). A PUT that omits
`equipment_groups` (e.g. a name-only or favorite-only patch) never wipes the stored equipment.

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
    "equipment_groups": [["Barbell"], ["Bench"]],  // AND-of-ORs string[][] (decision #28) — cleaned the
                                         // same way a saved exercise's equipment_groups is (trim/dedupe-
                                         // within-group/drop-empty-groups); [] if Gemini says the exercise
                                         // needs no equipment. Lenient: an item that doesn't match an
                                         // offered managed-equipment name is still kept since the user
                                         // reviews/edits before saving.
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
  "gym_id": null,                         // optional, default null — assigns the workout to a gym
                                           //   (decision #18); null = "Any gym". Not validated
                                           //   against existing gyms (no FK) — any string is accepted
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
`est_minutes` is recomputed whenever `exercises` changes. `gym_id` follows the same patch
semantics: omit it to keep the current value, send `"gym_id": null` to explicitly clear it back to
"Any gym", or send a gym id string to assign/reassign it (not checked against existing gyms).

Response: `200` → `Workout` (same `id`, never a duplicate) · `400` validation failure ·
`404` if not found.

### `DELETE /api/workouts/:id`
Deletes the workout. **Cascades**:
- Any `plan` day pointing at this workout is set to Rest (`workout_id = NULL`).
- Any `schedule` rows pointing at this workout are **deleted** (never nulled — a NULL `schedule`
  row means an explicit Rest-marker, which must not be auto-created). A date left with zero rows
  reverts to template fallback; other rows on the same date are untouched (specs/schedule.md §7).
- Past `sessions` referencing this workout are left untouched — they keep their
  `workout_title`/`workout_category` snapshot and render as historical/orphaned (see
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

## Equipment (decision #23 — a curated, managed master list)

A managed list of gym equipment names that feeds the **suggestion** sources for the exercise
Equipment datalist and the gym equipment checklist. Exercises and gyms continue to **store**
equipment as plain free strings (no relational refactor) — deleting an equipment row here never
touches any exercise/gym; it just stops being suggested.

**Duplicate-name behavior:** names are unique **case-insensitively** (enforced by a
`COLLATE NOCASE` unique index in `server/db.js`, plus an application-level pre-check). A `POST`/`PUT`
that would collide with an existing name (any case) returns **`400`** (not `409` — kept consistent
with every other validation failure in this API, which are all `400`s; there is no `409` usage
anywhere else in the app).

**`substitutes` (decision #24) — "also counts as":** each item carries a `substitutes: string[]` —
other equipment names this item **also counts as / can replace**, one-way (e.g. `"Adjustable bench"`
→ `["Bench"]`: a gym with an adjustable bench satisfies an exercise that needs a flat `Bench`, but
not the reverse). Cleaned like gym `equipment` — trimmed, blanks dropped, deduped. Consumers (e.g. a
gym/equipment-matching helper) are expected to expand a gym's equipment list through each item's
`substitutes` before matching.

### `GET /api/equipment`
List equipment.

Query params (optional): `q` — case-insensitive substring match on `name`.

Response: `200` → `Equipment[]` (sorted by `name` ascending). Each item includes `substitutes`.

### `GET /api/equipment/:id`
Response: `200` → `Equipment` · `404` if not found.

### `POST /api/equipment`
Create an equipment item. **Requires a non-empty `name`.**

Body:
```jsonc
{
  "name": "Adjustable bench",  // required, non-empty after trim
  "substitutes": ["Bench"]     // optional, string[] — trimmed, deduped, non-string/blank entries
                                // dropped; defaults to [] if omitted
}
```

Response: `201` → `Equipment` · `400` if `name` is empty/whitespace-only, or if an equipment item
with that name (any case) already exists.

### `PUT /api/equipment/:id`
Update an equipment item in place (same id, no duplicate). **Patch semantics**: omitting a field
(`name` or `substitutes`) keeps its current stored value; `name` still can't be patched to blank,
and can't be patched to collide with another existing item's name (case-insensitive) — patching an
item to its own unchanged name is fine. Sending `substitutes` **replaces** the whole list (send `[]`
to clear it).

Response: `200` → `Equipment` · `400` if the merged `name` is empty or collides with another item ·
`404` if not found.

### `DELETE /api/equipment/:id`
Deletes the equipment row. **No cascade** — exercises/gyms store equipment as free strings, not a
foreign key, so nothing else is touched; the deleted name simply stops appearing as a suggestion.

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

## Schedule (specs/schedule.md, decision #21 — date-specific overrides over the weekly `plan`)

A `schedule` row plans a workout on a **specific calendar date**, layered as an override on top of
the fixed weekly `plan` template: an unset date falls back to `plan[weekday]`; a set date uses its
own entries instead. Multiple workouts per date are allowed. See `docs/data-shapes.md` for the
`schedule` table and the normative `plannedWorkoutsForDate` resolution rule. All dates are local
`YYYY-MM-DD` (decision #12); mutations are immediate (no draft/save step).

### `GET /api/schedule?from=YYYY-MM-DD&to=YYYY-MM-DD`
Reads the **resolved** schedule for a date range (the calendar screen requests the visible month,
typically padded to whole weeks).

Query params:
| Param | Type | Effect |
|---|---|---|
| `from`, `to` | `YYYY-MM-DD`, required | inclusive date range; `to` must not be before `from` |
| `today` | `YYYY-MM-DD`, optional | same contract as `GET /api/week` — drives the `status` overlay; falls back to server-local if omitted |

Response: `200` →
```jsonc
{
  "schedule": [
    {
      "date": "2026-07-16",
      "source": "schedule" | "template" | "rest",
      "is_set": true,
      "workouts": [ { /* Workout */ } ],
      "status": "planned"   // done | rest | missed | planned — same rule as GET /api/week's per-day status
    }
    // ... one entry per date in [from, to]
  ]
}
```
`400` if `from`/`to` are missing, not valid `YYYY-MM-DD`, `to < from`, or the range exceeds the cap
(**62 days** — a padded month with headroom).

### `PUT /api/schedule/:date`
Mutates a single date's schedule. `:date` must be a valid `YYYY-MM-DD`. Body is exactly **one** of:
```jsonc
{ "workout_ids": ["id1", "id2"] }   // replace the date's entries with these workouts, order
                                     // preserved, duplicates allowed (not deduped) -> date "set".
                                     // An empty array ([]) behaves like { "clear": true }.
{ "rest": true }                     // explicit Rest override: a single NULL marker row; clears
                                      // any workouts previously on the date.
{ "clear": true }                    // delete the date's override entirely -> reverts to the
                                      // weekly template (date becomes "unset").
```
Precedence when a body has more than one key: `clear` > `rest` > `workout_ids`. Adding workouts
(`workout_ids`) always replaces the whole day in one call — there is no separate append endpoint;
the client resends the full desired list (add = read current `workouts`, append the new id, PUT
the full list; remove = PUT the list without that entry — removing the last entry naturally
reverts to template, matching specs/schedule.md §2.2).

Query params: `today` (optional, same contract as `GET /api/week`) — used only to compute the
returned `status`.

Response: `200` → the resolved entry for that date (same shape as a `GET /api/schedule` element) ·
`400` invalid `:date` or a body matching none of the three forms · `404` if any `workout_id` in
`workout_ids` doesn't reference an existing workout (validated up front — nothing is mutated if any
id is invalid, consistent with `PUT /api/plan/:day`'s 404 on an unknown `workout_id`).

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

### `PUT /api/sessions/:id`
Edit a logged session's sets (decision #22 — History week drill-down "Edit"). Mirrors `POST`'s
derivation exactly, but every field is **optional** and omitting it keeps the session's current
stored value — you only need to send what changed (typically just `entries`).

Body:
```jsonc
{
  "entries": [                          // optional — omit to keep the existing entries unchanged
    {
      "exercise_id": "uuid",
      "exercise_name": "Barbell Bench Press", // optional — filled from the library if omitted
      "sets": [{ "weight": 140, "reps": 8, "completed": true }]
    }
  ],
  "date": "2026-07-08T18:30:00.000Z",   // optional — omit to keep the existing date
  "duration_sec": 3120,                 // optional — omit to keep the existing duration_sec
  "started_at": "2026-07-08T17:38:00.000Z", // optional — if paired with ended_at, recomputes duration_sec from the difference (takes priority over duration_sec)
  "ended_at": "2026-07-08T18:30:00.000Z",
  "distance_km": null,                  // optional — omit to keep the existing distance_km
  "workout_id": "uuid",                 // optional — re-points the session at a different workout and
                                         //   re-snapshots workout_title/workout_category from it; 404 if
                                         //   that workout_id doesn't exist. Omit to keep the existing
                                         //   workout_id/workout_title/workout_category snapshot untouched
                                         //   (the common case — editing sets doesn't touch the workout link)
  "workout_title": "Push Day A",        // optional — only applied when workout_id is explicitly sent as
                                         //   null/falsy in the same request (freeform re-label); ignored otherwise
  "workout_category": "Push"            // optional — same conditions as workout_title
}
```
Notes:
- **Recomputes exactly like `POST`:** `total_sets` (count of completed sets), `total_volume` (Σ
  `weight × reps` over completed sets, nulls treated as 0), `duration_sec` (from
  `started_at`/`ended_at` if both present, else the supplied/omitted `duration_sec`).
- **PR recompute, excluding self:** `prs` is recomputed for this session's entries against the
  best weight ever logged for each exercise **across every OTHER session** — this session's own id
  is excluded from that "prior best" scan. This is deliberately different from `POST` (which
  compares against literally every session already in the DB, since the new session doesn't exist
  yet to exclude). The practical effect: re-saving a session's sets unchanged never spuriously
  gains or loses a PR against itself; raising a weight above every other session's best gains a PR;
  lowering it back below removes it. Other sessions' `prs` are never touched by this edit (per
  decision #10, a PR is a historical fact — only the edited session's own `prs` are recomputed).
- The `workout_id`/`workout_title`/`workout_category` snapshot is left alone unless the body
  explicitly changes it — editing sets alone never touches the workout link.

Response: `200` → updated `Session` (via the same serialization as `GET`) · `404` if the session
doesn't exist, or if a supplied `workout_id` doesn't reference an existing workout.

### `DELETE /api/sessions/:id`
Not required by the spec's screens, but included for correcting a mis-logged session. Deletes the
session (no cascading effects — nothing else references a session).

Response: `200` → `{ "deleted": true, "id": "..." }` · `404` if not found.

---

## Derived / home

Both endpoints below share one streak/day-status helper (`server/lib/week.js`), so the streak
value is guaranteed identical wherever it's shown, per the spec's normative requirement.

### `GET /api/week`
The This Week payload: each day of the current calendar week resolved via `plannedWorkoutsForDate`
(specs/schedule.md §4 — schedule override, else the fixed `plan` template), each day's status,
N-of-M, and streak.

Query params: `today` (optional) — an ISO date string `YYYY-MM-DD` representing the **client's
local calendar date**. Because "today"/week boundaries are defined in device-local time (spec
§1) and the server has no reliable way to know the client's timezone otherwise, **the frontend
should always pass its own local date here**; if omitted, the server falls back to its own local
date (fine for same-timezone dev/deploy, but the client-supplied value is authoritative for
correctness across timezones).

Response: `200` → Week payload (see `docs/data-shapes.md` for the exact shape: `today_date`, `n`,
`m`, `streak`, `days[]`, `today`) · `400` if `today` is present but not a valid `YYYY-MM-DD` date.

**Per-day shape change (decision #21):** because a date can now have multiple planned workouts
(via a `schedule` override), each `days[]` entry's `workout` (single, nullable) is **replaced by
`workouts` (array, possibly empty)** — `[]` means Rest that day. `today.workouts` likewise.

Normative day `status` values — `done | rest | missed | planned` — still computed at the **day
level** (decision #4 preserved, unaffected by multiple-per-day):
- **done**: a completed session exists on that calendar date (checked first — this is true even
  for an off-plan/non-planned day, per decision #4).
- **rest**: no `done` session, and `plannedWorkoutsForDate` resolves to `[]` for that date (an
  explicit Rest override, or an unset weekday with no template workout).
- **missed**: no `done` session, `plannedWorkoutsForDate` is non-empty, and the date is strictly
  before `today`.
- **planned**: no `done` session, `plannedWorkoutsForDate` is non-empty, and the date is `today`
  or in the future.

**N-of-M is now computed at the workout level** (specs/schedule.md §5.2, decision #21), to handle
multiple planned workouts per day:
- `m` = **Σ over the week's 7 days of `|plannedWorkoutsForDate(date)|`** — a day with 2 planned
  workouts contributes 2, not 1.
- For a date, `satisfiedCount` = the number of that date's planned entries matched by a completed
  session of the same `workout_id` that date (if a workout is planned *k* times and there are *j*
  completed sessions of it, `min(k, j)` entries are satisfied).
- `offPlanCredit` for a date = **1** if any completed session that date has a `workout_id` that
  doesn't correspond to **any** planned entry for that date at all (genuinely unrelated to the
  day's plan) — **not** triggered merely by extra/duplicate completions of a workout that *is*
  already planned (those can't push `satisfiedCount` past its planned count `k`), else **0**.
- `n` = **Σ over the week's days of `(satisfiedCount(date) + offPlanCredit(date))`**.
- As before, `n` is **not strictly ≤ m** — off-plan credit can exceed satisfied planned work.
- Single-workout-per-day days behave exactly as before this feature (decision #4/#13 preserved):
  a planned day you complete → "1 of 1"; a planned day you skip → 0 of 1; a planned day you do
  something else on → still "1 of 1" via `offPlanCredit`; a rest day you train on → off-plan
  credit toward `n` but not `m`.

`streak` = consecutive days walking backward from `today`, using the same day-level `status` above
(unaffected by multiple-per-day): `done` days increment it, `rest` days pass through without
incrementing or breaking it, a `missed` day breaks it, and `today` itself is skipped entirely
(neither counted nor breaking) when its status is `planned` (not yet done, day not over).

### `GET /api/stats`
History summary tiles + the weekly-volume chart. `current_streak` is computed via the same
resolution rule and shared helper as `GET /api/week` (`plannedWorkoutsForDate` + `computeStreak`),
so it reflects `schedule` overrides identically and is guaranteed to match `GET /api/week`'s
`streak` exactly.

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
npm test            # vitest — tests across serialization, CRUD (workouts/exercises/gyms/equipment),
                     # plan, sessions/PRs (incl. PUT edit + PR-recompute-excluding-self), week/streak,
                     # schedule, Gemini autofill, equipment seed idempotency + substitutes backfill,
                     # exercise equipment_groups (decision #28) as an AND-of-ORs string[][] + boot
                     # migration upgrading any prior shape (legacy scalar, or #26's flat string[])
```
