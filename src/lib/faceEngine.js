import * as faceapi from '@vladmandic/face-api';
import '@tensorflow/tfjs-backend-webgl';
import * as tf from '@tensorflow/tfjs';

// Pure decision logic lives here so Node tests can import it without TF.js.
export {
  EXPRESSIONS,
  calibrateExpressions,
  lockDominant,
  averageExpressions,
  blendStillWithPriors,
  summarizeExpressions,
  fuseLiveExpressions,
  holdThreshold,
} from './expressionLogic.js';
import {
  summarizeExpressions,
  fuseLiveExpressions,
  blendStillWithPriors,
} from './expressionLogic.js';
import { assetUrl } from './siteBase.js';

let modelsReady = false;
let loadPromise = null;

/** Cheap signal check on the live frame: distance + lighting. Guides the user, not the model. */
export function assessFrameQuality(video, box) {
  try {
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !box) return { level: 'unknown', hint: '' };
    const faceRatio = (box.width * box.height) / (vw * vh);
    if (faceRatio < 0.02) return { level: 'far', hint: 'Too far — move closer' };
    const w = 24, h = 24;
    const c = assessFrameQuality._c || (assessFrameQuality._c = document.createElement('canvas'));
    c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    const sx = Math.max(0, box.x), sy = Math.max(0, box.y);
    const sw = Math.min(box.width, vw - sx), sh = Math.min(box.height, vh - sy);
    if (sw < 4 || sh < 4) return { level: 'unknown', hint: '' };
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    let lum = 0;
    for (let i = 0; i < d.length; i += 4) lum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    lum /= (w * h * 255);
    if (lum < 0.18) return { level: 'dark', hint: 'Low light — face the light' };
    if (lum > 0.92) return { level: 'bright', hint: 'Too bright — ease off the glare' };
    return { level: 'good', hint: 'Signal good' };
  } catch {
    return { level: 'unknown', hint: '' };
  }
}

export async function loadModels(onProgress) {
  if (modelsReady) return true;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      onProgress?.('Preparing compute backend…');
      try {
        await tf.setBackend('webgl');
      } catch {
        await tf.setBackend('cpu');
      }
      await tf.ready();
    } catch {
      // non-fatal, face-api will pick a backend
    }
    const MODEL_URLS = [assetUrl('models'), 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model'];
    const steps = [
      ['fast face detector (live)', (base) => faceapi.nets.tinyFaceDetector.loadFromUri(base)],
      ['accurate face detector (stills)', (base) => faceapi.nets.ssdMobilenetv1.loadFromUri(base)],
      ['facial landmarks', (base) => faceapi.nets.faceLandmark68Net.loadFromUri(base)],
      // FER-trained expression classifier (open-source weights via @vladmandic/face-api on GitHub)
      ['expression classifier', (base) => faceapi.nets.faceExpressionNet.loadFromUri(base)],
      ['age and gender estimator', (base) => faceapi.nets.ageGenderNet.loadFromUri(base)],
    ];
    let lastError = null;
    for (const base of MODEL_URLS) {
      try {
        for (let i = 0; i < steps.length; i++) {
          onProgress?.(`Loading AI model ${i + 1}/${steps.length}: ${steps[i][0]}…`);
          await steps[i][1](base);
        }
        modelsReady = true;
        onProgress?.('AI ready');
        return true;
      } catch (e) {
        lastError = e;
        // fall through to the next mirror
      }
    }
    throw new Error(`Could not load face AI weights (${lastError?.message || 'fetch failed'}). Check your connection and reload.`);
  })();
  return loadPromise;
}

export function isReady() {
  return modelsReady;
}

/** Detect all faces in an image or video element. Returns normalized results. */
export async function detectFaces(sourceEl, { liveFuseGeo = true } = {}) {  if (!modelsReady) throw new Error('AI models are still loading.');
  const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.3 });
  const raw = await faceapi
    .detectAllFaces(sourceEl, options)
    .withFaceLandmarks()
    .withFaceExpressions()
    .withAgeAndGender();
  const ranked = [...raw].sort((a, b) => {
    const aa = a.detection.box.width * a.detection.box.height;
    const bb = b.detection.box.width * b.detection.box.height;
    return bb - aa;
  });
  return ranked.map((r, i) => {
    const pts = r.landmarks?.positions?.map((p) => ({ x: p.x, y: p.y })) ?? [];
    const box = { x: r.detection.box.x, y: r.detection.box.y, width: r.detection.box.width, height: r.detection.box.height, score: r.detection.score };
    // Live fusion: geometry sees the frown the FER net misses (no extra cost).
    const fer = liveFuseGeo ? fuseLiveExpressions({ ...r.expressions }, pts, box) : { ...r.expressions };
    const summary = summarizeExpressions(fer);
    return {
      index: i,
      box,
      ...summary,
      age: Math.round(r.age),
      gender: r.gender,
      genderProbability: r.genderProbability,
      landmarks: pts,
    };
  });
}

/** Accurate still-image read: SSD detector + smoothed expressions.
 *  `priorExpressions` are recent live readings blended in to kill single-frame jitter. */
export async function detectStill(imageEl, priorExpressions = []) {
  if (!modelsReady) throw new Error('AI models are still loading.');
  let raw = [];
  try {
    raw = await faceapi
      .detectAllFaces(imageEl, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.35 }))
      .withFaceLandmarks()
      .withFaceExpressions()
      .withAgeAndGender();
  } catch {
    raw = [];
  }
  if (!raw.length) {
    // Fall back to the fast detector rather than failing the capture.
    raw = await faceapi
      .detectAllFaces(imageEl, new faceapi.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.25 }))
      .withFaceLandmarks()
      .withFaceExpressions()
      .withAgeAndGender();
  }
  const ranked = [...raw].sort((a, b) => {
    const aa = a.detection.box.width * a.detection.box.height;
    const bb = b.detection.box.width * b.detection.box.height;
    return bb - aa;
  });
  return ranked.map((r, i) => {
    const blended = blendStillWithPriors({ ...r.expressions }, priorExpressions);
    const summary = summarizeExpressions(blended);
    return {
      index: i,
      box: { x: r.detection.box.x, y: r.detection.box.y, width: r.detection.box.width, height: r.detection.box.height, score: r.detection.score },
      ...summary,
      age: Math.round(r.age),
      gender: r.gender,
      genderProbability: r.genderProbability,
      landmarks: r.landmarks?.positions?.map((p) => ({ x: p.x, y: p.y })) ?? [],
    };
  });
}

/** Draw boxes + landmark dots + labels onto a canvas sized to the source. */
export function drawOverlay(canvas, faces, sourceWidth, sourceHeight) {
  if (!canvas) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(sourceWidth * dpr);
  canvas.height = Math.round(sourceHeight * dpr);
  canvas.style.aspectRatio = `${sourceWidth} / ${sourceHeight}`;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, sourceWidth, sourceHeight);

  faces.forEach((f, i) => {
    const { x, y, width, height } = f.box;
    const isPrimary = i === 0;
    ctx.lineWidth = isPrimary ? 2.5 : 1.5;
    ctx.strokeStyle = isPrimary ? '#0F766E' : '#78716C';
    ctx.fillStyle = isPrimary ? 'rgba(15,118,110,0.08)' : 'rgba(0,0,0,0.04)';
    roundRect(ctx, x, y, width, height, 10);
    ctx.fill();
    ctx.stroke();

    // landmark dots (subsampled for performance)
    ctx.fillStyle = isPrimary ? '#0F766E' : '#A8A29E';
    for (let k = 0; k < f.landmarks.length; k += 2) {
      const p = f.landmarks[k];
      ctx.beginPath();
      ctx.arc(p.x, p.y, isPrimary ? 1.6 : 1.1, 0, Math.PI * 2);
      ctx.fill();
    }

    const label = `${i === 0 ? 'Primary' : 'Face ' + (i + 1)} · ${f.dominant} ${Math.round(f.confidence * 100)}%`;
    ctx.font = '600 13px Inter, system-ui, sans-serif';
    const tw = ctx.measureText(label).width;
    const lx = Math.max(0, Math.min(x, sourceWidth - tw - 18));
    const ly = Math.max(0, y - 30);
    ctx.fillStyle = isPrimary ? '#0F766E' : '#44403C';
    roundRect(ctx, lx, ly, tw + 18, 24, 7);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(label, lx + 9, ly + 16.5);
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
