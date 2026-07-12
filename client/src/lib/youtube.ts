// YouTube URL parsing for the exercise `video_url` (set manually or via AI autofill, decision #16).
// This never drives seek-per-step demo behavior; it's purely for rendering a privacy-friendly
// embed / thumbnail, or falling back to a plain external link.

const YOUTUBE_ID_RE = /^[a-zA-Z0-9_-]{6,15}$/;

/** Extract a YouTube video id from common URL forms, or null if it isn't a
 * recognizable/parseable YouTube URL. Never throws. */
export function parseYouTubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
  const isYouTubeHost =
    host === 'youtube.com' ||
    host === 'm.youtube.com' ||
    host === 'youtube-nocookie.com' ||
    host === 'youtu.be';
  if (!isYouTubeHost) return null;

  let id: string | null = null;
  if (host === 'youtu.be') {
    id = parsed.pathname.split('/').filter(Boolean)[0] ?? null;
  } else if (parsed.pathname === '/watch') {
    id = parsed.searchParams.get('v');
  } else if (parsed.pathname.startsWith('/embed/')) {
    id = parsed.pathname.split('/embed/')[1]?.split('/')[0] ?? null;
  } else if (parsed.pathname.startsWith('/shorts/')) {
    id = parsed.pathname.split('/shorts/')[1]?.split('/')[0] ?? null;
  }

  if (id && YOUTUBE_ID_RE.test(id)) return id;
  return null;
}

/** Privacy-friendly embed URL for a parsed YouTube id. */
export function youTubeEmbedUrl(id: string): string {
  return `https://www.youtube-nocookie.com/embed/${id}`;
}

/** Thumbnail image URL for a parsed YouTube id (hqdefault always exists). */
export function youTubeThumbnail(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

/** The best available photo for an exercise: an uploaded image if present,
 * otherwise the YouTube thumbnail derived from its video_url, otherwise null. */
export function exercisePhoto(ex: { image?: string | null; video_url?: string | null }): string | null {
  if (ex.image) return ex.image;
  const id = parseYouTubeId(ex.video_url);
  return id ? youTubeThumbnail(id) : null;
}
