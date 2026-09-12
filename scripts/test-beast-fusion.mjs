/* Beast fusion regression test: the sad-corroboration rule (pure voters, no
   browser). Neural ONNX voters fail offline in Node and are skipped, so these
   cases exercise FER + GEO fusion exactly as the app does when RMN/Kuldeep
   are still warming up. Usage: node scripts/test-beast-fusion.mjs */
import { beastFuse } from '../src/lib/beast.js';

let failures = 0;
function check(name, cond, extra = '') {
  if (cond) console.log(`PASS ${name}${extra ? ' — ' + extra : ''}`);
  else { failures++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

// Synthetic grief-face: downturned mouth + AU1 brow raise + lid droop.
function sadLandmarks() {
  const lm = Array.from({ length: 68 }, () => ({ x: 100, y: 100 }));
  lm[36] = { x: 70, y: 100 }; lm[39] = { x: 90, y: 100 };
  lm[37] = { x: 75, y: 98.3 }; lm[41] = { x: 75, y: 101.7 };
  lm[38] = { x: 85, y: 98.3 }; lm[40] = { x: 85, y: 101.7 };
  lm[42] = { x: 110, y: 100 }; lm[45] = { x: 130, y: 100 };
  lm[43] = { x: 115, y: 98.3 }; lm[47] = { x: 115, y: 101.7 };
  lm[44] = { x: 125, y: 98.3 }; lm[46] = { x: 125, y: 101.7 };
  lm[17] = { x: 66, y: 90 }; lm[21] = { x: 86, y: 86 };
  lm[22] = { x: 114, y: 86 }; lm[25] = { x: 134, y: 90 };
  lm[19] = { x: 76, y: 88 }; lm[24] = { x: 124, y: 88 };
  lm[48] = { x: 80, y: 122 }; lm[54] = { x: 120, y: 122 };
  lm[51] = { x: 100, y: 118 }; lm[57] = { x: 100, y: 122 };
  lm[60] = { x: 84, y: 120 }; lm[64] = { x: 116, y: 120 };
  lm[61] = { x: 90, y: 119.5 }; lm[67] = { x: 90, y: 120.5 };
  lm[62] = { x: 100, y: 119.5 }; lm[66] = { x: 100, y: 120.5 };
  lm[63] = { x: 110, y: 119.5 }; lm[65] = { x: 110, y: 120.5 };
  return lm;
}

// Strong-neutral FER read with a weak sad undercurrent (the webcam sad miss).
const FLAT_FER = { neutral: 0.78, sad: 0.18, happy: 0.01, angry: 0.01, fearful: 0.01, disgusted: 0.005, surprised: 0.005 };
const BOX = { x: 60, y: 60, width: 80, height: 100 };

// 1. Corroborated: geometry strongly sad + FER senses sad -> boost fires, reads sad.
{
  const r = await beastFuse({ frameCanvas: null, box: BOX, ferProbs: FLAT_FER, landmarks: sadLandmarks() });
  check('corroborated sad boosts', r.sadBoosted === true);
  check('corroborated sad reads sad', r.dominant === 'sad', `got ${r.dominant} ${Math.round(r.confidence * 100)}%`);
  check('neural voters skipped offline', r.rmnUsed === false && r.kuldeepUsed === false);
}
// 2. No landmarks: geometry absent -> no boost, strong neutral stands.
{
  const r = await beastFuse({ frameCanvas: null, box: BOX, ferProbs: FLAT_FER, landmarks: null });
  check('no boost without geometry', r.sadBoosted === false);
  check('strong neutral stands alone', r.dominant === 'neutral', `got ${r.dominant}`);
}
// 3. Short mesh: geometry guard (<68 points) -> no boost, neutral stands.
{
  const r = await beastFuse({ frameCanvas: null, box: BOX, ferProbs: FLAT_FER, landmarks: sadLandmarks().slice(0, 10) });
  check('no boost on short mesh', r.sadBoosted === false && r.dominant === 'neutral', `got ${r.dominant}`);
}
// 4. Geometry alone must not fire: FER barely sad -> no boost flag.
{
  const faint = { ...FLAT_FER, neutral: 0.86, sad: 0.10 };
  const r = await beastFuse({ frameCanvas: null, box: BOX, ferProbs: faint, landmarks: sadLandmarks() });
  check('no boost on faint neural sad', r.sadBoosted === false);
}

if (failures) { console.log(`\n${failures} check(s) FAILED`); process.exit(1); }
console.log('\nAll beast-fusion checks passed.');
