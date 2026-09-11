/* Pure expression-decision logic (no TF.js / face-api imports) so it runs in
   Node tests AND the browser. faceEngine.js re-exports everything here. */
import { geometricVote } from './geoVoter.js';

export const EXPRESSIONS = ['neutral', 'happy', 'sad', 'angry', 'fearful', 'disgusted', 'surprised'];

/* Calibration: the FER classifier over-predicts "neutral" on webcam frames —
   subtle frowns score neutral 0.45 / sad 0.3 and the real mood loses.
   Sad/fearful/disgusted get the strongest gains because FER2013 under-
   represents them (~1000-4000 samples vs ~7000 happy) and webcam light
   flattens the mouth-corner + brow cues they depend on. */
const CALIBRATION = { happy: 1.1, surprised: 1.08, sad: 1.32, angry: 1.12, disgusted: 1.12, fearful: 1.12, neutral: 0.62 };

export function calibrateExpressions(expr) {
  const out = {};
  let sum = 0;
  for (const k of EXPRESSIONS) {
    out[k] = (expr?.[k] ?? 0) * (CALIBRATION[k] ?? 1);
    sum += out[k];
  }
  if (sum > 0) for (const k of EXPRESSIONS) out[k] /= sum;
  return out;
}

/** Hold the previous mood when the top two readings are nearly tied (anti-flicker).
 *  Sad-aware: a neutral lock must NOT swallow an emerging sad/fearful read —
 *  those onsets are gradual and always start as near-ties. */
export function lockDominant(faces, prevDominant, margin = 0.08) {
  if (!faces?.length || !prevDominant) return faces;
  const f = faces[0];
  if (f.dominant !== prevDominant && (f.confidence - (f.secondaryScore ?? 0)) < margin) {
    // Let a felt emotion break a neutral lock easily; keep the lock only
    // between two felt emotions (happy vs sad flicker) or into neutral.
    const challengerIsFelt = f.dominant !== 'neutral';
    const lockedIsNeutral = prevDominant === 'neutral';
    const challengerScore = f.expressions?.[f.dominant] ?? 0;
    if (lockedIsNeutral && challengerIsFelt && challengerScore > 0.2) return faces;
    return [{ ...f, dominant: prevDominant, confidence: f.expressions[prevDominant] ?? f.confidence, locked: true }, ...faces.slice(1)];
  }
  return faces;
}

function toSortedExpressions(expr) {
  return EXPRESSIONS.map((k) => ({ emotion: k, score: expr?.[k] ?? 0 })).sort((a, b) => b.score - a.score);
}

/** Average expression probabilities across several readings (temporal smoothing).
 *  `weights` optionally emphasises recent frames (e.g. still counts double). */
export function averageExpressions(list, weights) {
  const avg = {};
  for (const k of EXPRESSIONS) avg[k] = 0;
  if (!list.length) return avg;
  let wsum = 0;
  for (let i = 0; i < list.length; i++) {
    const w = weights?.[i] ?? 1;
    wsum += w;
    for (const k of EXPRESSIONS) avg[k] += (list[i]?.[k] ?? 0) * w;
  }
  if (wsum > 0) for (const k of EXPRESSIONS) avg[k] /= wsum;
  return avg;
}

/** Weighted still blend: the accurate SSD read counts ~60%, recent live
 *  frames share the rest — jitter is damped without diluting a real onset. */
export function blendStillWithPriors(stillExpr, priors = []) {
  const recent = priors.slice(-4);
  if (!recent.length) return { ...stillExpr };
  const list = [stillExpr, ...recent];
  const weights = [0.6, ...recent.map(() => 0.4 / recent.length)];
  return averageExpressions(list, weights);
}

export function summarizeExpressions(expr) {
  const calibrated = calibrateExpressions(expr);
  const sorted = toSortedExpressions(calibrated);
  // Runner-up promotion: a weak "neutral" must lose to a genuinely felt emotion.
  // This is the classic webcam failure — a sad face scoring neutral 0.45 / sad 0.3.
  // Thresholds widened (neutral < 0.60, runner > 0.18) after sad-miss reports.
  let dom = sorted[0];
  let sec = sorted[1] ?? { emotion: 'neutral', score: 0 };
  if (dom.emotion === 'neutral' && dom.score < 0.6) {
    const runner = sorted.find((s) => s.emotion !== 'neutral' && s.score > 0.18);
    if (runner) {
      dom = runner;
      sec = sorted.find((s) => s.emotion !== runner.emotion) ?? { emotion: 'neutral', score: 0 };
    }
  }
  // Sad rescue: sad onsets look like neutral/fearful/disgusted first.
  // If sad is a close runner-up, promote it — missing sad is worse than
  // a borderline false positive, because the meme pick still stays negative-mood.
  if (dom.emotion !== 'sad') {
    const sad = sorted.find((s) => s.emotion === 'sad');
    const sadClose = sad && sad.score > 0.2 && (dom.score - sad.score) < 0.22;
    const topIsConfusable = dom.emotion === 'neutral' || dom.emotion === 'fearful' || dom.emotion === 'disgusted';
    if (sad && sadClose && (topIsConfusable || dom.score < 0.38)) {
      sec = { emotion: dom.emotion, score: dom.score };
      dom = sad;
    }
  }
  return {
    expressions: { ...calibrated },
    ranked: sorted,
    dominant: dom.emotion,
    confidence: dom.score,
    secondary: sec.emotion,
    secondaryScore: sec.score,
    uncertain: dom.score < 0.36,
  };
}

/** Cheap live fusion: FER 0.72 + geometry 0.28 from the same 68-point mesh.
 *  Geometry costs nothing extra here (landmarks already computed) and it
 *  sees frowns/brow-droop the FER net flattens — this is what makes sad
 *  show up in the LIVE badge instead of only after freezing. */
export function fuseLiveExpressions(ferExpr, landmarks, box) {
  if (!landmarks || landmarks.length < 68 || !box?.width) return { ...ferExpr };
  try {
    const geo = geometricVote(landmarks, box.width, box.height);
    const out = {};
    for (const k of EXPRESSIONS) out[k] = (ferExpr?.[k] ?? 0) * 0.72 + (geo[k] ?? 0) * 0.28;
    return out;
  } catch {
    return { ...ferExpr };
  }
}

/** Per-emotion hold threshold for auto-freeze: sad/fearful/disgusted onset
 *  at lower confidence, so they must not need the same 0.30 as a grin. */
export function holdThreshold(emotion) {
  if (emotion === 'sad' || emotion === 'fearful' || emotion === 'disgusted') return 0.22;
  if (emotion === 'angry') return 0.25;
  return 0.3;
}
