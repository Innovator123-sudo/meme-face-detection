import fs from 'node:fs';
import path from 'node:path';

export const EMOTION_KEYWORDS = {
  happy: ['laugh', 'haha', 'hasi', 'hihi', 'smile', 'smiling', 'happy', 'joke', 'mast jok', 'maza ayega', 'funny laugh', 'clap', 'dance', 'vibing', 'vibe', 'enjoy', 'proud', 'khush', 'has re', 'has ', 'masti', 'party', 'naughty smile', 'hasna', 'haso ', 'khushi', 'mazaak', 'mazak', 'comedy', 'nach ', 'jashn', 'kush ho', 'muskan', 'muskaan', 'hansi'],
  sad: ['cry', 'crying', 'sad', 'rona', 'toda', 'dukh', 'tear', 'emotional', 'weep', 'suna maya', 'love story', 'shayari sad', 'break', 'tadap', 'rula', 'dard', 'ansoo', 'ashq', 'judai', 'bewafa', 'dhoka', 'udaas', 'dil tuta', 'rota ', 'ro raha', 'aansu'],
  angry: ['angry', 'anger', 'gussa', 'gusse', 'garam', 'control', 'slap', 'shout', 'fight', 'scold', 'maro humko', 'attitude', 'ghamand', 'arrogance', 'thukta', 'nikal', 'bomb se', 'maro ', 'maar ', 'gali ', 'abuse', 'chillana', 'chilla', 'jhagda', 'ladai', 'thappad', 'peet ', 'dhamki', 'tujhe ', 'saala', 'kamine'],
  surprised: ['shock', 'surpris', 'amaze', 'omg', 'shocking', 'kaise ho', 'ye kya', 'staring', 'stare', 'reaction', 'shoked', 'hairan', 'hairani', 'adbhut', 'dekh', 'pakad', 'ruk ja', 'what ', 'ew brother', 'arey', 'arre ', 'yeh kya', 'sach me', 'omg cat', 'achanak', 'kya baat'],
  fearful: ['scare', 'fear', 'waiting', 'nervous', 'tension', 'dara', 'horror', 'bhoot', 'driving meme', 'shaky', 'darr', 'ghabra', 'khauf', 'bachao', 'dar lag'],
  disgusted: ['disgust', 'chi chi', ' chi ', 'ew', 'bakwas', 'wahiyat', 'chee', 'chhee', 'nafrat', 'chappal', 'thook', 'bekaar', 'ganda', 'gandi', 'pakau', 'bakwas'],
  neutral: ['dialogue', 'template', 'scene', 'status', 'interview', 'speech', 'talk', 'entry', 'walk', 'song', 'promo', 'audition', 'explain', 'samjha', 'samjhao', 'samaj', 'pata laga', 'kya karu', 'thinking', 'confus', 'bol ', 'baat ', 'kahani', 'sawal', 'jawab', 'matlab', 'dekh ', 'sun ', 'batao', 'entry'],
};

export const ACTORS = [
  'babu bhaiya', 'babubhaiya', 'baburao', 'raju', 'rajpal yadav', 'rajpal', 'nana patekar', 'nana ',
  'salman khan', 'salman', 'akshay kumar', 'akshay', 'paresh rawal', 'paresh',
  'amitabh', 'bachchan', 'mr bean', 'mr. bean', 'bean', 'brahmanandam', 'allu arjun',
  'puneet superstar', 'puneet', 'carryminati', 'carry', 'johnny lever', 'johnny',
  'prakash raj', 'honey singh', 'kapil', 'haribahadur', 'bhuvan', 'ashneer',
  'homelander', 'patrick bateman', 'troll face', 'troll', 'ishowspeed', 'speed',
  'cillian murphy', 'john cena', 'vijay raaz', 'ajay devgn', 'govinda', 'riteish',
  'sunny deol', 'nawazuddin', 'nawaz', 'pankaj tripathi', 'circuit', 'munna bhai', 'munna ',
  'anupam kher', 'shah rukh', 'shahrukh', 'hrithik', 'ranveer', 'kapil sharma',
  'zakir khan', 'zakir', 'harsh beniwal', 'harsh ', 'modi', 'virat kohli', 'virat', 'dhoni',
  'rajinikanth', 'rajini', 'prabhas', 'pushpa', 'dhanush', 'vijay ', 'elvish', 'munawar',
  'mc stan', 'raftaar', 'badshah', 'sapna choudhary', 'sapna', 'bhojpuri', 'haryanvi',
];

export function resolveMemeDir(appDir) {
  return (
    process.env.MEME_DIR ||
    path.resolve(appDir, '../video meme')
  );
}

export function cleanTitle(filename) {
  const noExt = filename.replace(/\.mp4$/i, '');
  // Filenames look like: <youtubeId>_<readable title>.mp4 — strip the leading id.
  const withoutId = noExt.replace(/^[^a-zA-Z0-9\u0900-\u097F]*[A-Za-z0-9_-]{6,}[_ ]+/, '');
  return withoutId
    .replace(/_/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/⧸+/g, '/')
    .trim()
    .slice(0, 90);
}

export function classifyMeme(filename) {
  const lower = filename.toLowerCase();
  const scores = {};
  for (const [emotion, words] of Object.entries(EMOTION_KEYWORDS)) {
    let s = 0;
    for (const w of words) {
      if (lower.includes(w)) s += w.length >= 6 ? 2 : 1;
    }
    scores[emotion] = s;
  }
  let primary = 'neutral';
  let best = 0;
  let second = 'neutral';
  let secondBest = 0;
  for (const [k, v] of Object.entries(scores)) {
    if (v > best) { secondBest = best; second = primary; best = v; primary = k; }
    else if (v > secondBest) { secondBest = v; second = k; }
  }
  // Heuristic boosts for very common meme phrasings
  if (/(laugh|smil|happy|joke|haha|hihi|dance|clap|maza|comedy)/.test(lower)) primary = 'happy';
  else if (/(cry|crying|sad|rona|tear|toda |toda)/.test(lower)) primary = 'sad';
  else if (/(shock|shocked|surpris|amaze|omg|reaction|staring|adbhut)/.test(lower) && primary === 'neutral') primary = 'surprised';
  else if (/(angry|slap|shout|gussa|attitude|maro|nikal|control uday)/.test(lower) && best <= 1) primary = 'angry';

  // Laugh-then-cry style clips read as joyful, not sad.
  if (/laugh.*cry|cry.*laugh|has.*ro|ro.*has|hassi.*rona|rona.*hassi/.test(lower) && primary === 'sad') {
    second = primary;
    secondBest = best;
    primary = 'happy';
  }

  const actorHit = ACTORS.find((a) => lower.includes(a)) || null;

  const tags = [];
  if (actorHit) tags.push(actorHit.replace(/\s+/g, ' ').trim());
  if (/green screen/.test(lower)) tags.push('green screen');
  if (/no copyright|copyright free/.test(lower)) tags.push('no copyright');
  if (/template/.test(lower)) tags.push('template');
  if (/nepali|nepal/.test(lower)) tags.push('nepali');
  if (/dialogue|scene|movie/.test(lower)) tags.push('dialogue');
  if (/dance|song|vibing/.test(lower)) tags.push('dance');
  if (/reaction/.test(lower)) tags.push('reaction');

  const energy = /laugh|shout|dance|shock|fight|slap|party|vibing|omg|reaction/.test(lower)
    ? 'high'
    : /sad|cry|waiting|sleep|tired|slow|nostalgic|emotional/.test(lower)
      ? 'low'
      : 'medium';

  const mixed = second !== primary && second !== 'neutral' && secondBest >= 2 && best >= 2;
  return { primary, secondary: mixed ? second : null, scores, actor: actorHit, tags, energy };
}

export function buildMemeIndex(memeDir) {
  if (!fs.existsSync(memeDir)) return { memes: [], missing: true };
  const files = fs.readdirSync(memeDir).filter((f) => /\.mp4$/i.test(f));
  const memes = files.map((file, i) => {
    let size = 0;
    try { size = fs.statSync(path.join(memeDir, file)).size; } catch { size = 0; }
    const c = classifyMeme(file);
    return {
      id: i,
      file,
      title: cleanTitle(file) || file,
      url: `/memes/${encodeURIComponent(file)}`,
      emotion: c.primary,
      secondary: c.secondary,
      emotionScores: c.scores,
      actor: c.actor,
      tags: c.tags,
      energy: c.energy,
      size,
    };
  });
  // Stable sort: group-friendly alphabetical within emotion so recommendations feel curated
  memes.sort((a, b) => a.emotion.localeCompare(b.emotion) || a.title.localeCompare(b.title));
  memes.forEach((m, i) => { m.id = i; });
  return { memes, missing: false };
}

export function queryMemes(memes, { emotion, search, limit, offset } = {}) {
  let out = memes;
  if (emotion && emotion !== 'all') out = out.filter((m) => m.emotion === emotion);
  if (search) {
    const q = String(search).toLowerCase();
    out = out.filter((m) => (m.title + ' ' + m.file + ' ' + (m.actor || '') + ' ' + m.tags.join(' ')).toLowerCase().includes(q));
  }
  const total = out.length;
  const start = Math.max(0, Number(offset) || 0);
  if (start) out = out.slice(start);
  if (limit) out = out.slice(0, Math.min(Number(limit) || 50, 400));
  return { total, offset: start, count: out.length, memes: out };
}

/* ---------------- online meme packs (no API key needed) ---------------- */

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url, timeoutMs = 12000, retries = 1) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'FaceMemeFinder/1.0' } });
      clearTimeout(t);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      clearTimeout(t);
      lastError = e;
      if (attempt < retries) await sleep(800 * (attempt + 1));
    }
  }
  throw lastError;
}

/* Dead-sub circuit breaker: a 404ing subreddit is skipped for 12h, not retried every load. */
const deadSubs = new Map();
function subBuried(sub) {
  return (deadSubs.get(sub) || 0) > Date.now();
}
function burySub(sub, ms = 12 * 3600 * 1000) {
  deadSubs.set(sub, Date.now() + ms);
}

function shapeOnline({ title, url, media, pack, sub }) {
  const c = classifyMeme(title || '');
  const tags = ['online', pack];
  if (sub) tags.push(sub.toLowerCase());
  if (/nepal/i.test(`${title} ${sub || ''}`)) tags.push('nepali');
  return {
    id: `online-${pack}-${Math.abs(hashCode(url || title || Math.random().toString()))}`,
    file: url,
    title: (title || 'Online meme').slice(0, 90),
    url,
    emotion: c.primary,
    secondary: c.secondary,
    emotionScores: c.scores,
    actor: c.actor,
    tags,
    energy: c.energy,
    size: 0,
    media: media || 'image',
    source: 'online',
  };
}

function hashCode(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  }
  return h;
}

async function imgflipPack(count) {
  const data = await fetchJson('https://api.imgflip.com/get_memes');
  const list = data?.data?.memes || [];
  return list.slice(0, count).map((m) => shapeOnline({
    title: m.name, url: m.url, media: /\.mp4$/i.test(m.url) ? 'video' : 'image', pack: 'classics',
  }));
}

async function redditPack(sub, count, pack) {
  if (subBuried(sub)) return [];
  // meme-api.com is free and keyless: /gimme/{subreddit}/{count}, max 50 per call
  try {
    const data = await fetchJson(`https://meme-api.com/gimme/${encodeURIComponent(sub)}/${Math.min(Math.max(count, 1), 50)}`);
    deadSubs.delete(sub);
    const list = data?.memes || [];
    return list
      .filter((m) => m?.url && !m.nsfw)
      .map((m) => shapeOnline({
        title: m.title, url: m.url,
        media: /\.(mp4|webm|gif)$/i.test(m.url) ? (/\.(mp4|webm)$/i.test(m.url) ? 'video' : 'image') : 'image',
        pack, sub: m.subreddit || sub,
      }));
  } catch (e) {
    if (/HTTP 4\d\d/.test(String(e?.message))) burySub(sub); // dead sub — stop hammering it
    throw e;
  }
}

/** Parallel 50-sized calls so one sub can yield well past the per-call cap. */
async function redditPackMulti(sub, total, pack) {
  const calls = Math.max(1, Math.min(4, Math.ceil(total / 50)));
  const batches = await Promise.all(
    Array.from({ length: calls }, () => redditPack(sub, 50, pack).catch(() => []))
  );
  return batches.flat();
}

/**
 * Load online bonus packs. `packs` is a subset of ['classics','trending','desi','nepali'].
 * `count` = target memes per major sub. Never throws — one dead API can't break the page.
 */
export async function fetchOnlinePacks({ packs = ['classics', 'trending', 'desi', 'nepali'], count = 100 } = {}) {
  const jobs = [];
  if (packs.includes('classics')) {
    jobs.push(imgflipPack(100).catch((e) => ({ __error: `classics: ${e.message}` })));
  }
  if (packs.includes('trending')) {
    for (const sub of ['memes', 'dankmemes', 'funny']) {
      jobs.push(redditPackMulti(sub, count, 'trending').catch((e) => ({ __error: `trending/${sub}: ${e.message}` })));
    }
  }
  if (packs.includes('desi')) {
    for (const sub of ['IndianDankMemes', 'desimemes']) {
      jobs.push(redditPackMulti(sub, 50, 'desi').catch((e) => ({ __error: `desi/${sub}: ${e.message}` })));
    }
  }
  if (packs.includes('nepali')) {
    // r/NepaliMemes is dead upstream (HTTP 404), so query live Nepal-community subs
    for (const sub of ['nepal', 'Nepal']) {
      jobs.push(redditPackMulti(sub, 50, 'nepali').catch((e) => ({ __error: `nepali/${sub}: ${e.message}` })));
    }
  }
  const settled = await Promise.all(jobs);
  const memes = [];
  const errors = [];
  const seen = new Set();
  for (const r of settled) {
    if (r?.__error) { errors.push(r.__error); continue; }
    for (const m of r || []) {
      if (!m?.url || seen.has(m.url)) continue;
      seen.add(m.url);
      memes.push(m);
    }
  }
  return { memes, errors };
}

export const ONLINE_CACHE_TTL_MS = 6 * 3600 * 1000;

/**
 * Disk-cached online packs shared by the Express server and the Vite dev
 * plugin: first load hits the upstream APIs, repeat loads (and restarts)
 * serve the 6-hour cache file in milliseconds.
 */
export async function fetchOnlineCached({ packs = ['classics', 'trending', 'desi', 'nepali'], count = 100, nocache = false, cacheDir = null } = {}) {
  const key = [...packs].sort().join('+') + ':' + count;
  const file = cacheDir
    ? path.join(cacheDir, 'online-' + Buffer.from(key).toString('base64url') + '.json')
    : null;
  if (file && !nocache) {
    try {
      const st = fs.statSync(file);
      if (Date.now() - st.mtimeMs < ONLINE_CACHE_TTL_MS) {
        const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (Array.isArray(payload?.memes)) return { ...payload, cached: true };
      }
    } catch { /* cache miss — fetch upstream */ }
  }
  const { memes, errors } = await fetchOnlinePacks({ packs, count });
  const payload = { total: memes.length, count: memes.length, memes, errors, cached: false, at: Date.now() };
  if (file) {
    try {
      fs.mkdirSync(cacheDir, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(payload));
    } catch { /* cache write is best-effort */ }
  }
  return payload;
}
