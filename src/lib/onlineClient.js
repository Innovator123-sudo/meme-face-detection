/* Client-side online meme packs for static hosting (GitHub Pages).
   Browser port of the server's fetchOnlinePacks (memeIndex.js): Imgflip
   classics + meme-api.com subreddits are fetched directly with no backend.
   NOTE: EMOTION_KEYWORDS / ACTORS / classifyMeme are intentionally duplicated
   from memeIndex.js (which imports node:fs and can't ship to the browser).
   Keep the two in sync when keywords change. */

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

export function classifyMeme(filename) {
  const lower = String(filename || '').toLowerCase();
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
  if (/(laugh|smil|happy|joke|haha|hihi|dance|clap|maza|comedy)/.test(lower)) primary = 'happy';
  else if (/(cry|crying|sad|rona|tear|toda |toda)/.test(lower)) primary = 'sad';
  else if (/(shock|shocked|surpris|amaze|omg|reaction|staring|adbhut)/.test(lower) && primary === 'neutral') primary = 'surprised';
  else if (/(angry|slap|shout|gussa|attitude|maro|nikal|control uday)/.test(lower) && best <= 1) primary = 'angry';

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

function hashCode(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  }
  return h;
}

export function shapeOnline({ title, url, media, pack, sub }) {
  const c = classifyMeme(title || '');
  const tags = ['online', pack];
  if (sub) tags.push(String(sub).toLowerCase());
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

async function fetchJson(url, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

async function imgflipPack(count) {
  const data = await fetchJson('https://api.imgflip.com/get_memes');
  const list = data?.data?.memes || [];
  return list.slice(0, count).map((m) => shapeOnline({
    title: m.name, url: m.url, media: /\.mp4$/i.test(m.url) ? 'video' : 'image', pack: 'classics',
  }));
}

async function redditPack(sub, count, pack) {
  const data = await fetchJson(`https://meme-api.com/gimme/${encodeURIComponent(sub)}/${Math.min(Math.max(count, 1), 50)}`);
  const list = data?.memes || [];
  return list
    .filter((m) => m?.url && !m.nsfw)
    .map((m) => shapeOnline({
      title: m.title, url: m.url,
      media: /\.(mp4|webm|gif)$/i.test(m.url) ? (/\.(mp4|webm)$/i.test(m.url) ? 'video' : 'image') : 'image',
      pack, sub: m.subreddit || sub,
    }));
}

/**
 * Fetch online packs straight from the browser (no backend). Never throws —
 * one dead API can't break the page. Mirrors the server's fetchOnlinePacks.
 */
export async function fetchOnlineDirect({ packs = ['classics', 'trending', 'desi', 'nepali'], count = 60 } = {}) {
  const jobs = [];
  if (packs.includes('classics')) {
    jobs.push(imgflipPack(100).catch((e) => ({ __error: `classics: ${e.message}` })));
  }
  if (packs.includes('trending')) {
    for (const sub of ['memes', 'dankmemes', 'funny']) {
      jobs.push(redditPack(sub, count, 'trending').catch((e) => ({ __error: `trending/${sub}: ${e.message}` })));
    }
  }
  if (packs.includes('desi')) {
    for (const sub of ['IndianDankMemes', 'desimemes']) {
      jobs.push(redditPack(sub, 40, 'desi').catch((e) => ({ __error: `desi/${sub}: ${e.message}` })));
    }
  }
  if (packs.includes('nepali')) {
    for (const sub of ['nepal', 'Nepal']) {
      jobs.push(redditPack(sub, 40, 'nepali').catch((e) => ({ __error: `nepali/${sub}: ${e.message}` })));
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
  return { total: memes.length, count: memes.length, memes, errors, direct: true, at: Date.now() };
}
