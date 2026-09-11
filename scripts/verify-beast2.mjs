/* Full beast-pipeline test: YuNet face detect -> square crop -> RMN classify.
   Mirrors the browser path (our boxes play YuNet's role there).
   Usage: node scripts/verify-beast2.mjs */
import ort from 'onnxruntime-node';
import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(__dirname, '..');
const YUNET = 'C:\\Users\\Samrat\\AppData\\Local\\Temp\\opencode\\yunet.onnx';
const EMOTIONS = ['angry', 'disgusted', 'fearful', 'happy', 'sad', 'surprised', 'neutral'];
const DET_SIZE = 640;

const yunet = await ort.InferenceSession.create(YUNET, { executionProviders: ['cpu'] });
const rmn = await ort.InferenceSession.create(
  path.join(appDir, 'public', 'rmn', 'resmasking_int8.onnx'), { executionProviders: ['cpu'] }
);
console.log('[yunet] out:', yunet.outputNames.join(','));

function nms(boxes, scores, thr) {
  const order = scores.map((_, i) => i).sort((a, b) => scores[b] - scores[a]);
  const keep = [];
  while (order.length) {
    const cur = order.shift();
    keep.push(cur);
    const [ax, ay, aw, ah] = boxes[cur];
    for (let i = order.length - 1; i >= 0; i--) {
      const [bx, by, bw, bh] = boxes[order[i]];
      const iw = Math.max(0, Math.min(ax + aw, bx + bw) - Math.max(ax, bx));
      const ih = Math.max(0, Math.min(ay + ah, by + bh) - Math.max(ay, by));
      const inter = iw * ih;
      if (inter / (aw * ah + bw * bh - inter) > thr) order.splice(i, 1);
    }
  }
  return keep;
}

async function detectLargestFace(file) {
  const meta = await sharp(file).metadata();
  const scale = Math.min(DET_SIZE / meta.width, DET_SIZE / meta.height);
  const nw = Math.round(meta.width * scale), nh = Math.round(meta.height * scale);
  const { data } = await sharp(file).resize(nw, nh)
    .extend({ top: 0, left: 0, bottom: DET_SIZE - nh, right: DET_SIZE - nw, background: { r: 0, g: 0, b: 0 } })
    .raw().toBuffer({ resolveWithObject: true });
  const plane = DET_SIZE * DET_SIZE;
  const input = new Float32Array(3 * plane);
  for (let i = 0, p = 0; i < plane; i++, p += 3) {
    input[i] = data[p]; input[plane + i] = data[p + 1]; input[2 * plane + i] = data[p + 2];
  }
  const out = await yunet.run({ [yunet.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, DET_SIZE, DET_SIZE]) });
  const boxes = [], scores = [];
  for (const stride of [8, 16, 32]) {
    const cls = out[`cls_${stride}`].data, obj = out[`obj_${stride}`].data, bbox = out[`bbox_${stride}`].data;
    const cols = DET_SIZE / stride;
    for (let i = 0; i < cls.length; i++) {
      const s = Math.sqrt(Math.min(Math.max(cls[i], 0), 1) * Math.min(Math.max(obj[i], 0), 1));
      if (s < 0.35) continue;
      const col = i % cols, row = Math.floor(i / cols);
      const cx = (col + bbox[i * 4]) * stride, cy = (row + bbox[i * 4 + 1]) * stride;
      const w = Math.exp(bbox[i * 4 + 2]) * stride, h = Math.exp(bbox[i * 4 + 3]) * stride;
      boxes.push([cx - w / 2, cy - h / 2, w, h]);
      scores.push(s);
    }
  }
  const kept = nms(boxes, scores, 0.3).map((i) => ({ box: boxes[i], score: scores[i] }));
  kept.sort((a, b) => (b.box[2] * b.box[3]) - (a.box[2] * a.box[3]));
  const f = kept[0];
  if (!f) return null;
  // back to original-image pixels
  const [x, y, w, h] = f.box;
  return { x: x / scale, y: y / scale, width: w / scale, height: h / scale, score: f.score };
}

async function classifyCrop(file, box) {
  const cx = Math.floor((box.x + box.x + box.width) / 2);
  const cy = Math.floor((box.y + box.y + box.height) / 2);
  let len = Math.floor(Math.floor((box.width + box.height) / 2) / 2) * 1.1;
  const sq = { x: Math.trunc(cx - len), y: Math.trunc(cy - len), s: Math.trunc(len * 2) };
  const meta = await sharp(file).metadata();
  const x0 = Math.max(0, sq.x), y0 = Math.max(0, sq.y);
  const x1 = Math.min(meta.width, sq.x + sq.s), y1 = Math.min(meta.height, sq.y + sq.s);
  const { data } = await sharp(file).extract({ left: Math.round(x0), top: Math.round(y0), width: Math.round(x1 - x0), height: Math.round(y1 - y0) })
    .greyscale().resize(224, 224).raw().toBuffer({ resolveWithObject: true });
  const pl = 224 * 224;
  const input = new Float32Array(3 * pl);
  for (let i = 0; i < pl; i++) {
    const v = data[i] / 255;
    input[i] = v; input[pl + i] = v; input[2 * pl + i] = v;
  }
  const out = await rmn.run({ [rmn.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, 224, 224]) });
  const logits = Array.from(out[rmn.outputNames[0]].data);
  const m = Math.max(...logits);
  const exps = logits.map((v) => Math.exp(v - m));
  const s = exps.reduce((a, b) => a + b, 0);
  return exps.map((v) => v / s);
}

for (const emotion of EMOTIONS) {
  const file = path.join(appDir, 'public', 'guide', `${emotion}.jpg`);
  const face = await detectLargestFace(file);
  if (!face) { console.log(`MISS ${emotion.padEnd(10)} no face detected`); continue; }
  const probs = await classifyCrop(file, face);
  const top3 = probs.map((p, i) => [EMOTIONS[i], p]).sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([k, p]) => `${k} ${Math.round(p * 100)}%`).join(', ');
  const best = probs.indexOf(Math.max(...probs));
  console.log(`${EMOTIONS[best] === emotion ? 'OK  ' : 'DIFF'} ${emotion.padEnd(10)} (face ${Math.round(face.score * 100)}%) -> ${top3}`);
}
