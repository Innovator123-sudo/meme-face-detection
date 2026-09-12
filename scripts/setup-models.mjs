/* Fetch-or-copy large runtime assets so the git repo stays small.
   - public/ort/*.wasm ......... copied from node_modules/onnxruntime-web/dist
   - public/rmn/resmasking_int8.onnx (139 MB, over GitHub's 100 MB limit)
     downloaded once from Hugging Face, skipped when already present.
   - public/kuldeep/kuldeep_fer48.onnx (~5 MB) IS committed to git, verified here.
   The RMN model is OPTIONAL: without it the app still reads faces with
   Kuldeep + FER classifier + geometry voter (beast.js renormalizes weights).
   Usage: node scripts/setup-models.mjs (also runs as `postinstall`). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(__dirname, '..');
const RMN_URL = process.env.RMN_URL || 'https://huggingface.co/phamquiluan/ResidualMaskingNetwork/resolve/main/onnx/resmasking_int8.onnx';
const RMN_DEST = path.join(appDir, 'public', 'rmn', 'resmasking_int8.onnx');
const ORT_FILES = ['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.jsep.wasm'];
const ORT_SRC = path.join(appDir, 'node_modules', 'onnxruntime-web', 'dist');
const ORT_DEST = path.join(appDir, 'public', 'ort');

let failed = false;

// 1. ORT wasm: copy from the installed npm package (byte-identical).
try {
  fs.mkdirSync(ORT_DEST, { recursive: true });
  for (const f of ORT_FILES) {
    const dest = path.join(ORT_DEST, f);
    if (fs.existsSync(dest)) { console.log(`[setup-models] ort keep: ${f}`); continue; }
    const src = path.join(ORT_SRC, f);
    if (!fs.existsSync(src)) { console.log(`[setup-models] WARN ort source missing: ${src}`); failed = true; continue; }
    fs.copyFileSync(src, dest);
    console.log(`[setup-models] ort copied: ${f}`);
  }
} catch (e) {
  console.log(`[setup-models] WARN ort copy failed: ${e?.message || e}`);
  failed = true;
}

// 2. RMN weights: download once, keep forever.
async function ensureRmn() {
  if (fs.existsSync(RMN_DEST)) {
    console.log('[setup-models] rmn keep: resmasking_int8.onnx already present');
    return;
  }
  if (process.env.SKIP_RMN === '1') {
    console.log('[setup-models] SKIP_RMN=1 — skipping 139 MB download (FER+GEO fallback stays active)');
    return;
  }
  console.log(`[setup-models] downloading RMN weights (~139 MB): ${RMN_URL}`);
  fs.mkdirSync(path.dirname(RMN_DEST), { recursive: true });
  const tmp = RMN_DEST + '.part';
  try {
    const res = await fetch(RMN_URL);
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    const total = Number(res.headers.get('content-length')) || 0;
    const file = fs.createWriteStream(tmp);
    let received = 0, lastPct = -1;
    for await (const chunk of res.body) {
      file.write(chunk);
      received += chunk.length;
      if (total) {
        const pct = Math.floor((received / total) * 100);
        if (pct !== lastPct && pct % 10 === 0) { lastPct = pct; console.log(`[setup-models] rmn ${pct}%`); }
      }
    }
    await new Promise((resolve, reject) => { file.end((e) => (e ? reject(e) : resolve())); });
    fs.renameSync(tmp, RMN_DEST);
    console.log(`[setup-models] rmn saved: ${(received / 1048576).toFixed(1)} MB`);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    console.log(`[setup-models] WARN rmn download failed (${e?.message || e}) — app runs without it (FER+GEO fallback)`);
  }
}

await ensureRmn();

// 3. Sanity: face-api weights must be committed in the repo.
const modelsDir = path.join(appDir, 'public', 'models');
const need = ['tiny_face_detector_model.bin', 'ssd_mobilenetv1_model.bin', 'face_expression_model.bin'];
const missing = need.filter((f) => !fs.existsSync(path.join(modelsDir, f)));
if (missing.length) {
  console.log(`[setup-models] WARN face-api weights missing: ${missing.join(', ')}`);
  failed = true;
} else {
  console.log('[setup-models] face-api weights ok');
}

// 4. Kuldeep FER CNN: small committed ONNX, must exist (no download — it is in git).
const kuldeepPath = path.join(appDir, 'public', 'kuldeep', 'kuldeep_fer48.onnx');
if (!fs.existsSync(kuldeepPath)) {
  console.log('[setup-models] WARN kuldeep ONNX missing: public/kuldeep/kuldeep_fer48.onnx (beast runs without KUL voter)');
  failed = true;
} else {
  const mb = (fs.statSync(kuldeepPath).size / 1048576).toFixed(1);
  console.log(`[setup-models] kuldeep ok: kuldeep_fer48.onnx (${mb} MB, committed)`);
}
if (failed) console.log('[setup-models] done with warnings (non-fatal)');
else console.log('[setup-models] done');
