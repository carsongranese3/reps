// server/lib/gemini.js — Google Gemini client for the exercise "Autofill" feature
// (decision #16). Server-side only: the key never reaches the client, and this
// module only ever returns a *suggestion* object — it never writes to the DB.
//
// Two things are exported:
//   - autofillExercise(name): calls the Gemini REST API and returns a suggestion.
//   - parseAutofillResponse(text): the parse+validate/coerce step, factored out
//     so it's unit-testable without any network access.
//
// Env is read at call time (not import time) so tests / a keyless boot are fine.

import { EXERCISE_CATEGORIES, trimOrNull, stringArray, httpUrlOrNull } from './serialize.js';

const DEFAULT_MODEL = 'gemini-2.0-flash';
const REQUEST_TIMEOUT_MS = 15000;

// Free-text in storage (see docs/data-shapes.md), but we steer Gemini toward
// this set in the prompt and use it only to decide whether to trust the value.
export const SUGGESTED_DIFFICULTIES = ['Beginner', 'Intermediate', 'Advanced'];

export class AutofillError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'AutofillError';
    // 'missing_key' | 'network' | 'http' | 'parse'
    this.code = code;
  }
}

function buildPrompt(name) {
  return `You are helping populate a personal workout-tracking app's exercise library.
Given only the exercise name below, respond with ONE JSON object (no prose, no markdown fences)
with EXACTLY these fields:

{
  "category": one of "Strength" | "Push" | "Pull" | "Legs" | "Cardio" | "Mobility",
  "equipment": a short common equipment value (e.g. "Barbell", "Dumbbell", "Bodyweight", "Machine"),
  "difficulty": one of "Beginner" | "Intermediate" | "Advanced",
  "muscles_worked": array of 2-5 short muscle group strings (e.g. ["Chest","Triceps"]),
  "how_to": array of 3-6 concise imperative "how to" steps, ordered,
  "tags": array of 1-4 short free-form tags (e.g. ["compound","push"]),
  "video_url": a best-effort YouTube "watch" URL (https://www.youtube.com/watch?v=...) for a real
    demonstration of this exact exercise, or null if you are not confident one exists. You may be
    wrong — a plausible guess is fine since the app will label it "unverified" — but prefer null
    over an obviously made-up URL.
}

Exercise name: "${name}"

Respond with ONLY the JSON object described above.`;
}

function stripCodeFences(text) {
  const trimmed = String(text).trim();
  const match = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return match ? match[1].trim() : trimmed;
}

// Parses + validates/coerces a raw Gemini text response into our suggestion
// shape. Never throws on "off-spec but well-formed" values — it coerces them
// (dropping/nulling what doesn't fit) so a slightly odd model reply degrades
// gracefully instead of crashing the route. Throws AutofillError('parse') only
// when the text isn't parseable JSON at all.
export function parseAutofillResponse(text) {
  if (typeof text !== 'string' || !text.trim()) {
    throw new AutofillError('Gemini returned an empty response', 'parse');
  }

  const stripped = stripCodeFences(text);
  let parsed;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    throw new AutofillError('Could not parse Gemini response as JSON', 'parse');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new AutofillError('Gemini response was not a JSON object', 'parse');
  }

  const category = trimOrNull(parsed.category);

  return {
    category: category && EXERCISE_CATEGORIES.includes(category) ? category : null,
    equipment: trimOrNull(parsed.equipment),
    // difficulty is free-text in storage, so we pass through the trimmed value
    // even if it's outside SUGGESTED_DIFFICULTIES rather than dropping it.
    difficulty: trimOrNull(parsed.difficulty),
    muscles_worked: stringArray(parsed.muscles_worked),
    how_to: stringArray(parsed.how_to),
    tags: stringArray(parsed.tags),
    // Unverified guess — only kept if it's a real http(s) URL.
    video_url: httpUrlOrNull(parsed.video_url),
  };
}

// Calls the Gemini API and returns a validated suggestion object. Throws
// AutofillError with a `.code` the route can map to a status:
//   'missing_key' -> 501, 'network' | 'http' | 'parse' -> 502.
export async function autofillExercise(name) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new AutofillError('Autofill unavailable — no GEMINI_API_KEY configured', 'missing_key');
  }
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: buildPrompt(name) }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err && err.name === 'AbortError') {
      throw new AutofillError('Gemini request timed out', 'network');
    }
    throw new AutofillError('Could not reach Gemini', 'network');
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    // Never leak upstream response bodies (may echo the prompt/key context).
    throw new AutofillError(`Gemini request failed with status ${response.status}`, 'http');
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new AutofillError('Gemini returned an unreadable response', 'parse');
  }

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new AutofillError('Gemini returned no content', 'parse');
  }

  return parseAutofillResponse(text);
}
