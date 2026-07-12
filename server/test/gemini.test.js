// Unit tests for the parse+validate/coerce step of the Gemini autofill client.
// No network access — these exercise parseAutofillResponse() directly against
// sample raw model payloads.

import { describe, it, expect } from 'vitest';
import os from 'node:os';
import path from 'node:path';

// lib/gemini.js imports from lib/serialize.js, which imports MEDIA_DIR from
// db.js (a module-level side effect that opens a DB connection). Point that at
// a scratch location before the dynamic import, same pattern as serialize.test.js.
process.env.REPS_DB_PATH = path.join(os.tmpdir(), `reps-test-gemini-${process.pid}-${Date.now()}.db`);
process.env.REPS_MEDIA_DIR = path.join(os.tmpdir(), `reps-test-gemini-media-${process.pid}-${Date.now()}`);

const { parseAutofillResponse, AutofillError } = await import('../lib/gemini.js');

describe('parseAutofillResponse', () => {
  it('parses a clean JSON payload', () => {
    const raw = JSON.stringify({
      category: 'Push',
      equipment: 'Barbell',
      difficulty: 'Intermediate',
      muscles_worked: ['Chest', 'Triceps'],
      how_to: ['Lie on the bench.', 'Lower the bar.', 'Press up.'],
      tags: ['compound', 'push'],
      video_url: 'https://www.youtube.com/watch?v=abc123',
    });

    const out = parseAutofillResponse(raw);
    expect(out).toEqual({
      category: 'Push',
      equipment: 'Barbell',
      difficulty: 'Intermediate',
      muscles_worked: ['Chest', 'Triceps'],
      how_to: ['Lie on the bench.', 'Lower the bar.', 'Press up.'],
      tags: ['compound', 'push'],
      video_url: 'https://www.youtube.com/watch?v=abc123',
    });
  });

  it('strips a ```json ... ``` markdown fence before parsing', () => {
    const raw = '```json\n' + JSON.stringify({
      category: 'Legs',
      equipment: 'Bodyweight',
      difficulty: 'Beginner',
      muscles_worked: ['Quads'],
      how_to: ['Stand tall.', 'Squat down.', 'Stand back up.'],
      tags: ['legs'],
      video_url: null,
    }) + '\n```';

    const out = parseAutofillResponse(raw);
    expect(out.category).toBe('Legs');
    expect(out.video_url).toBeNull();
  });

  it('strips a bare ``` ... ``` fence (no "json" language tag)', () => {
    const raw = '```\n' + JSON.stringify({ category: 'Cardio', how_to: ['Run.'] }) + '\n```';
    const out = parseAutofillResponse(raw);
    expect(out.category).toBe('Cardio');
    expect(out.how_to).toEqual(['Run.']);
  });

  it('nulls out an out-of-set category rather than crashing', () => {
    const raw = JSON.stringify({ category: 'NotARealCategory', how_to: ['Do the thing.'] });
    const out = parseAutofillResponse(raw);
    expect(out.category).toBeNull();
    expect(out.how_to).toEqual(['Do the thing.']);
  });

  it('passes through video_url: null untouched', () => {
    const raw = JSON.stringify({ category: 'Strength', video_url: null });
    const out = parseAutofillResponse(raw);
    expect(out.video_url).toBeNull();
  });

  it('drops a non-URL video_url', () => {
    const raw = JSON.stringify({ category: 'Strength', video_url: 'not a url, just a guess' });
    const out = parseAutofillResponse(raw);
    expect(out.video_url).toBeNull();
  });

  it('drops a non-http(s) video_url scheme', () => {
    const raw = JSON.stringify({ category: 'Strength', video_url: 'ftp://example.com/video' });
    const out = parseAutofillResponse(raw);
    expect(out.video_url).toBeNull();
  });

  it('coerces missing/garbage array fields to []', () => {
    const raw = JSON.stringify({ category: 'Strength', muscles_worked: 'Chest', how_to: null, tags: 42 });
    const out = parseAutofillResponse(raw);
    expect(out.muscles_worked).toEqual([]);
    expect(out.how_to).toEqual([]);
    expect(out.tags).toEqual([]);
  });

  it('throws an AutofillError with code "parse" on invalid JSON', () => {
    expect(() => parseAutofillResponse('not json at all')).toThrow(AutofillError);
    try {
      parseAutofillResponse('not json at all');
    } catch (err) {
      expect(err.code).toBe('parse');
    }
  });

  it('throws AutofillError("parse") when the JSON parses to a non-object (e.g. an array)', () => {
    expect(() => parseAutofillResponse('["a","b"]')).toThrow(AutofillError);
  });

  it('throws AutofillError("parse") on empty text', () => {
    expect(() => parseAutofillResponse('')).toThrow(AutofillError);
  });
});
