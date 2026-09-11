/* Beast smoke test: runs the shipped RMN INT8 ONNX over the 7 guide photos
   with onnxruntime-node and prints the predicted mood per photo.
   Usage: npm run verify:beast */
import ort from 'onnxruntime-node';
import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(__dirname, '..');
const EMOTIONS = ['angry', 'disgusted', 'fearful', 'happy', 'sad', 'surprised', 'neutral'];

const session = await ort.InferenceSession.create(
  path.join(appDir, 'public', 'rmn', 'resmasking_int8.onnx'),
  { executionProviders: ['cpu'] }
);
console.log('[beast-test] session loaded. inputs:', session.inputNames, 'outputs:', session.outputNames);

for (const emotion of EMOTIONS) {
  const file = path.join(appDir, 'public', 'guide', `${emotion}.jpg`);
  // grayscale 224x224, /255, 3 identical planes, NCHW — mirrors the browser path
  const raw = await sharp(file).greyscale().resize(224, 224).raw().toBuffer({ resolveWithObject: true });
  const plane = 224 * 224;
  const input = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    const v = raw.data[i] / 255;
    input[i] = v;
    input[plane + i] = v;
    input[2 * plane + i] = v;
  }
  const feeds = { [session.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, 224, 224]) };
  const out = await session.run(feeds);
  const logits = Array.from(out[session.outputNames[0]].data);
  const max = Math.max(...logits);
  const exps = logits.map((v) => Math.exp(v - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  const probs = exps.map((v) => v / sum);
  const best = probs.indexOf(Math.max(...probs));
  const top3 = probs.map((p, i) => [EMOTIONS[i], p]).sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([k, p]) => `${k} ${Math.round(p * 100)}%`).join(', ');
  const mark = EMOTIONS[best] === emotion ? 'OK  ' : 'DIFF';
  console.log(`${mark} ${emotion.padEnd(10)} -> ${top3}`);
}
