// Demo media on disk (never in the DB). Uploads land in server/media/drafts/<token>
// and are "claimed" into server/media/<exerciseId>.<ext> on save. Streamed back via
// GET /api/exercises/:id/demo with HTTP Range support.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import { MEDIA_DIR, DRAFTS_DIR } from '../db.js';

export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25MB

const MIME_TO_EXT = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'image/gif': 'gif',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

const EXT_TO_CONTENT_TYPE = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  gif: 'image/gif',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (req, file, cb) => {
    if (MIME_TO_EXT[file.mimetype]) return cb(null, true);
    cb(new Error(`Unsupported file type: ${file.mimetype}`));
  },
}).single('file');

function extFor(file) {
  return MIME_TO_EXT[file.mimetype] || path.extname(file.originalname || '').replace('.', '') || 'bin';
}

function removeExistingDemoFiles(dir, baseId) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry === baseId || entry.startsWith(`${baseId}.`)) {
      try {
        fs.unlinkSync(path.join(dir, entry));
      } catch {
        /* ignore */
      }
    }
  }
}

// Saves an uploaded file as a draft (used when the exercise doesn't have an id
// yet, e.g. the create-exercise flow). Returns { draft_token, filename }.
export function saveDraft(file) {
  const token = crypto.randomUUID();
  const ext = extFor(file);
  const filename = `${token}.${ext}`;
  fs.writeFileSync(path.join(DRAFTS_DIR, filename), file.buffer);
  return { draft_token: token, filename };
}

// Moves a previously-uploaded draft into place as the given exercise's demo
// file. Returns the bare filename to store in demo_file, or null if the draft
// token doesn't resolve to a file on disk (expired/swept/invalid).
export function claimDraft(draftToken, exerciseId) {
  if (!draftToken) return null;
  let entries = [];
  try {
    entries = fs.readdirSync(DRAFTS_DIR);
  } catch {
    return null;
  }
  const match = entries.find((f) => f.startsWith(`${draftToken}.`));
  if (!match) return null;
  const ext = path.extname(match).replace('.', '');
  removeExistingDemoFiles(MEDIA_DIR, exerciseId);
  const filename = `${exerciseId}.${ext}`;
  fs.renameSync(path.join(DRAFTS_DIR, match), path.join(MEDIA_DIR, filename));
  return filename;
}

// Direct upload straight onto an existing exercise (no draft indirection needed
// because the id is already known — used by POST /api/exercises/:id/demo).
export function saveDirectToExercise(file, exerciseId) {
  const ext = extFor(file);
  removeExistingDemoFiles(MEDIA_DIR, exerciseId);
  const filename = `${exerciseId}.${ext}`;
  fs.writeFileSync(path.join(MEDIA_DIR, filename), file.buffer);
  return filename;
}

export function removeExerciseDemo(exerciseId) {
  removeExistingDemoFiles(MEDIA_DIR, exerciseId);
}

// Sweep drafts older than maxAgeMs (default 24h) — called on boot and on a timer.
export function sweepStaleDrafts(maxAgeMs = 24 * 60 * 60 * 1000) {
  let entries = [];
  try {
    entries = fs.readdirSync(DRAFTS_DIR);
  } catch {
    return;
  }
  const now = Date.now();
  for (const entry of entries) {
    const full = path.join(DRAFTS_DIR, entry);
    try {
      const stat = fs.statSync(full);
      if (now - stat.mtimeMs > maxAgeMs) fs.unlinkSync(full);
    } catch {
      /* ignore */
    }
  }
}

// Streams an exercise's demo file with Range support. `demo_file` is the bare
// filename (never exposed via the API — only has_demo). Sends 404 if missing.
export function streamDemo(req, res, demo_file) {
  if (!demo_file) {
    res.status(404).json({ error: { message: 'No demo available' } });
    return;
  }
  const filePath = path.join(MEDIA_DIR, demo_file);
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    res.status(404).json({ error: { message: 'Demo file missing on disk' } });
    return;
  }

  const ext = path.extname(demo_file).replace('.', '').toLowerCase();
  const contentType = EXT_TO_CONTENT_TYPE[ext] || 'application/octet-stream';
  const range = req.headers.range;

  if (!range) {
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stat.size,
      'Accept-Ranges': 'bytes',
    });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  const match = /bytes=(\d*)-(\d*)/.exec(range);
  let start = match && match[1] ? parseInt(match[1], 10) : 0;
  let end = match && match[2] ? parseInt(match[2], 10) : stat.size - 1;
  if (Number.isNaN(start)) start = 0;
  if (Number.isNaN(end) || end >= stat.size) end = stat.size - 1;
  if (start > end || start >= stat.size) {
    res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
    res.end();
    return;
  }

  res.writeHead(206, {
    'Content-Range': `bytes ${start}-${end}/${stat.size}`,
    'Accept-Ranges': 'bytes',
    'Content-Length': end - start + 1,
    'Content-Type': contentType,
  });
  fs.createReadStream(filePath, { start, end }).pipe(res);
}
