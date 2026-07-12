// Consistent JSON error shape across the whole API: { error: { message, ...extra } }
export function sendError(res, status, message, extra = {}) {
  return res.status(status).json({ error: { message, ...extra } });
}

export function notFound(res, what = 'Resource') {
  return sendError(res, 404, `${what} not found`);
}
