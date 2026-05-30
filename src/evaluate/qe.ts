/**
 * Quality Estimation — heuristic stub (spec §6, §15).
 *
 * In production this is an open-weight model (CometKiwi / xCOMET / MetricX-QE)
 * running on BANK INFRASTRUCTURE — never an external API. Here it is a crude
 * reference-free heuristic. Its ONLY job is ROUTING (decide whether to attempt a
 * refine iteration and whether to force human review). It is NEVER an approval
 * signal — validators and humans are authoritative.
 *
 * The interface (source, mt) → number in [0,1] matches the real QE model so it
 * can be swapped in without touching the pipeline.
 */

const ENGLISH_STOPWORDS = new Set([
  "the", "and", "of", "to", "in", "for", "with", "is", "are", "this", "that",
  "we", "our", "growth", "market", "investment", "will", "have", "from", "as",
]);

function tokens(s: string): string[] {
  return s.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
}

/** Reference-free QE heuristic in [0,1]. Higher = more likely acceptable. */
export function qe(source: string, mt: string): number {
  if (!mt.trim()) return 0;

  let score = 0.92;
  const src = tokens(source);
  const tgt = tokens(mt);
  if (tgt.length === 0) return 0;

  // 1) Length ratio sanity — neutral ES runs ~1.0–1.35x the English token count.
  const ratio = tgt.length / Math.max(1, src.length);
  if (ratio < 0.6 || ratio > 1.9) score -= 0.25;
  else if (ratio < 0.8 || ratio > 1.6) score -= 0.1;

  // 2) Residual untranslated English (English stopwords appearing in target).
  const englishLeak = tgt.filter((t) => ENGLISH_STOPWORDS.has(t)).length;
  if (englishLeak > 0) score -= Math.min(0.3, 0.08 * englishLeak);

  // 3) Untranslated identity: target equals source (translator no-op).
  if (mt.trim().toLowerCase() === source.trim().toLowerCase() && src.length > 2) score -= 0.4;

  // 4) Degenerate output: very short relative to a long source.
  if (src.length > 8 && tgt.length < src.length * 0.4) score -= 0.2;

  return Math.max(0, Math.min(1, Number(score.toFixed(3))));
}
