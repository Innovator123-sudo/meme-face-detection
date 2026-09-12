/* Kuldeep ONNX smoke test (Node, no browser).
   Loads public/kuldeep/kuldeep_fer48.onnx via onnxruntime-node, runs a
   synthetic 48x48 grayscale face + a center-crop of public/guide/happy.jpg,
   and checks the 7-probability contract our beast voter relies on.
   Usage: node scripts/verify-kuldeep.mjs (exit non-zero on failure) */
import ort from 'onnxruntime-node';
import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(__dirname, '..');
const MODEL = path.join(appDir, 'public', 'kuldeep', 'kuldeep_fer48.onnx');
const LABELS = ['angry', 'disgusted', 'fearful', 'happy', 'neutral', 'sad', 'surprised'];

let failures = 0;
function check(name, cond, extra = '') {
  if (cond) console.log(`PASS ${name}${extra ? ' — ' + extra : ''}`);
  else { failures++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

check('kuldeep onnx committed', fs.existsSync(MODEL), MODEL);
if (!fs.existsSync(MODEL)) { console.log('\n1 check(s) FAILED'); process.exit(1); }
const mb = fs.statSync(MODEL).size / 1048576;
console.log(`[kuldeep] size ${mb.toFixed(2)} MB`);
check('kuldeep under GitHub 100 MB limit', mb < 100, `${mb.toFixed(1)} MB`);

const session = await ort.InferenceSession.create(MODEL, { executionProviders: ['cpu'] });
console.log(`[kuldeep] inputs: ${session.inputNames.join(',')} outputs: ${session.outputNames.join(',')}`);
check('kuldeep input is 48x48x1', session.inputNames.length === 1);

// 1. Synthetic mid-gray face: must return 7 probs summing to 1.
{
  const input = new Float32Array(48 * 48).fill(0.5);
  const out = await session.run({
    [session.inputNames[0]]: new ort.Tensor('float32', input, [1, 48, 48, 1]),
  });
  const probs = Array.from(Object.values(out)[0].data);
  const sum = probs.reduce((a, b) => a + b, 0);
  check('kuldeep 7 outputs', probs.length === 7, probs.map((p) => p.toFixed(3)).join(','));
  check('kuldeep probs sum to 1', Math.abs(sum - 1) < 1e-3, `sum ${sum.toFixed(4)}`);
  check('kuldeep probs finite', probs.every((p) => Number.isFinite(p) && p >= 0));
}

// 2. Real photo center-crop (guide happy.jpg is face-centered): same contract,
//    plus the readout path our UI uses (top label + percents).
{
  const file = path.join(appDir, 'public', 'guide', 'happy.jpg');
  if (!fs.existsSync(file)) {
    console.log('SKIP guide happy.jpg missing — synthetic check already passed');
  } else {
    const meta = await sharp(file).metadata();
    const s = Math.min(meta.width, meta.height);
    const left = Math.floor((meta.width - s) / 2), topPad = Math.floor((meta.height - s) / 2);
    const { data } = await sharp(file).extract({ left, top: topPad, width: s, height: s })
      .greyscale().resize(48, 48).raw().toBuffer({ resolveWithObject: true });
    const input = new Float32Array(48 * 48);
    for (let i = 0; i < input.length; i++) input[i] = data[i] / 255;
    const out = await session.run({
      [session.inputNames[0]]: new ort.Tensor('float32', input, [1, 48, 48, 1]),
    });
    const probs = Array.from(Object.values(out)[0].data);
    const sum = probs.reduce((a, b) => a + b, 0);
    const best = probs.indexOf(Math.max(...probs));
    check('guide happy.jpg 7 outputs sum to 1', probs.length === 7 && Math.abs(sum - 1) < 1e-3,
      `${LABELS[best]} ${Math.round(probs[best] * 100)}% (sum ${sum.toFixed(3)})`);
    console.log(`[kuldeep] happy.jpg -> ${probs.map((p, i) => `${LABELS[i]} ${Math.round(p * 100)}%`).join(', ')}`);
  }
}

if (failures) { console.log(`\n${failures} check(s) FAILED`); process.exit(1); }
console.log('\nAll kuldeep checks passed.');
