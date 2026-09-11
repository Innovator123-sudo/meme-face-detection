export async function fetchMemes({ emotion = 'all', search = '', limit = 400 } = {}) {
  const params = new URLSearchParams();
  if (emotion && emotion !== 'all') params.set('emotion', emotion);
  if (search) params.set('search', search);
  if (limit) params.set('limit', String(limit));
  const res = await fetch(`/api/memes?${params.toString()}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Meme API failed (${res.status})`);
  }
  return res.json();
}

export async function fetchHealth() {
  const res = await fetch('/api/health');
  if (!res.ok) throw new Error('Backend unreachable');
  return res.json();
}

/** Fire-and-forget session telemetry for the backend stats board. */
export function recordEvent(type, mood) {
  try {
    fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, mood: mood || undefined }),
      keepalive: true,
    }).catch(() => {});
  } catch { /* telemetry must never break the UI */ }
}

export async function fetchSession() {
  const res = await fetch('/api/stats');
  if (!res.ok) throw new Error('stats unreachable');
  const d = await res.json();
  return d.session || { picks: 0, topMood: null };
}

/** Meme URLs from the API are already relative (/memes/...) and work in dev + prod. */
export function memeUrl(meme) {
  return meme.url;
}

export function formatBytes(n) {
  if (!n) return '—';
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
