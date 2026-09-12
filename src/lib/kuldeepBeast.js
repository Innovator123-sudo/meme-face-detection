/* Kuldeep FER CNN (kuldeepstechwork/Face-Expression-Recognition-using-Deep-Learning)
   running locally via onnxruntime-web. Converted from the original model.h5
   (Keras, 48x48 grayscale, 1.3M params) to ONNX opset 13 — see
   public/kuldeep/README.md for the conversion command.
   Preprocessing mirrors main.py exactly: tight face-box crop, bilinear resize
   to 48x48, /255 scaling, 1x48x48x1 float32 (NHWC, single channel). */

import { assetUrl } from './siteBase.js';

const MODEL_URL = assetUrl('kuldeep/kuldeep_fer48.onnx');
const FACE_SIZE = 48;

// ONNX output order -> our expression keys.
// Original emotion_labels = ['Angry','Disgust','Fear','Happy','Neutral','Sad','Surprise']
const KULDEEP_LABELS = ['angry', 'disgusted', 'fearful', 'happy', 'neutral', 'sad', 'surprised'];

const status = { state: 'idle', progress: 0, error: '' };
const listeners = new Set();

function emit() {
  for (const fn of listeners) {
    try { fn({ ...status }); } catch { /* ignore listener errors */ }
  }
}

export function subscribeKuldeepStatus(fn) {
  listeners.add(fn);
  fn({ ...status });
  return () => listeners.delete(fn);
}

export function kuldeepStatus() {
  return { ...status };
}

export function kuldeepReady() {
  return status.state === 'ready';
}

let ortModule = null;
let sessionPromise = null;

async function fetchModelBytes() {
  // Cache Storage keeps the ~5 MB download local after the first visit
  try {
    const cache = await caches.open('kuldeep-beast-v1');
    const hit = await cache.match(MODEL_URL);
    if (hit) {
      status.progress = 1;
      emit();
      return hit.arrayBuffer();
    }
    const res = await fetch(MODEL_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${MODEL_URL}`);
    const total = Number(res.headers.get('content-length')) || 0;
    const reader = res.body.getReader();
    const chunks = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      if (total) {
        status.progress = received / total;
        emit();
      }
    }
    const buffer = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      buffer.set(chunk, offset);
      offset += chunk.length;
    }
    try { await cache.put(MODEL_URL, new Response(buffer.slice())); } catch { /* private mode */ }
    return buffer.buffer;
  } catch (e) {
    // No Cache API (or any cache failure) — plain download
    const res = await fetch(MODEL_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${MODEL_URL}`);
    return res.arrayBuffer();
  }
}

/** Load the Kuldeep session (cached). Resolves null only via throw — callers catch. */
export function ensureKuldeep() {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      status.state = 'loading';
      status.progress = 0;
      status.error = '';
      emit();
      try {
        ortModule = await import('onnxruntime-web');
        ortModule.env.wasm.wasmPaths = assetUrl('ort/');
        ortModule.env.wasm.numThreads = 1;
        ortModule.env.wasm.simd = true;
        const bytes = await fetchModelBytes();
        status.progress = 1;
        emit();
        const session = await ortModule.InferenceSession.create(bytes, {
          executionProviders: ['wasm'],
        });
        status.state = 'ready';
        emit();
        return session;
      } catch (e) {
        status.state = 'error';
        status.error = e?.message || 'Kuldeep load failed';
        emit();
        sessionPromise = null;
        throw e;
      }
    })();
  }
  return sessionPromise;
}

function toGrayscale(rgba, width, height) {
  const gray = new Float32Array(width * height);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    gray[i] = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2];
  }
  return gray;
}

function resizeBilinear(src, srcW, srcH, dstW, dstH) {
  const dst = new Float32Array(dstW * dstH);
  const scaleX = srcW / dstW;
  const scaleY = srcH / dstH;
  for (let y = 0; y < dstH; y++) {
    let fy = (y + 0.5) * scaleY - 0.5;
    if (fy < 0) fy = 0;
    const y0 = Math.min(Math.floor(fy), srcH - 1);
    const y1 = Math.min(y0 + 1, srcH - 1);
    const wy = fy - y0;
    for (let x = 0; x < dstW; x++) {
      let fx = (x + 0.5) * scaleX - 0.5;
      if (fx < 0) fx = 0;
      const x0 = Math.min(Math.floor(fx), srcW - 1);
      const x1 = Math.min(x0 + 1, srcW - 1);
      const wx = fx - x0;
      const top = src[y0 * srcW + x0] * (1 - wx) + src[y0 * srcW + x1] * wx;
      const bottom = src[y1 * srcW + x0] * (1 - wx) + src[y1 * srcW + x1] * wx;
      dst[y * dstW + x] = top * (1 - wy) + bottom * wy;
    }
  }
  return dst;
}

/**
 * Classify one face. `frameCanvas` is the full source frame, `box` the face
 * rectangle in frame pixels (tight box, same convention as main.py).
 * Returns our 7-key probability object, or throws.
 */
export async function kuldeepClassify(frameCanvas, box) {
  const session = await ensureKuldeep();
  const W = frameCanvas.width, H = frameCanvas.height;
  const ctx = frameCanvas.getContext('2d', { willReadFrequently: true });
  const { data } = ctx.getImageData(0, 0, W, H);
  const gray = toGrayscale(data, W, H);

  // Tight crop (mirrors main.py: roi_gray = gray[y:y+h, x:x+w]), clamped.
  const x0 = Math.max(0, Math.floor(box.x));
  const y0 = Math.max(0, Math.floor(box.y));
  const x1 = Math.min(W, Math.ceil(box.x + box.width));
  const y1 = Math.min(H, Math.ceil(box.y + box.height));
  const cropW = x1 - x0, cropH = y1 - y0;
  if (cropW < 10 || cropH < 10) throw new Error('Kuldeep crop too small');

  const crop = new Float32Array(cropW * cropH);
  for (let y = 0; y < cropH; y++) {
    for (let x = 0; x < cropW; x++) {
      crop[y * cropW + x] = gray[(y0 + y) * W + (x0 + x)];
    }
  }
  const resized = resizeBilinear(crop, cropW, cropH, FACE_SIZE, FACE_SIZE);
  const input = new Float32Array(FACE_SIZE * FACE_SIZE);
  for (let i = 0; i < input.length; i++) input[i] = resized[i] / 255;
  const inputName = session.inputNames?.[0] || 'input';
  const outputs = await session.run({
    [inputName]: new ortModule.Tensor('float32', input, [1, FACE_SIZE, FACE_SIZE, 1]),
  });
  const probs = Array.from(Object.values(outputs)[0].data);
  // Model already ends in softmax; normalize defensively.
  const sum = probs.reduce((a, b) => a + b, 0) || 1;
  const out = {};
  for (let i = 0; i < KULDEEP_LABELS.length; i++) out[KULDEEP_LABELS[i]] = (probs[i] ?? 0) / sum;
  return out;
}
