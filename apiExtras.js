/* Shared backend helpers used by BOTH the Express server and the Vite dev
   plugin, so dev and production behave identically. Every middleware here is
   (req, res, next) shaped and works under Express 5 and Vite's connect. */

const bootAt = Date.now();
const events = [];
const MAX_EVENTS = 1000;
const EVENT_TYPES = new Set(['freeze', 'next', 'skip', 'share', 'retake']);

export function uptimeSec() {
  return Math.round((Date.now() - bootAt) / 1000);
}

/** Log only /api traffic (media range requests would spam the log). */
export function apiLogger(req, res, next) {
  if (!req.url || !req.url.startsWith('/api')) return next();
  const start = Date.now();
  const done = () => {
    try {
      console.log(`[api] ${req.method} ${req.url} ${res.statusCode} ${Date.now() - start}ms`);
    } catch { /* logging must never break a request */ }
  };
  if (typeof res.on === 'function') res.on('finish', done);
  next();
}

export function securityHeaders(req, res, next) {
  try {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'no-referrer');
  } catch { /* headers must never break a request */ }
  next();
}

export function isEventType(t) {
  return EVENT_TYPES.has(t);
}

export function recordServerEvent(type, mood) {
  if (!isEventType(type)) return false;
  events.push({ type, mood: typeof mood === 'string' ? mood.slice(0, 24) : null, at: Date.now() });
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
  return true;
}

export function sessionSummary() {
  const s = { picks: 0, nexts: 0, skips: 0, shares: 0, retakes: 0, moods: {} };
  for (const e of events) {
    if (e.type === 'freeze') s.picks++;
    else if (e.type === 'next') s.nexts++;
    else if (e.type === 'skip') s.skips++;
    else if (e.type === 'share') s.shares++;
    else if (e.type === 'retake') s.retakes++;
    if (e.mood) s.moods[e.mood] = (s.moods[e.mood] || 0) + 1;
  }
  let topMood = null, topN = 0;
  for (const [k, v] of Object.entries(s.moods)) {
    if (v > topN) { topN = v; topMood = k; }
  }
  return { ...s, topMood, events: events.length };
}

/** Read a small JSON body (for the Vite/connect path, which has no body parser). */
export function readJsonBody(req, limitBytes = 4096) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limitBytes) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(new Error('invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

export const API_MAP = {
  name: 'FaceMeme Finder API',
  routes: [
    'GET /api — this map',
    'GET /api/health — liveness + library count + uptime',
    'GET /api/memes?emotion=&search=&limit=&offset= — local clips, paged',
    'GET /api/online?packs=classics,trending,desi,nepali&count=&nocache=1 — bonus packs (disk-cached 6h)',
    'POST /api/refresh — rebuild the local index now',
    'POST /api/events {type: freeze|next|skip|share|retake, mood?} — session telemetry',
    'GET /api/stats — uptime, library breakdown, cache age, session summary',
    'GET /memes/<file> — video streaming with range support',
    'GET /models/*, /rmn/*, /ort/* — on-device AI weights',
  ],
};
