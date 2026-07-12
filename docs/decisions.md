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
