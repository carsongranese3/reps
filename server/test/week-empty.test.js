import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { freshApp } from './testApp.js';

let ctx;

beforeAll(async () => {
  ctx = await freshApp('week-empty');
});

afterAll(() => {
  ctx.cleanup();
});

describe('GET /api/week — brand-new user (no plan, no sessions)', () => {
  it('shows 0 of 0 workouts, streak 0, everything Rest', async () => {
    const res = await request(ctx.app).get('/api/week?today=2026-07-08');
    expect(res.body.m).toBe(0);
    expect(res.body.n).toBe(0);
    expect(res.body.streak).toBe(0);
    expect(res.body.days.every((d) => d.status === 'rest')).toBe(true);
  });

  it('GET /api/stats on an empty DB returns zeros', async () => {
    const res = await request(ctx.app).get('/api/stats?today=2026-07-08');
    expect(res.body.this_month_count).toBe(0);
    expect(res.body.total_volume).toBe(0);
    expect(res.body.current_streak).toBe(0);
    expect(res.body.prs_this_month).toBe(0);
    expect(res.body.weekly_volume.length).toBe(8);
  });
});
