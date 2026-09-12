/* Build the committed sample-clip manifest for static hosting.
   Scans public/sample-memes/*.mp4 (a small curated subset of the local
   `video meme` folder, which is too big for git) and writes
   public/sample-memes.json with the same shape the backend API returns,
   so GitHub Pages can play real video memes with no Express server.
   Usage: node scripts/build-sample-memes.mjs (also runs in pages.yml). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyMeme, cleanTitle } from '../memeIndex.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(__dirname, '..');
const dir = path.join(appDir, 'public', 'sample-memes');
const out = path.join(appDir, 'public', 'sample-memes.json');

const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.mp4$/i.test(f)).sort() : [];
const memes = files.map((file, i) => {
  let size = 0;
  try { size = fs.statSync(path.join(dir, file)).size; } catch { size = 0; }
  const c = classifyMeme(file);
  return {
    id: `sample-${i}`,
    file,
    title: cleanTitle(file) || file,
    url: `sample-memes/${encodeURIComponent(file)}`,
    emotion: c.primary,
    secondary: c.secondary,
    emotionScores: c.scores,
    actor: c.actor,
    tags: [...c.tags, 'sample'],
    energy: c.energy,
    size,
    media: 'video',
    source: 'sample',
  };
});
fs.writeFileSync(out, JSON.stringify(memes, null, 1));
const emo = {};
for (const m of memes) emo[m.emotion] = (emo[m.emotion] || 0) + 1;
console.log(`[sample-memes] wrote ${memes.length} entries -> public/sample-memes.json ${JSON.stringify(emo)}`);
