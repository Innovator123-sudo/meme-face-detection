export const EMOTION_META = {
  happy: { label: 'Happy', hint: 'Smiles, laughter and high-energy reactions.' },
  sad: { label: 'Sad', hint: 'Crying, heartbreak and emotional moments.' },
  angry: { label: 'Angry', hint: 'Outbursts, scolding and attitude clips.' },
  surprised: { label: 'Surprised', hint: 'Shock, disbelief and double-takes.' },
  fearful: { label: 'Fearful', hint: 'Nervous, scared and tense moments.' },
  disgusted: { label: 'Disgusted', hint: 'Annoyed, fed-up and dismissive clips.' },
  neutral: { label: 'Neutral', hint: 'Dialogues, explanations and deadpan delivery.' },
};

export const EMOTION_ORDER = ['happy', 'sad', 'angry', 'surprised', 'fearful', 'disgusted', 'neutral'];

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

function scoreOne(meme, expressions, dominant, secondary, seed) {
  const prob = expressions?.[meme.emotion] ?? (meme.emotion === 'neutral' ? 0.2 : 0);
  let score = 0.1 + prob * 0.9;
  if (meme.emotion === secondary) score += 0.07;
  if ((dominant === 'happy' || dominant === 'surprised') && meme.energy === 'high') score += 0.05;
  if ((dominant === 'sad' || dominant === 'fearful') && meme.energy === 'low') score += 0.05;
  if (dominant === 'neutral' && meme.emotion === 'neutral') score += 0.06;
  // Video clips beat still images at similar emotion scores — this is a video
  // meme app (local MP4s have no `media` field, so anything not 'image' counts).
  if (meme.media !== 'image') score += 0.15;
  // Deterministic jitter so "Shuffle" gives fresh variety without pure randomness
  score += hashStr(`${meme.file}::${seed}`) * 0.05;
  return Math.min(0.99, score);
}

/**
 * Rank local memes against a face analysis.
 * analysis: { expressions, dominant, secondary, age, gender }
 */
export function rankMemes(memes, analysis, seed = 1) {
  if (!analysis || !memes?.length) {
    return (memes || []).map((m) => ({ ...m, matchScore: 0, matchPercent: 0, reason: 'Browse mode' }));
  }
  const { expressions, dominant, secondary } = analysis;
  const ranked = memes.map((m) => {
    const s = scoreOne(m, expressions, dominant, secondary, seed);
    const pct = Math.round(s * 100);
    const actorBit = m.actor ? ` · ${capitalize(m.actor)}` : '';
    const alsoBit = m.secondary ? ` (also ${m.secondary})` : '';
    return {
      ...m,
      matchScore: s,
      matchPercent: pct,
      reason: `${pct}% ${dominant} match · ${EMOTION_META[m.emotion]?.label ?? m.emotion} clip${alsoBit}${actorBit}`,
    };
  });
  ranked.sort((a, b) => b.matchScore - a.matchScore);

  // Guarantee variety: ensure the top 12 are not all one emotion when a
  // secondary emotion is strongly present.
  const secondaryProb = expressions?.[secondary] ?? 0;
  if (secondary && secondary !== dominant && secondaryProb > 0.22) {
    const top = ranked.slice(0, 12);
    const hasSecondary = top.some((m) => m.emotion === secondary);
    if (!hasSecondary) {
      const cand = ranked.find((m) => m.emotion === secondary);
      if (cand) {
        const withoutLast = top.slice(0, 11);
        const rest = ranked.filter((m) => !withoutLast.includes(m) && m !== cand);
        return [...withoutLast, cand, ...rest];
      }
    }
  }
  return ranked;
}

function capitalize(s) {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function describeFace(face) {
  if (!face) return '';
  const pct = Math.round(face.confidence * 100);
  const age = `around ${face.age}`;
  const gender = face.genderProbability > 0.6 ? face.gender : 'person';
  return `Looks ${face.dominant} (${pct}%) — ${gender}, ${age}.`;
}
