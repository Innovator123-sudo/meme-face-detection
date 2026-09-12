/* Builder: 800 Hindi + Nepali memes via Reddit's public JSON (paginated).
   Writes public/desi-800.json (URL catalog, no binaries) with the same shape
   as live online memes, so static hosting gets a big desi library with zero
   backend. Rerun anytime to refresh: node scripts/build-desi-800.mjs */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { shapeOnline } from '../src/lib/onlineClient.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(__dirname, '..');
const TARGET = 800;

// [subreddit, pack, maxPages] — 100 posts/page, walk `before` cursors.
// Nepali subs first so the 800 cap keeps a guaranteed Nepali share.
const PLAN = [
  ['nepal', 'nepali', 8],
  ['Kathmandu', 'nepali', 3],
  ['NepaliMemes', 'nepali', 3],
  ['NepalMemes', 'nepali', 2],
  ['Nepal', 'nepali', 2],
  ['IndianDankMemes', 'desi', 8],
  ['desimemes', 'desi', 6],
  ['indianmemes', 'desi', 4],
  ['IndiaMemes', 'desi', 3],
  ['dankinindia', 'desi', 3],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const IMG = /\.(jpg|jpeg|png)(\?.*)?$/i;

async function page(sub, before, attempt = 0) {
  // Arctic-shift mirror (www.reddit.com 403s non-OAuth clients).
  // `before` = oldest created_utc seen so far; default order is newest-first.
  const url = `https://arctic-shift.photon-reddit.com/api/posts/search?subreddit=${encodeURIComponent(sub)}&limit=100${before ? `&before=${before}` : ''}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'FaceMemeFinder/1.0 (static catalog builder)' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    if (attempt < 2) {
      await sleep(2500 * (attempt + 1));
      return page(sub, before, attempt + 1);
    }
    throw e;
  } finally {
    clearTimeout(t);
  }
}

const seen = new Set();
const memes = [];
const errors = [];
for (const [sub, pack, maxPages] of PLAN) {
  let before = null;
  let pages = 0;
  try {
    for (let p = 0; p < maxPages; p++) {
      const data = await page(sub, before);
      const children = Array.isArray(data?.data) ? data.data : [];
      if (!children.length) break;
      before = children[children.length - 1].created_utc;
      let fresh = 0;
      for (const m of children) {
        if (!m?.url || m.over_18 || m.stickied || seen.has(m.url)) continue;
        if (!IMG.test(m.url)) continue;
        if (/^https:\/\/v\.redd\.it\//.test(m.url)) continue; // DASH video, not playable
        seen.add(m.url);
        memes.push(shapeOnline({
          title: m.title, url: m.url,
          media: 'image',
          pack: `${pack}-800`, sub: m.subreddit || sub,
        }));
        fresh++;
      }
      pages++;
      console.log(`[desi-800] r/${sub} page ${pages}/${maxPages}: +${fresh} (total ${memes.length})`);
      await sleep(1500);
      if (!before || memes.length >= TARGET) break;
    }
  } catch (e) {
    errors.push(`${sub}: ${e.message}`);
    console.log(`[desi-800] r/${sub} FAILED: ${e.message}`);
  }
  if (memes.length >= TARGET) break;
}

const out = path.join(appDir, 'public', 'desi-800.json');
fs.writeFileSync(out, JSON.stringify({ total: memes.length, count: memes.length, memes, errors, at: Date.now() }));
const emo = {};
for (const m of memes) emo[m.emotion] = (emo[m.emotion] || 0) + 1;
const nep = memes.filter((m) => m.tags.includes('nepali')).length;
console.log(`[desi-800] wrote ${memes.length} entries -> public/desi-800.json (${nep} nepali)`);
console.log('[desi-800] emotions:', JSON.stringify(emo));
if (errors.length) console.log('[desi-800] errors:', errors.join(' | '));
if (memes.length < TARGET) {
  console.log(`[desi-800] WARN only ${memes.length}/${TARGET} — rerun later to top up`);
  process.exit(1);
}
