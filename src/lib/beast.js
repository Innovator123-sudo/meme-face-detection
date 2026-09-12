/* The Beast: a 4-voter late-fusion ensemble for one frozen face.
   - RMN ResMaskingNet ONNX (phamquiluan, ICPR 2020) ......... weight 0.38
   - Kuldeep FER CNN 48x48 (kuldeepstechwork, FER2013) ....... weight 0.24
   - FER classifier (face-api, calibrated live reading) ..... weight 0.22
   - Geometric landmark voter (amineHorseman-style) ......... weight 0.16
   Kuldeep is the small committed ONNX (~5 MB, loads fast/offline) while RMN
   stays the strongest voter when its 139 MB weights are warm. Missing voters
   are skipped and the rest renormalize, so the app never breaks offline. */

import { summarizeExpressions, EXPRESSIONS } from './expressionLogic.js';
import { ensureRmn, rmnClassify } from './rmnBeast.js';
import { ensureKuldeep, kuldeepClassify } from './kuldeepBeast.js';
import { geometricVote } from './geoVoter.js';

const WEIGHTS = { rmn: 0.38, kuldeep: 0.24, fer: 0.22, geo: 0.16 };

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
  } catch { /* RMN offline — others carry the read */ }

  let kuldeepUsed = false;
  try {
    await ensureKuldeep();
    const kuldeep = await kuldeepClassify(frameCanvas, box);
    if (kuldeep) {
      voters.kuldeep = kuldeep;
      kuldeepUsed = true;
    }
  } catch { /* Kuldeep offline — FER + GEO + RMN carry the read */ }

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
    kuldeepUsed,
  };
}

/** One-line voter readout for the UI, e.g. "RMN happy 71% · KUL happy 64% · FER happy 60% · GEO sad". */
export function describeVoters(voters) {
  if (!voters) return '';
  const names = { rmn: 'RMN', kuldeep: 'KUL', fer: 'FER', geo: 'GEO' };
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
