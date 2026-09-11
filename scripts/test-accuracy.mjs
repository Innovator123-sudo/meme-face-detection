/* Accuracy regression test for the sad-detection fix (pure logic, no browser).
   Usage: node scripts/test-accuracy.mjs (exit non-zero on failure) */
import { summarizeExpressions, lockDominant, holdThreshold, fuseLiveExpressions, averageExpressions, blendStillWithPriors } from '../src/lib/expressionLogic.js';
import { geometricVote } from '../src/lib/geoVoter.js';

let failures = 0;
function check(name, cond, extra = '') {
  if (cond) console.log(`PASS ${name}${extra ? ' — ' + extra : ''}`);
  else { failures++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

// 1. Classic webcam sad miss: neutral 0.45 / sad 0.30 must now read sad.
{
  const r = summarizeExpressions({ neutral: 0.45, sad: 0.3, happy: 0.05, angry: 0.05, fearful: 0.05, disgusted: 0.05, surprised: 0.05 });
  check('classic sad miss rescued', r.dominant === 'sad', `got ${r.dominant} ${Math.round(r.confidence * 100)}%`);
}
// 2. Subtle sad at 0.22 still promotes over weak neutral.
{
  const r = summarizeExpressions({ neutral: 0.42, sad: 0.22, happy: 0.08, angry: 0.08, fearful: 0.08, disgusted: 0.06, surprised: 0.06 });
  check('subtle sad promoted', r.dominant === 'sad', `got ${r.dominant}`);
}
// 3. Sad vs fearful confusion: fearful 0.34 / sad 0.28 → sad rescued (within margin).
{
  const r = summarizeExpressions({ fearful: 0.34, sad: 0.28, neutral: 0.2, happy: 0.05, angry: 0.05, disgusted: 0.04, surprised: 0.04 });
  check('sad rescued from fearful', r.dominant === 'sad', `got ${r.dominant}`);
}
// 4. Clear happy must stay happy (no sad over-trigger).
{
  const r = summarizeExpressions({ happy: 0.6, neutral: 0.2, sad: 0.05, angry: 0.03, fearful: 0.04, disgusted: 0.03, surprised: 0.05 });
  check('clear happy untouched', r.dominant === 'happy', `got ${r.dominant}`);
}
// 5. Strong neutral must stay neutral.
{
  const r = summarizeExpressions({ neutral: 0.7, happy: 0.08, sad: 0.07, angry: 0.04, fearful: 0.04, disgusted: 0.03, surprised: 0.04 });
  check('strong neutral untouched', r.dominant === 'neutral', `got ${r.dominant}`);
}
// 6. Anti-flicker must not swallow sad onset from neutral.
{
  const faces = [{ dominant: 'sad', confidence: 0.32, secondaryScore: 0.3, expressions: { sad: 0.32, neutral: 0.3 } }];
  const out = lockDominant(faces, 'neutral');
  check('neutral lock releases sad', out[0].dominant === 'sad', `got ${out[0].dominant}`);
}
// 7. Hold thresholds let sad freeze earlier than grins.
{
  check('sad hold threshold 0.22', holdThreshold('sad') === 0.22);
  check('happy hold threshold 0.30', holdThreshold('happy') === 0.3);
}
// 8. Still blend weights the accurate read above priors (no dilution).
{
  const still = { neutral: 0.2, sad: 0.55, happy: 0.05, angry: 0.05, fearful: 0.05, disgusted: 0.05, surprised: 0.05 };
  const prior = { neutral: 0.6, sad: 0.1, happy: 0.1, angry: 0.05, fearful: 0.05, disgusted: 0.05, surprised: 0.05 };
  const b = blendStillWithPriors(still, [prior, prior, prior, prior]);
  check('still outweighs stale priors', summarizeExpressions(b).dominant === 'sad', `blended sad ${b.sad.toFixed(2)} vs neutral ${b.neutral.toFixed(2)} → ${summarizeExpressions(b).dominant}`);
  const a = averageExpressions([still, prior]);
  check('average helper still works', Math.abs(a.sad - 0.325) < 1e-9);
}
// 9. Geo voter: synthetic frown (downturned corners + grief brow + droop)
//    must rank sad above happy/neutral-leaning, with normalized output.
function sadLandmarks() {
  const lm = Array.from({ length: 68 }, () => ({ x: 100, y: 100 }));
  // eyes: slightly narrow (droop) — width 20, height ~3.4 (EAR ~0.17)
  lm[36] = { x: 70, y: 100 }; lm[39] = { x: 90, y: 100 };
  lm[37] = { x: 75, y: 98.3 }; lm[41] = { x: 75, y: 101.7 };
  lm[38] = { x: 85, y: 98.3 }; lm[40] = { x: 85, y: 101.7 };
  lm[42] = { x: 110, y: 100 }; lm[45] = { x: 130, y: 100 };
  lm[43] = { x: 115, y: 98.3 }; lm[47] = { x: 115, y: 101.7 };
  lm[44] = { x: 125, y: 98.3 }; lm[46] = { x: 125, y: 101.7 };
  // brows: inner raised (AU1) — inner y 86 vs outer 90
  lm[17] = { x: 66, y: 90 }; lm[21] = { x: 86, y: 86 };
  lm[22] = { x: 114, y: 86 }; lm[25] = { x: 134, y: 90 };
  lm[19] = { x: 76, y: 88 }; lm[24] = { x: 124, y: 88 };
  // mouth: corners downturned (corners y 122, mid y 118 → smile < 0), closed
  lm[48] = { x: 80, y: 122 }; lm[54] = { x: 120, y: 122 };
  lm[51] = { x: 100, y: 118 }; lm[57] = { x: 100, y: 122 };
  lm[60] = { x: 84, y: 120 }; lm[64] = { x: 116, y: 120 };
  lm[61] = { x: 90, y: 119.5 }; lm[67] = { x: 90, y: 120.5 };
  lm[62] = { x: 100, y: 119.5 }; lm[66] = { x: 100, y: 120.5 };
  lm[63] = { x: 110, y: 119.5 }; lm[65] = { x: 110, y: 120.5 };
  return lm;
}
{
  const v = geometricVote(sadLandmarks(), 80, 100);
  const sum = Object.values(v).reduce((a, b) => a + b, 0);
  check('geo output normalized', Math.abs(sum - 1) < 1e-9, `sum ${sum.toFixed(4)}`);
  check('geo frown votes sad over happy', v.sad > v.happy, `sad ${v.sad.toFixed(2)} happy ${v.happy.toFixed(2)}`);
  check('geo frown sad is meaningful', v.sad > 0.18, `sad ${v.sad.toFixed(2)}`);
}
// 10. Live fusion blends FER+GEO without crashing on missing landmarks.
{
  const fer = { neutral: 0.4, sad: 0.3, happy: 0.1, angry: 0.05, fearful: 0.05, disgusted: 0.05, surprised: 0.05 };
  const fused = fuseLiveExpressions(fer, sadLandmarks(), { width: 80, height: 100 });
  check('live fusion keeps sad competitive', fused.sad > 0.2, `sad ${fused.sad.toFixed(2)}`);
  const passthrough = fuseLiveExpressions(fer, [], null);
  check('live fusion passthrough safe', passthrough.sad === fer.sad);
}

if (failures) { console.log(`\n${failures} check(s) FAILED`); process.exit(1); }
console.log('\nAll accuracy checks passed.');
