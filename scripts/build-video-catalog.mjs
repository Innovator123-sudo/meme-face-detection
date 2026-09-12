/* Build the cloud video catalog for static hosting.
   Scans public/videos/*.mp4 (the full local `video meme` library, mirrored
   into git so GitHub's CDN delivers it) plus public/sample-images/*.jpg
   (Imgflip classics), and writes public/video-catalog.json with the same
   shape the backend API returns. The Pages site treats this file as its
   cloud video API — no Express server, no local files.
   Usage: node scripts/build-video-catalog.mjs (also runs in pages.yml). */
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
const videosDir = path.join(appDir, 'public', 'videos');
const videoFiles = fs.existsSync(videosDir) ? fs.readdirSync(videosDir).filter((f) => /\.mp4$/i.test(f)).sort() : [];
for (const file of videoFiles) {
  let size = 0;
  try { size = fs.statSync(path.join(videosDir, file)).size; } catch { size = 0; }
  const c = classifyMeme(file);
  memes.push({
    id: `cloud-${memes.length}`,
    file,
    title: cleanTitle(file) || file,
    url: `videos/${encodeURIComponent(file)}`,
    emotion: c.primary,
    secondary: c.secondary,
    emotionScores: c.scores,
    actor: c.actor,
    tags: [...c.tags, 'cloud'],
    energy: c.energy,
    size,
    media: 'video',
    source: 'cloud',
  });
}
const imagesDir = path.join(appDir, 'public', 'sample-images');
const imageFiles = fs.existsSync(imagesDir) ? fs.readdirSync(imagesDir).filter((f) => /\.jpe?g$/i.test(f)).sort() : [];
for (const file of imageFiles) {
  let size = 0;
  try { size = fs.statSync(path.join(imagesDir, file)).size; } catch { size = 0; }
  const c = classifyMeme(file);
  memes.push({
    id: `cloud-${memes.length}`,
    file,
    title: imageTitle(file),
    url: `sample-images/${encodeURIComponent(file)}`,
    emotion: c.primary,
    secondary: c.secondary,
    emotionScores: c.scores,
    actor: c.actor,
    tags: [...c.tags, 'cloud'],
    energy: c.energy,
    size,
    media: 'image',
    source: 'cloud',
  });
}
const out = path.join(appDir, 'public', 'video-catalog.json');
fs.writeFileSync(out, JSON.stringify(memes, null, 1));
const emo = {};
for (const m of memes) emo[`${m.media}:${m.emotion}`] = (emo[`${m.media}:${m.emotion}`] || 0) + 1;
console.log(`[video-catalog] wrote ${memes.length} entries (${videoFiles.length} video + ${imageFiles.length} image) -> public/video-catalog.json`);
console.log('[video-catalog] breakdown:', JSON.stringify(emo));
