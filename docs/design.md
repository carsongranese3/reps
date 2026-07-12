# Design reference — Reps

Source prototype: claude.ai/design project **"Workout tracking app design"**
(`5c6ffe2b-4c3e-410f-9cd9-015fb75fecc3`), file `Reps.dc.html`. The pulled file lives at
`design/Reps.dc.html` — open it in a browser to view every screen. It is the visual source of
truth; match it closely. The `support.js` / `image-slot.js` in the prototype are the design-canvas
runtime and are **not** part of the app — ignore them.

The app is named **Reps**. Theme is "Pantry" — warm, calm, off-white with a terracotta accent.

## Design tokens

- **Font:** Hanken Grotesk (weights 400–800), system-ui fallback.
- **Backgrounds:** canvas `#E7E4DE`, app surface `#fff`, sidebar `#FBF9F4`, panels `#F7F4EE` /
  `#F4F1EB`, hairline borders `rgba(0,0,0,.06–.08)`.
- **Text/ink:** primary `#1A1815`, secondary `#6E6A62`, muted `#948E82` / `#A39C90`.
- **Accent (terracotta):** `#B15834`, hover `#96482a`; used for links, streaks, highlights.
- **Semantic status:** done/complete green `#567a3e`; missed `#C0654B` on `#FBECE6`; rest neutral
  `#ECEAE4`/`#B4AC9E`; planned = dashed `#CFC6B6` outline.
- **Category accents (workout cards / day pills):** push `#5f5170`, pull `#b0803f`, legs `#567a3e`,
  cardio/run `#b64436`, mobility/core `#a89a76`, misc `#8c6330` / `#95482a`.
- **Radii:** cards ~12–16px, window 15px, pills/chips 7–20px. Soft shadows, generous padding.

## Navigation

Five sections. **Desktop:** left sidebar (brand "Reps", nav items, user footer "My Training").
**Phone:** bottom tab bar with four tabs.

| Section | Desktop nav | Phone tab | Purpose |
|---|---|---|---|
| This Week | ✓ | ✓ | Weekly plan, today's workout, streak — the home screen |
| Workouts | ✓ | ✓ | Library of saved workouts (filterable card grid) |
| Build | ✓ | ✓ | Design / edit a workout |
| Exercises | ✓ | — (in desktop only) | Browse the exercise library grid |
| History | ✓ | ✓ | Past sessions + progress |

## Screens (design option → app screen)

- **`2a` This Week — desktop / `2b` phone:** Home. Weekly summary strip (N of M workouts, streak,
  M–S day dots colored by status with a Done/Rest/Missed/Planned legend, "rest days don't count
  against your streak"), a 7-day rail (each day shows its planned workout or Rest, TODAY marked),
  a highlighted **Today** card with "Start workout", then today's exercise list.
- **`1a` Workouts (Home/Library) — desktop / `1i` phone:** Header + search, filter chips
  (All / Strength / Push / Pull / Legs / Cardio / Mobility), 3-column grid of workout cards
  (gradient block by category, heart/favorite, title, "55 min · 8 exercises · Strength").
- **`1e` Build — desktop / `1j` phone:** Editable workout name, type chips
  (Strength / Hypertrophy / Power), running "N exercises · ~X min" estimate, an ordered list of
  exercises each with **Sets / Reps / Rest** steppers, add-exercise, Cancel / Save workout.
- **`1g` Exercise detail — desktop / `1k` phone:** Demo video/thumbnail with a play button and
  duration, exercise title, tag pills (muscles worked · equipment · difficulty), a numbered
  **"How to"** step list, and an "In this workout: 4 sets × 8–10 reps · 90s rest · Last time:
  140 lb × 8" panel. **This is the "show me how to do it" surface.**
- **`1h` History / progress — desktop / `1l` phone:** Past sessions and progress over time.

## Notes for builders

- The demo media in the prototype is a placeholder slot. Each exercise's demo clip/illustration is
  stored on the **server disk** (not in the DB) and streamed via `GET /api/exercises/:id/demo`
  with Range support (no external CDN); the detail screen shows it with the numbered "How to"
  steps. Every exercise in a workout links to its detail screen.
- Build the desktop sidebar and the phone bottom-tab shell as one responsive layout that switches at
  a breakpoint — same routes, not two apps.
