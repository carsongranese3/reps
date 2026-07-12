# Project: Reps — workout tracker

> Drop this file at the repo root. It is the single briefing every agent reads.
> The agent files in `~/.claude/agents/` stay generic; this file is what makes the team build *this* app.

## What this app is
Reps is a personal workout app for desktop and phone (one responsive web app). You can **design a
workout** (name it, pick a type, add exercises with sets/reps/rest), **track it** as you do it, and
open any exercise to see a **demo and step-by-step "how to"** instructions. A "This Week" home screen
shows your weekly plan, today's workout, and your streak. It is backed by a **custom exercise
database you build up over time** — a growing library you populate yourself. Data lives in one
shared, hosted database so your computer and phone stay in sync (single user; no login yet).

## Tech stack
- Language / runtime: TypeScript, Node 20
- Backend framework: **Express + better-sqlite3.** A small Node server owns a single-file SQLite
  database (`server/reps.db`) in WAL mode (hence `-shm`/`-wal` sidecars), accessed through plain
  prepared SQL statements — **no ORM**. Schema lives in `server/db.js`; the read/write layer and
  routes in `server/index.js`. This mirrors the cookbook app's storage design (see below).
- Frontend framework: React + Vite, React Router for the section routes. Talks to the server over a
  small REST API; components never build SQL or touch the DB directly.
- Persistence model (mirrors the cookbook recipes app):
  - **Row-per-entity with a scalar/JSON split.** SQLite has no array/object types, so each table
    mixes scalar columns with JSON-string columns (`JSON.stringify` in / `JSON.parse` out).
  - **`exercises`** — the custom library. Scalars: `id, name, category, equipment, difficulty,
    demo_file, image, source_url, created_at, updated_at`. JSON columns: `muscles_worked[]`,
    `how_to[]` (ordered step strings), `step_times[]` (seconds, positionally parallel to steps),
    `tags[]`. Full CRUD so the library grows over time.
  - **`workouts`** — a designed workout. Scalars: `id, title, type, est_minutes, favorite, image,
    created_at, updated_at`. JSON column: `exercises[]` = `[{exercise_id, sets, reps, rest}]`.
  - **`plan`** — the "This Week" schedule: `day → workout_id` (FK to workouts).
  - **`sessions`** — the tracking / history log: a completed workout with per-set actuals
    (weight × reps, done flags). **No FK to workouts** (like the cookbook's `history`) so entries
    survive workout deletion and render with `workout: null` when orphaned.
  - **Serialization boundary** — two functions are the whole story, per table: `normalizeBody()`
    coerces an incoming request body into clean storable fields before INSERT/UPDATE (trims,
    forces shapes, JSON-stringifies arrays at the SQL call); `rowToExercise()` / `rowToWorkout()`
    do the reverse, `safeParse`-ing every JSON column back to arrays (falling back to `[]` on
    corruption) and adding computed flags like `has_demo`. **The API always speaks real
    arrays/objects in both directions — the JSON columns are an implementation detail.**
  - **Media outside the DB.** Exercise demo clips are **not** stored in the database: `demo_file`
    holds a bare filename; the actual file lives on disk at `server/media/<exerciseId>.<ext>`.
    Uploads land as drafts in `server/media/drafts/<token>` and are "claimed" on save (stale
    drafts swept after 24h). `rowToExercise` never exposes the filename — only a `has_demo`
    boolean; the file streams via `GET /api/exercises/:id/demo` with HTTP **Range** support.
    Small `image` thumbnails may be stored inline in the DB as TEXT.
  - **Idempotent boot migrations.** `server/db.js` reads `PRAGMA table_info` on every boot and
    `ALTER TABLE ADD COLUMN`s anything missing, so an old DB upgrades in place. Deleting a
    workout cascades its `plan` rows and unlinks nothing it shouldn't.
- Styling: Tailwind CSS, configured with the Pantry theme tokens in `docs/design.md`
- Hosting target: a Node host for the server + SQLite (e.g. Fly.io / Railway / a small VPS) with a
  persistent volume for `server/reps.db` and `server/media/`; the React build is served as static
  assets by the same server or a static host pointed at the API.

## Data sources
- **Core data is user-built, none external.** The exercise library is populated by the user through
  the app (create/edit/delete), seeded with a small starter set. Each exercise has name, muscles
  worked, equipment, difficulty, a demo asset (clip stored on the server, **no external CDN**), and
  numbered "how to" steps. See `docs/data-shapes.md` for the exact shapes.
- **Gemini — optional autofill assist (the one external API).** The add/edit-exercise form has an
  **Autofill** action that calls Google's Gemini API **server-side** to suggest an exercise's text
  fields (category, equipment, difficulty, muscles, how-to steps, tags) plus a **best-effort,
  unverified YouTube demo URL** from just the name. It is **opt-in per click**, results are shown
  for the user to **review/edit before saving**, and nothing is auto-sent. The API key lives only in
  `server/.env` (`GEMINI_API_KEY`), is **never** shipped to the client, and the feature degrades
  gracefully (clear error) when the key is absent. This is the sole external dependency; all stored
  data remains the user's own.
- Refresh requirements: none — everything is served from your own database and disk.

## Conventions
- One responsive app, not two: desktop = left sidebar, phone = bottom tab bar, **same routes**.
  Switch layout at a breakpoint; don't fork the app.
- Match the design in `design/Reps.dc.html` + `docs/design.md` closely — theme tokens, spacing,
  and the five sections (This Week · Workouts · Build · Exercises · History).
- Storage rules mirror the cookbook: no ORM (plain prepared statements), the scalar/JSON-column
  split, and the `normalizeBody()` / `rowTo*()` serialization boundary as the *only* place JSON
  encoding happens. Components and routes speak real arrays/objects, never JSON strings.
- The frontend goes through a typed API client module; components never call `fetch` ad hoc or
  build SQL. All persistence is server-side through the REST API.
- **Secrets never touch the client.** The Gemini key (and any future secret) stays in `server/.env`
  and is read only by the server; the browser calls our own `POST /api/exercises/autofill`, which
  makes the Gemini call. Never expose the key in client code, the bundle, or any API response.
- Store all demo media on the server disk and stream it; never hotlink external images/video.
- Field names are defined in specs and `docs/data-shapes.md` — match them exactly, don't invent.
- TypeScript strict; keep components small and typed.

## Where things live
- Specs: `specs/`
- API / endpoint docs: `docs/api.md` (the HTTP REST contract — routes, params, request/response shapes)
- Normalized data shapes: `docs/data-shapes.md` (the DB schema + the API entity shapes)
- Decisions log: `docs/decisions.md`
- Design reference: `design/` (pulled prototype) + `docs/design.md` (mapping)
- Server: `server/` (`db.js` schema/migrations, `index.js` routes + read/write, `media/` assets)

## Commands
- Install: `npm install`
- Run dev: `npm run dev`   <!-- runs the Vite client + Express server together -->
- Test: `npm test`   <!-- the QA agent uses this -->
- Build: `npm run build`

---

## Orchestration (instructions for the main session)

You are the orchestrator. You do not write feature code yourself; you plan, delegate to
the specialist subagents, and integrate their output. The available specialists are:
`requirements-agent`, `explore-agent`, `data-agent`, `backend-agent`, `frontend-agent`,
`qa-agent`, `devops-agent`.

### First, pick the mode

Before delegating anything, decide which mode the task is:
- **Mode A — new feature / greenfield**: building something that doesn't exist yet, in a new or
  empty-ish repo. Use the full build pipeline below.
- **Mode B — editing an existing project**: changing, extending, or fixing code that already
  exists (add a field, fix a bug, refactor, wire in a new endpoint). Understand before you edit.

When unsure, look: if the relevant code already exists in the repo, it's Mode B. Most day-to-day
work is Mode B. Don't run the full greenfield pipeline on a one-file bugfix.

### Mode A — new feature / greenfield

1. Delegate to `requirements-agent` to produce a spec at `specs/<feature>.md` with acceptance
   criteria and edge cases. If the user wants the plan sourced from Azure DevOps, tell the
   agent so explicitly in the prompt — it has read-only access to work items but only consults
   them when asked.
2. Once the spec exists, delegate to `backend-agent` — it owns the Express + better-sqlite3 server:
   the schema/migrations in `server/db.js`, the read/write layer + REST routes in `server/index.js`,
   the `normalizeBody()`/`rowTo*()` serialization boundary, and media-on-disk streaming. It writes
   the DB schema into `docs/data-shapes.md` and the HTTP contract into `docs/api.md`. **Skip
   `data-agent`** — there is no external data source; the exercise library is user-built in our own
   DB (optionally seeded).
3. Delegate `frontend-agent` only after `docs/api.md` exists — it depends on those exact field
   names, so this step is genuinely serial, not parallel.
4. After any piece lands, delegate `qa-agent` to verify it against the spec and do a security
   pass. Treat its go / no-go as a gate.
5. Bring in `devops-agent` only after QA gives a go and its security concerns are resolved —
   for the build, PWA/service-worker config, and static-host deploy.

### Run independent agents in parallel

The data → backend → frontend chain is serial *across* the chain because each reads the previous
one's doc — don't break that. But *within* a step, run independent agents concurrently:

- **To run agents in parallel, issue their Task calls in a single message.** Multiple Task calls in
  one message run concurrently; one call per message runs them serially. When two or more agents are
  independent, do not wait for one to finish before starting the next — launch them together.
- **Parallel-eligible cases** (launch together in one message):
  - two or more independent backend endpoints or modules,
  - `data-agent` + `backend-agent` on the parts that don't depend on each other (backend scaffolds
    the server/schema while data builds the fetch layer; integrate after),
  - in Mode B, independent edits across layers for one change (e.g. a backend change and an
    unrelated frontend change),
  - independent verification or exploration tasks.
- **Keep serial only where there's a real dependency:** spec before any build, `docs/api.md` before
  `frontend-agent`, the build before `qa-agent`. Don't parallelize across a doc hand-off.

Think "serial backbone, parallel where independent" — not everything at once, and not everything
one-at-a-time.

### Mode B — editing an existing project

The trap here is editing before understanding. Fresh-context agents that skip discovery
reinvent helpers, miss conventions, and break things they couldn't see. So:

1. **Understand first.** Delegate `explore-agent` to map the slice of the codebase the change
   touches: the files involved, how the layers connect, the patterns and naming already in use,
   and anything that would break. It is read-only — it reports a map; you integrate its findings
   and pass them to the builders. It does not edit.
2. **Scope the change.** Decide the smallest set of files/layers that actually has to change.
   If the change is genuinely cross-cutting and underspecified, delegate `requirements-agent`
   to document *current behavior + the specific delta* (not a from-scratch spec) and, if asked,
   to pull scope from Azure DevOps. For a clear, small change, skip the spec and go straight to
   the edit.
3. **Edit the affected layers together.** Delegate `backend-agent` / `frontend-agent` /
   `data-agent` to change only what step 2 scoped — pass them the explorer's map and tell them
   to match existing patterns, not introduce new ones. These often run in parallel here, since
   an edit usually doesn't recreate the greenfield data→backend→frontend dependency.
4. **Verify against current behavior.** Delegate `qa-agent` to confirm the change works, the
   surrounding behavior still passes (no regressions), and to do a security pass on the diff.
5. Bring in `devops-agent` only if the change affects build, config, or deploy — many edits
   don't, so don't invoke it by reflex.

In both modes the rules below apply.

When delegating, remember each subagent starts with a fresh context and can only see what
you put in the prompt. Always pass:
- the spec file path (`specs/<feature>.md`),
- the relevant doc paths (`docs/data-shapes.md`, `docs/api.md`),
- in Mode B, the explorer's map of the affected code,
- any decisions already made.

You own `docs/decisions.md`. Whenever you resolve an open question or make a cross-cutting
call (library choice, data source, schema tradeoff), append it there before delegating the
next step, so future sessions and fresh-context agents stay consistent.

Surface for the user to confirm (do not let an agent do these unprompted): deploying to
production, deleting data, changing access or security settings, creating accounts, or
entering any credentials.
