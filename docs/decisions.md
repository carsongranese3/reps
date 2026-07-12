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
