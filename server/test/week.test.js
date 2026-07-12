import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { freshApp } from './testApp.js';

let ctx;
let exId;
let wMon;
let wWed;
let wThu;

// Fixed calendar week used throughout: Mon 2026-07-06 .. Sun 2026-07-12.
async function makeWorkout(title) {
  const res = await request(ctx.app)
    .post('/api/workouts')
    .send({ title, category: 'Strength', exercises: [{ exercise_id: exId, sets: 1, reps: 1, rest: 0 }] });
  return res.body.id;
}

async function session(workout_id, date) {
  return request(ctx.app).post('/api/sessions').send({ workout_id, date, duration_sec: 60, entries: [] });
}

beforeAll(async () => {
  ctx = await freshApp('week');
  const ex = await request(ctx.app).post('/api/exercises').send({ name: 'Back Squat', category: 'Legs' });
  exId = ex.body.id;
  wMon = await makeWorkout('Mon Workout');
  wWed = await makeWorkout('Wed Workout');
  wThu = await makeWorkout('Thu Workout');

  // Plan: mon, wed, thu planned; tue/fri/sat/sun Rest. M = 3.
  await request(ctx.app).put('/api/plan/mon').send({ workout_id: wMon });
  await request(ctx.app).put('/api/plan/wed').send({ workout_id: wWed });
  await request(ctx.app).put('/api/plan/thu').send({ workout_id: wThu });
});

afterAll(() => {
  ctx.cleanup();
});

describe('GET /api/week — statuses, N-of-M, streak (no sessions yet)', () => {
  it('today=2026-07-08 (Wed): mon is Missed, wed is Planned (today, not done), thu is Planned, tue/fri/sat/sun Rest', async () => {
    const res = await request(ctx.app).get('/api/week?today=2026-07-08');
    expect(res.status).toBe(200);
    const byDay = Object.fromEntries(res.body.days.map((d) => [d.day, d]));

    expect(byDay.mon.status).toBe('missed');
    expect(byDay.tue.status).toBe('rest');
    expect(byDay.wed.status).toBe('planned');
    expect(byDay.wed.is_today).toBe(true);
    expect(byDay.thu.status).toBe('planned');
    expect(byDay.fri.status).toBe('rest');

    expect(res.body.m).toBe(3);
    expect(res.body.n).toBe(0);
    // today (wed) is planned-not-done -> doesn't break the streak, but tue
    // (rest, pass-through) leads back to mon which IS missed -> streak 0.
    expect(res.body.streak).toBe(0);
  });
});

describe('GET /api/week — after completing Monday', () => {
  it('marks mon Done, bumps N, and the streak walks through Rest days without breaking', async () => {
    await session(wMon, '2026-07-06T09:00:00.000Z');

    const res = await request(ctx.app).get('/api/week?today=2026-07-08');
    const byDay = Object.fromEntries(res.body.days.map((d) => [d.day, d]));

    expect(byDay.mon.status).toBe('done');
    expect(res.body.n).toBe(1);
    expect(res.body.m).toBe(3);
    // wed (today, planned-not-done) skipped; tue (rest) passes through;
    // mon (done) -> streak=1; before that, the prior week's Thu is planned
    // (fixed weekly template) with no session -> missed -> streak stops at 1.
    expect(res.body.streak).toBe(1);
  });
});

describe('GET /api/week — off-plan session on a Rest day', () => {
  it('marks the Rest day Done and counts it toward N, but not M (decision #4)', async () => {
    await session(wMon, '2026-07-07T09:00:00.000Z'); // Tuesday, a Rest day in the plan

    const res = await request(ctx.app).get('/api/week?today=2026-07-08');
    const byDay = Object.fromEntries(res.body.days.map((d) => [d.day, d]));

    expect(byDay.tue.status).toBe('done'); // Done overrides the nominal Rest rendering
    expect(res.body.m).toBe(3); // unchanged — tue was never a planned day
    expect(res.body.n).toBe(2); // mon + tue both Done now
  });
});

describe('GET /api/week — multiple sessions same day are not double-counted', () => {
  it('logging two sessions on the same calendar day still counts that day Done once', async () => {
    await session(wThu, '2026-07-09T08:00:00.000Z');
    await session(wThu, '2026-07-09T18:00:00.000Z');

    const res = await request(ctx.app).get('/api/week?today=2026-07-10');
    const byDay = Object.fromEntries(res.body.days.map((d) => [d.day, d]));
    expect(byDay.thu.status).toBe('done');
    // n = mon, tue (off-plan), thu = 3 (wed still not done, it's in the past now -> missed)
    expect(byDay.wed.status).toBe('missed');
    expect(res.body.n).toBe(3);
  });
});

describe('GET /api/week — deleted-workout plan reference degrades to Rest', () => {
  it('a day whose planned workout was deleted renders as Rest and drops out of M', async () => {
    await request(ctx.app).delete(`/api/workouts/${wWed}`);
    const res = await request(ctx.app).get('/api/week?today=2026-07-10');
    const byDay = Object.fromEntries(res.body.days.map((d) => [d.day, d]));
    expect(byDay.wed.status).toBe('rest');
    expect(byDay.wed.workouts).toEqual([]);
    expect(res.body.m).toBe(2); // mon + thu only now
  });
});

describe('GET /api/week — schedule override drives the week payload (specs/schedule.md §4-§5)', () => {
  // Uses an unrelated future week so it doesn't interact with the state built
  // up by the describes above (a session logged on this week's Monday, etc.).
  const monday = '2026-08-03'; // Mon
  const tuesday = '2026-08-04'; // Tue

  it('a date with multiple override workouts shows workouts[] with both entries', async () => {
    const put = await request(ctx.app).put(`/api/schedule/${monday}`).send({ workout_ids: [wMon, wThu] });
    expect(put.status).toBe(200);
    expect(put.body.source).toBe('schedule');
    expect(put.body.workouts.map((w) => w.id)).toEqual([wMon, wThu]);

    const res = await request(ctx.app).get(`/api/week?today=${monday}`);
    const byDate = Object.fromEntries(res.body.days.map((d) => [d.date, d]));
    expect(byDate[monday].workouts.map((w) => w.id)).toEqual([wMon, wThu]);
    // M for the week includes both of this date's planned entries.
    expect(res.body.m).toBeGreaterThanOrEqual(2);
  });

  it('an explicit Rest override on a date makes it empty even if the template would plan something', async () => {
    const rest = await request(ctx.app).put(`/api/schedule/${tuesday}`).send({ rest: true });
    expect(rest.status).toBe(200);
    expect(rest.body.source).toBe('rest');
    expect(rest.body.workouts).toEqual([]);

    const res = await request(ctx.app).get(`/api/week?today=${monday}`);
    const byDate = Object.fromEntries(res.body.days.map((d) => [d.date, d]));
    expect(byDate[tuesday].workouts).toEqual([]);
    expect(byDate[tuesday].status).toBe('rest');
  });

  it('completing one of two planned workouts on a date marks the day Done (partial completion is an N-of-M detail, not a day-status one)', async () => {
    await session(wMon, `${monday}T09:00:00.000Z`);
    const res = await request(ctx.app).get(`/api/week?today=${monday}`);
    const byDate = Object.fromEntries(res.body.days.map((d) => [d.date, d]));
    expect(byDate[monday].status).toBe('done');
    expect(byDate[monday].workouts.map((w) => w.id)).toEqual([wMon, wThu]);
  });

  it('an unrelated off-plan workout on a planned date still credits N once without inflating past M (§5.2 tradeoff)', async () => {
    // A date with 2 planned workouts; complete 1 planned + 1 genuinely unrelated
    // one. Verify via the resolved workouts + the N total not jumping by more
    // than the tradeoff allows (satisfiedCount=1 + offPlanCredit=1, not more).
    const day = '2026-08-17';
    const wOffPlan = await makeWorkout('Unrelated Off-Plan Workout');
    await request(ctx.app).put(`/api/schedule/${day}`).send({ workout_ids: [wMon, wThu] });

    const before = await request(ctx.app).get(`/api/week?today=${day}`);

    await session(wMon, `${day}T09:00:00.000Z`); // satisfies one of the two planned entries
    await session(wOffPlan, `${day}T18:00:00.000Z`); // unrelated to anything planned that day

    const after = await request(ctx.app).get(`/api/week?today=${day}`);
    const byDate = Object.fromEntries(after.body.days.map((d) => [d.date, d]));
    expect(byDate[day].status).toBe('done');
    expect(byDate[day].workouts.map((w) => w.id)).toEqual([wMon, wThu]);
    // satisfiedCount(1) + offPlanCredit(1) = 2 contributed by this single day.
    expect(after.body.n).toBe(before.body.n + 2);
  });

  it('duplicate planned entries of the same workout only satisfy up to the planned count (min(k,j))', async () => {
    const day = '2026-08-24';
    const baseline = await request(ctx.app).get(`/api/week?today=${day}`);

    const put = await request(ctx.app).put(`/api/schedule/${day}`).send({ workout_ids: [wMon, wMon] }); // k=2
    expect(put.body.workouts.map((w) => w.id)).toEqual([wMon, wMon]);

    const afterPlan = await request(ctx.app).get(`/api/week?today=${day}`);
    // The template already planned Monday once (m contributes 1); the override
    // replaces it with 2 entries, a net +1 for the week's M.
    expect(afterPlan.body.m).toBe(baseline.body.m + 1);

    await session(wMon, `${day}T09:00:00.000Z`); // j=1 -> satisfied=min(2,1)=1, no off-plan (same workout)
    const afterSession = await request(ctx.app).get(`/api/week?today=${day}`);

    expect(afterSession.body.m).toBe(afterPlan.body.m); // m unaffected by sessions
    expect(afterSession.body.n).toBe(afterPlan.body.n + 1);
  });
});

describe('GET /api/stats — streak matches /api/week exactly', () => {
  it('returns the identical streak value from the shared helper', async () => {
    const week = await request(ctx.app).get('/api/week?today=2026-07-10');
    const stats = await request(ctx.app).get('/api/stats?today=2026-07-10');
    expect(stats.body.current_streak).toBe(week.body.streak);
  });

  it('rejects a malformed today query param', async () => {
    const res = await request(ctx.app).get('/api/week?today=not-a-date');
    expect(res.status).toBe(400);
  });
});
