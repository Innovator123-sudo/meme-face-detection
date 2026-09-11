/* The Beast: a 3-voter late-fusion ensemble for one frozen face.
   - RMN ResMaskingNet ONNX (phamquiluan, ICPR 2020) ......... weight 0.46
   - FER classifier (face-api, calibrated live reading) ..... weight 0.32
   - Geometric landmark voter (amineHorseman-style) ......... weight 0.22
   GEO was raised (was 0.15) because it sees frown/grief-brow structure the
   FER net flattens — the main sad-miss fix alongside FER sad-rescue.
   Missing voters are skipped and the rest renormalize, so the app never
   breaks when the 139 MB model is still downloading or offline. */

import { summarizeExpressions, EXPRESSIONS } from './expressionLogic.js';
import { ensureRmn, rmnClassify } from './rmnBeast.js';
import { geometricVote } from './geoVoter.js';

const WEIGHTS = { rmn: 0.46, fer: 0.32, geo: 0.22 };

/**
 * @param {Object} args
 * @param {HTMLCanvasElement} args.frameCanvas full source frame
 * @param {Object} args.box face box in frame pixels {x,y,width,height}
 * @param {Object} args.ferProbs calibrated FER probabilities (our 7 keys)
 * @param {Array} args.landmarks 68 landmark points (same pixel space as box)
 * @returns fused summary (same shape as summarizeExpressions) + voters detail
 */
export async function beastFuse({ frameCanvas, box, ferProbs, landmarks }) {
  const voters = { fer: { ...ferProbs } };

  if (landmarks?.length >= 68 && box?.width > 0) {
    try {
      voters.geo = geometricVote(landmarks, box.width, box.height);
    } catch { /* geo stays out, others renormalize */ }
  }

  let rmnUsed = false;
  try {
    await ensureRmn();
    const rmn = await rmnClassify(frameCanvas, box);
    if (rmn) {
      voters.rmn = rmn;
      rmnUsed = true;
    }
  } catch { /* RMN offline — FER + GEO carry the read */ }

  let wsum = 0;
  for (const name of Object.keys(voters)) wsum += WEIGHTS[name] ?? 0;
  if (wsum <= 0) wsum = 1;

  const probs = {};
  for (const e of EXPRESSIONS) {
    let v = 0;
    for (const [name, p] of Object.entries(voters)) {
      v += (p[e] ?? 0) * ((WEIGHTS[name] ?? 0) / wsum);
    }
    probs[e] = v;
  }

  return {
    ...summarizeExpressions(probs),
    voters,
    rmnUsed,
  };
}

/** One-line voter readout for the UI, e.g. "RMN happy 71% · FER happy 64% · GEO sad". */
export function describeVoters(voters) {
  if (!voters) return '';
  const names = { rmn: 'RMN', fer: 'FER', geo: 'GEO' };
  return Object.entries(voters)
    .map(([name, probs]) => {
      let best = 'neutral', bestV = -1;
      for (const [k, v] of Object.entries(probs)) {
        if (v > bestV) { bestV = v; best = k; }
      }
      return `${names[name] || name} ${best} ${Math.round(bestV * 100)}%`;
    })
    .join(' · ');
}
