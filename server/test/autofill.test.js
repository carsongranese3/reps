// Route tests for POST /api/exercises/autofill. No real network calls — the
// "success"/"upstream failure" cases stub global fetch; the "no key" case just
// relies on GEMINI_API_KEY being unset (the default in the test environment).

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { freshApp } from './testApp.js';

let ctx;
const ORIGINAL_KEY = process.env.GEMINI_API_KEY;
const ORIGINAL_MODEL = process.env.GEMINI_MODEL;

beforeAll(async () => {
  delete process.env.GEMINI_API_KEY;
  ctx = await freshApp('autofill');
});

afterAll(() => {
  ctx.cleanup();
  if (ORIGINAL_KEY === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = ORIGINAL_KEY;
  if (ORIGINAL_MODEL === undefined) delete process.env.GEMINI_MODEL;
  else process.env.GEMINI_MODEL = ORIGINAL_MODEL;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/exercises/autofill — validation & missing key', () => {
  it('400s when name is missing', async () => {
    const res = await request(ctx.app).post('/api/exercises/autofill').send({});
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/name/i);
  });

  it('400s when name is blank/whitespace', async () => {
    const res = await request(ctx.app).post('/api/exercises/autofill').send({ name: '   ' });
    expect(res.status).toBe(400);
  });

  it('501s when GEMINI_API_KEY is not configured', async () => {
    expect(process.env.GEMINI_API_KEY).toBeUndefined();
    const res = await request(ctx.app).post('/api/exercises/autofill').send({ name: 'Barbell Bench Press' });
    expect(res.status).toBe(501);
    expect(res.body.error.message).toMatch(/GEMINI_API_KEY/);
  });
});

describe('POST /api/exercises/autofill — with a key present (fetch stubbed, no real network)', () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test-fake-key';
    process.env.GEMINI_MODEL = 'gemini-2.0-flash';
  });

  afterEach(() => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_MODEL;
  });

  it('returns a suggestion shape on a well-formed upstream response', async () => {
    const payload = {
      category: 'Push',
      equipment: 'Barbell',
      difficulty: 'Intermediate',
      muscles_worked: ['Chest', 'Triceps'],
      how_to: ['Lie flat.', 'Lower the bar.', 'Press up.'],
      tags: ['compound'],
      video_url: 'https://www.youtube.com/watch?v=abc123',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] }),
      })
    );

    const res = await request(ctx.app).post('/api/exercises/autofill').send({ name: 'Barbell Bench Press' });
    expect(res.status).toBe(200);
    expect(res.body.suggestion).toEqual(payload);
    // The key must never be echoed back to the client under any circumstance.
    expect(JSON.stringify(res.body)).not.toMatch(/test-fake-key/);
  });

  it('502s when the upstream HTTP call fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }));
    const res = await request(ctx.app).post('/api/exercises/autofill').send({ name: 'Squat' });
    expect(res.status).toBe(502);
    expect(res.body.error.message).toBeTruthy();
  });

  it('502s when fetch itself throws (network error)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')));
    const res = await request(ctx.app).post('/api/exercises/autofill').send({ name: 'Squat' });
    expect(res.status).toBe(502);
  });

  it('502s when the upstream response cannot be parsed as our suggestion JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ candidates: [{ content: { parts: [{ text: 'not json' }] } }] }),
      })
    );
    const res = await request(ctx.app).post('/api/exercises/autofill').send({ name: 'Squat' });
    expect(res.status).toBe(502);
  });
});
