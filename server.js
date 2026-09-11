import express from 'express';
import compression from 'compression';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMemeIndex, queryMemes, resolveMemeDir, fetchOnlineCached } from './memeIndex.js';
import {
  apiLogger, securityHeaders, uptimeSec, recordServerEvent,
  sessionSummary, API_MAP,
} from './apiExtras.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Meme folder lives next to this app: C:\Users\Samrat\Desktop\ollama\video meme
const MEME_DIR = resolveMemeDir(__dirname);
const CACHE_DIR = process.env.CACHE_DIR || path.join(__dirname, '.cache');

const PORT = Number(process.env.PORT) || 3001;
const app = express();
app.disable('x-powered-by');
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '8kb' }));
app.use(apiLogger);
app.use(securityHeaders);

let cache = null;
function getIndex() {
  if (!cache) cache = buildMemeIndex(MEME_DIR);
  return cache;
}

// Auto-rebuild the index when clips are added/removed while running
try {
  fs.watch(MEME_DIR, (event, name) => {
    if (name && /\.mp4$/i.test(name)) {
      cache = null;
      console.log(`[face-meme] library changed (${event} ${name}) — index rebuilds on next request`);
    }
  });
} catch {
  // folder missing or unwatched — /api/health reports it
}

let lastOnlineMeta = { count: 0, at: 0, cached: false };

// Face-AI model weights (served locally so detection works offline)
const localModels = path.join(__dirname, 'public', 'models');
const pkgModels = path.join(__dirname, 'node_modules', '@vladmandic', 'face-api', 'model');
if (fs.existsSync(localModels)) app.use('/models', express.static(localModels, { maxAge: '30d', immutable: true }));
else if (fs.existsSync(pkgModels)) app.use('/models', express.static(pkgModels, { maxAge: '30d', immutable: true }));

// Serve video files with HTTP range support (express.static handles it)
app.use('/memes', express.static(MEME_DIR, {
  fallthrough: false,
  setHeaders(res) {
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=86400');
  },
}));

app.get('/api', (req, res) => res.json(API_MAP));

app.get('/api/health', (req, res) => {
  const idx = getIndex();
  res.json({ ok: true, memeDir: MEME_DIR, exists: fs.existsSync(MEME_DIR), count: idx.memes.length, uptimeSec: uptimeSec() });
});

app.get('/api/memes', (req, res) => {
  const idx = getIndex();
  if (idx.missing) {
    return res.status(500).json({ error: `Meme folder not found: ${MEME_DIR}` });
  }
  res.json(queryMemes(idx.memes, req.query));
});

app.get('/api/online', async (req, res) => {
  const packs = String(req.query.packs || 'classics,trending,desi,nepali').split(',').map((s) => s.trim()).filter(Boolean);
  const count = Math.min(Number(req.query.count) || 100, 100);
  try {
    const payload = await fetchOnlineCached({
      packs, count, nocache: req.query.nocache === '1', cacheDir: CACHE_DIR,
    });
    lastOnlineMeta = { count: payload.count, at: payload.at || Date.now(), cached: !!payload.cached };
    res.json(payload);
  } catch (e) {
    res.status(502).json({ error: `Online packs unreachable: ${e?.message || e}`, memes: [], total: 0, count: 0 });
  }
});

app.post('/api/refresh', (req, res) => {
  cache = buildMemeIndex(MEME_DIR);
  res.json({ ok: true, count: cache.memes.length });
});

app.post('/api/events', (req, res) => {
  const { type, mood } = req.body || {};
  if (!recordServerEvent(type, mood)) {
    return res.status(400).json({ error: 'unknown event type' });
  }
  res.json({ ok: true });
});

app.get('/api/stats', (req, res) => {
  const idx = getIndex();
  const emotions = {};
  for (const m of idx.memes) emotions[m.emotion] = (emotions[m.emotion] || 0) + 1;
  res.json({
    uptimeSec: uptimeSec(),
    local: { count: idx.memes.length, emotions },
    online: lastOnlineMeta,
    session: sessionSummary(),
  });
});

// In production, serve the built React app
const distDir = path.join(__dirname, 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get(/^(?!\/api\/|\/memes\/).*/, (req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

const server = app.listen(PORT, () => {
  const idx = getIndex();
  console.log(`[face-meme] API on http://localhost:${PORT} (GET /api for the route map)`);
  console.log(`[face-meme] Meme dir: ${MEME_DIR} (${idx.memes?.length ?? 0} clips, auto-reloads on change)`);
  console.log(`[face-meme] Frontend dev: npm run dev (http://localhost:5173)`);
  // Prewarm the online disk cache in the background so first users skip the wait
  setImmediate(async () => {
    try {
      const payload = await fetchOnlineCached({ cacheDir: CACHE_DIR });
      lastOnlineMeta = { count: payload.count, at: payload.at || Date.now(), cached: !!payload.cached };
      console.log(`[face-meme] online cache warm: ${payload.count} bonus memes`);
    } catch (e) {
      console.log(`[face-meme] online prewarm skipped (${e?.message || e})`);
    }
  });
});

server.on('error', (err) => {
  if (err?.code === 'EADDRINUSE') {
    console.error(`[face-meme] Port ${PORT} is already in use — another server is running.`);
    console.error(`[face-meme] Stop it first, or run with a different port: $env:PORT=3002; npm run server`);
    process.exit(1);
  }
  throw err;
});
