/* ResidualMaskingNetwork (phamquiluan, ICPR 2020, MIT) running locally via
   onnxruntime-web. Preprocessing mirrors the repo's own browser demo exactly:
   grayscale 0.299/0.587/0.114, 1.1x expanded square box, bilinear resize with
   OpenCV pixel-center mapping, /255 scaling, 224x224x3 NCHW float32. */

const MODEL_URL = '/rmn/resmasking_int8.onnx';
const FACE_SIZE = 224;

// ONNX output order -> our expression keys
const RMN_LABELS = ['angry', 'disgusted', 'fearful', 'happy', 'sad', 'surprised', 'neutral'];

const status = { state: 'idle', progress: 0, error: '' };
const listeners = new Set();

function emit() {
  for (const fn of listeners) {
    try { fn({ ...status }); } catch { /* ignore listener errors */ }
  }
}

export function subscribeRmnStatus(fn) {
  listeners.add(fn);
  fn({ ...status });
  return () => listeners.delete(fn);
}

export function rmnStatus() {
  return { ...status };
}

export function rmnReady() {
  return status.state === 'ready';
}

let ortModule = null;
let sessionPromise = null;

async function fetchModelBytes() {
  // Cache Storage keeps the 139 MB download local after the first visit
  try {
    const cache = await caches.open('rmn-beast-v1');
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

/** Load the RMN session (cached). Resolves null only via throw — callers catch. */
export function ensureRmn() {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      status.state = 'loading';
      status.progress = 0;
      status.error = '';
      emit();
      try {
        ortModule = await import('onnxruntime-web');
        ortModule.env.wasm.wasmPaths = '/ort/';
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
        status.error = e?.message || 'RMN load failed';
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

function convertToSquare(box) {
  const centerX = Math.floor((box.x + box.x + box.width) / 2);
  const centerY = Math.floor((box.y + box.y + box.height) / 2);
  let length = Math.floor(Math.floor((box.width + box.height) / 2) / 2);
  length *= 1.1;
  return {
    xmin: Math.trunc(centerX - length),
    ymin: Math.trunc(centerY - length),
    xmax: Math.trunc(centerX + length),
    ymax: Math.trunc(centerY + length),
  };
}

function softmax(logits) {
  const max = Math.max(...logits);
  const exps = logits.map((v) => Math.exp(v - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((v) => v / sum);
}

/**
 * Classify one face. `frameCanvas` is the full source frame, `box` the face
 * rectangle in frame pixels. Returns our 7-key probability object, or throws.
 */
export async function rmnClassify(frameCanvas, box) {
  const session = await ensureRmn();
  const W = frameCanvas.width, H = frameCanvas.height;
  const ctx = frameCanvas.getContext('2d', { willReadFrequently: true });
  const { data } = ctx.getImageData(0, 0, W, H);
  const gray = toGrayscale(data, W, H);

  const sq = convertToSquare(box);
  const x0 = Math.max(sq.xmin, 0);
  const y0 = Math.max(sq.ymin, 0);
  const x1 = Math.min(sq.xmax, W);
  const y1 = Math.min(sq.ymax, H);
  const cropW = x1 - x0, cropH = y1 - y0;
  if (cropW < 10 || cropH < 10) throw new Error('RMN crop too small');

  const crop = new Float32Array(cropW * cropH);
  for (let y = 0; y < cropH; y++) {
    for (let x = 0; x < cropW; x++) {
      crop[y * cropW + x] = gray[(y0 + y) * W + (x0 + x)];
    }
  }
  const resized = resizeBilinear(crop, cropW, cropH, FACE_SIZE, FACE_SIZE);
  const plane = FACE_SIZE * FACE_SIZE;
  const input = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    const v = resized[i] / 255;
    input[i] = v;
    input[plane + i] = v;
    input[2 * plane + i] = v;
  }
  const outputs = await session.run({
    input: new ortModule.Tensor('float32', input, [1, 3, FACE_SIZE, FACE_SIZE]),
  });
  const logits = Array.from(Object.values(outputs)[0].data);
  const probs = softmax(logits);
  const out = {};
  for (let i = 0; i < RMN_LABELS.length; i++) out[RMN_LABELS[i]] = probs[i] ?? 0;
  return out;
}
