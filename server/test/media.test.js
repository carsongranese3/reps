import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { freshApp } from './testApp.js';

// Verifies the demo media surface end-to-end: draft-then-claim upload, direct
// upload, HTTP Range streaming (spec §2.5 "streamed on demand (Range)"), type
// rejection (25MB/type limits), and that a malicious draft_token can't traverse
// out of the drafts dir (security pass — the token is matched against a dir
// listing, never used to build a path).

let ctx;
// A tiny valid-enough PNG-ish payload; content bytes don't matter for streaming.
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(2000, 0x41)]);

beforeAll(async () => {
  ctx = await freshApp('media');
});

afterAll(() => {
  ctx.cleanup();
});

describe('Demo media — upload + Range streaming', () => {
  let id;

  it('direct-uploads a demo onto an existing exercise and flips has_demo', async () => {
    const created = await request(ctx.app).post('/api/exercises').send({ name: 'Demo Ex' });
    id = created.body.id;
    expect(created.body.has_demo).toBe(false);

    const up = await request(ctx.app)
      .post(`/api/exercises/${id}/demo`)
      .attach('file', PNG, { filename: 'clip.png', contentType: 'image/png' });
    expect(up.status).toBe(200);
    expect(up.body.has_demo).toBe(true);
    expect(up.body).not.toHaveProperty('demo_file'); // never exposed
  });

  it('streams the full file with Accept-Ranges when no Range header is sent', async () => {
    const res = await request(ctx.app).get(`/api/exercises/${id}/demo`);
    expect(res.status).toBe(200);
    expect(res.headers['accept-ranges']).toBe('bytes');
    expect(res.headers['content-type']).toBe('image/png');
    expect(Number(res.headers['content-length'])).toBe(PNG.length);
  });

  it('returns 206 Partial Content with a correct Content-Range for a Range request', async () => {
    const res = await request(ctx.app)
      .get(`/api/exercises/${id}/demo`)
      .set('Range', 'bytes=0-99');
    expect(res.status).toBe(206);
    expect(res.headers['content-range']).toBe(`bytes 0-99/${PNG.length}`);
    expect(Number(res.headers['content-length'])).toBe(100);
  });

  it('returns 416 for an unsatisfiable range', async () => {
    const res = await request(ctx.app)
      .get(`/api/exercises/${id}/demo`)
      .set('Range', 'bytes=999999-');
    expect(res.status).toBe(416);
  });

  it('rejects an unsupported file type (400)', async () => {
    const res = await request(ctx.app)
      .post(`/api/exercises/${id}/demo`)
      .attach('file', Buffer.from('hello'), { filename: 'note.txt', contentType: 'text/plain' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/unsupported file type/i);
  });

  it('claims a draft upload onto a new exercise via draft_token', async () => {
    const draft = await request(ctx.app)
      .post('/api/exercises/demo/draft')
      .attach('file', PNG, { filename: 'clip.png', contentType: 'image/png' });
    expect(draft.status).toBe(201);
    expect(draft.body.draft_token).toBeTruthy();

    const created = await request(ctx.app)
      .post('/api/exercises')
      .send({ name: 'Claimed Ex', draft_token: draft.body.draft_token });
    expect(created.status).toBe(201);
    expect(created.body.has_demo).toBe(true);
  });

  it('SECURITY: a path-traversal draft_token is a no-op, never attaches a file', async () => {
    const created = await request(ctx.app)
      .post('/api/exercises')
      .send({ name: 'Evil Claim', draft_token: '../../../etc/passwd' });
    expect(created.status).toBe(201);
    expect(created.body.has_demo).toBe(false);
  });

  it('404s a demo stream for an unknown / traversal exercise id', async () => {
    const res = await request(ctx.app).get('/api/exercises/..%2f..%2fetc%2fpasswd/demo');
    expect(res.status).toBe(404);
  });
});
