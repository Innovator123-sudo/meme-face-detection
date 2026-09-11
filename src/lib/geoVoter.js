/* Geometric landmark voter (amineHorseman-style idea: facial geometry as signal).
   Hand-tuned ratios from the 68-point mesh — deliberately weak (low ensemble
   weight) so it can only nudge, never overrule the two neural nets.
   v2: sad now reads brows + eyelids, not just the mouth, because subtle sad
   is mostly upper-face (inner-brow raise AU1, brow lower AU4, lid droop). */

function dist(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function clamp01(v) {
  return Math.min(1, Math.max(0, v));
}

function avg(points) {
  let x = 0, y = 0;
  for (const p of points) { x += p.x; y += p.y; }
  return { x: x / points.length, y: y / points.length };
}

/**
 * @param {Array<{x,y}>} lm 68 landmarks in source-image pixels
 * @param {number} faceW face box width (same pixel space)
 * @param {number} faceH face box height (same pixel space)
 * @returns 7-key probability object over our expression keys
 */
export function geometricVote(lm, faceW, faceH) {
  const fallback = { neutral: 0.5, happy: 0.1, sad: 0.1, angry: 0.1, surprised: 0.1, fearful: 0.05, disgusted: 0.05 };
  if (!lm || lm.length < 68 || !(faceW > 0) || !(faceH > 0)) return { ...fallback };
  try {
    // Eye openness (EAR), both eyes averaged
    const earL = (dist(lm[37], lm[41]) + dist(lm[38], lm[40])) / (2 * dist(lm[36], lm[39]) + 1e-6);
    const earR = (dist(lm[43], lm[47]) + dist(lm[44], lm[46])) / (2 * dist(lm[42], lm[45]) + 1e-6);
    const ear = (earL + earR) / 2;
    // Mouth openness (MAR, inner mouth)
    const mar = (dist(lm[61], lm[67]) + dist(lm[62], lm[66]) + dist(lm[63], lm[65])) /
      (3 * dist(lm[60], lm[64]) + 1e-6);
    // Brow-to-eye gap (small = lowered/angry brows)
    const eyeL = avg([lm[36], lm[37], lm[38], lm[39], lm[40], lm[41]]);
    const eyeR = avg([lm[42], lm[43], lm[44], lm[45], lm[46], lm[47]]);
    const browGap = (dist(lm[19], eyeL) + dist(lm[24], eyeR)) / 2 / faceH;
    // Mouth shape
    const mouthW = dist(lm[48], lm[54]) / faceW;
    const mouthH = Math.max(1e-6, dist(lm[51], lm[57]));
    const cornerAvgY = (lm[48].y + lm[54].y) / 2;
    const midY = (lm[51].y + lm[57].y) / 2;
    const smile = (midY - cornerAvgY) / mouthH; // >0 corners lifted (smile), <0 downturned (frown)
    // Sad upper-face cues (68-point indices):
    // inner brow (21,22) raised vs outer brow (17,25) = AU1 grief-brow;
    // brow lowered toward eyes overall = AU4 tension (shared with anger,
    // but anger also narrows eyes + presses lips, sad does not).
    const innerBrowY = (lm[21].y + lm[22].y) / 2;
    const outerBrowY = (lm[17].y + lm[25].y) / 2;
    const browRaise = (outerBrowY - innerBrowY) / faceH; // >0 inner raised (sad)
    const browLower = ((dist(lm[19], eyeL) + dist(lm[24], eyeR)) / 2 / faceH < 0.13) ? 1 : 0;
    const lidDroop = clamp01((0.235 - ear) * 5); // sad eyelids hang; surprise/fear widen

    const happy = clamp01((smile - 0.04) * 3.2);
    const surprised = clamp01(clamp01((mar - 0.32) * 3) * 0.6 + clamp01((ear - 0.26) * 4) * 0.4);
    const fearful = clamp01(clamp01((ear - 0.25) * 3) * 0.5 + clamp01((mouthW - 0.29) * 3) * 0.3 + clamp01((mar - 0.2) * 2) * 0.2);
    // Sad = downturned corners + pressed/closed mouth + grief-brow + lid droop.
    // Thresholds start near zero so subtle frowns still vote instead of abstaining.
    const sadMouth = clamp01((-smile - 0.015) * 2.8);
    const sadClosed = clamp01((0.22 - mar) * 3);
    const sadBrow = clamp01((browRaise - 0.004) * 60) * 0.7 + browLower * 0.3;
    const sad = clamp01(sadMouth * 0.45 + sadClosed * 0.15 + clamp01(sadBrow) * 0.25 + lidDroop * 0.15);
    const angry = clamp01(clamp01((0.15 - browGap) * 6) * 0.6 + clamp01((0.13 - mar) * 5) * 0.25 + clamp01((0.2 - ear) * 4) * 0.15);
    const disgusted = clamp01(clamp01((0.15 - mar) * 4) * 0.4 + clamp01((0.3 - mouthW) * 4) * 0.3 + clamp01((0.16 - browGap) * 4) * 0.3);
    const peak = Math.max(happy, surprised, fearful, sad, angry, disgusted);
    const neutral = Math.max(0.04, 0.5 - peak);

    const scores = { happy, sad, angry, surprised, fearful, disgusted, neutral };
    let sum = 0;
    for (const k of Object.keys(scores)) sum += scores[k];
    if (sum <= 0) return { ...fallback };
    for (const k of Object.keys(scores)) scores[k] /= sum;
    return scores;
  } catch {
    return { ...fallback };
  }
}
