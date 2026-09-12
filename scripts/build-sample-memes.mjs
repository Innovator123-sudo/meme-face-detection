/* Build the committed sample-clip manifest for static hosting.
   Scans public/sample-memes/*.mp4 (a curated subset of the local
   `video meme` folder, which is too big for git) plus
   public/sample-images/*.jpg (Imgflip classics), and writes
   public/sample-memes.json with the same shape the backend API returns,
   so GitHub Pages can play real video memes with no Express server.
   Usage: node scripts/build-sample-memes.mjs (also runs in pages.yml). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyMeme, cleanTitle } from '../memeIndex.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(__dirname, '..');

function imageTitle(file) {
  return file.replace(/\.jpe?g$/i, '').replace(/--[^-]+$/, '').replace(/-/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, 90) || file;
}

const memes = [];
const videosDir = path.join(appDir, 'public', 'sample-memes');
const videoFiles = fs.existsSync(videosDir) ? fs.readdirSync(videosDir).filter((f) => /\.mp4$/i.test(f)).sort() : [];
for (const file of videoFiles) {
  let size = 0;
  try { size = fs.statSync(path.join(videosDir, file)).size; } catch { size = 0; }
  const c = classifyMeme(file);
  memes.push({
    id: `sample-${memes.length}`,
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
  });
}
const imagesDir = path.join(appDir, 'public', 'sample-images');
const imageFiles = fs.existsSync(imagesDir) ? fs.readdirSync(imagesDir).filter((f) => /\.jpe?g$/i.test(f)).sort() : [];
for (const file of imageFiles) {
  let size = 0;
  try { size = fs.statSync(path.join(imagesDir, file)).size; } catch { size = 0; }
  const c = classifyMeme(file);
  memes.push({
    id: `sample-${memes.length}`,
    file,
    title: imageTitle(file),
    url: `sample-images/${encodeURIComponent(file)}`,
    emotion: c.primary,
    secondary: c.secondary,
    emotionScores: c.scores,
    actor: c.actor,
    tags: [...c.tags, 'sample'],
    energy: c.energy,
    size,
    media: 'image',
    source: 'sample',
  });
}
const out = path.join(appDir, 'public', 'sample-memes.json');
fs.writeFileSync(out, JSON.stringify(memes, null, 1));
const emo = {};
for (const m of memes) emo[`${m.media}:${m.emotion}`] = (emo[`${m.media}:${m.emotion}`] || 0) + 1;
console.log(`[sample-memes] wrote ${memes.length} entries (${videoFiles.length} video + ${imageFiles.length} image) -> public/sample-memes.json`);
console.log('[sample-memes] breakdown:', JSON.stringify(emo));
