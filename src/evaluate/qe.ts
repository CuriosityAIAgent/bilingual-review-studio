/**
 * Quality Estimation (spec §6, §15) — reference-free, in-container, model-based.
 *
 * DEFAULT: a real open-weight cross-lingual embedding model running in THIS
 * container (src/evaluate/qe-model.ts) — no external service, no GPU, no bank
 * infrastructure. FALLBACK: the lightweight heuristic below, used only if the
 * model can't load (e.g. offline first run) or in unit tests.
 *
 * QE's only job is ROUTING (decide whether to attempt a refine iteration and
 * whether to force human review). It is NEVER an approval signal — the
 * deterministic validators and humans are authoritative.
 */
import { neuralQe } from "./qe-model";

const ENGLISH_STOPWORDS = new Set([
  "the", "and", "of", "to", "in", "for", "with", "is", "are", "this", "that",
  "we", "our", "growth", "market", "investment", "will", "have", "from", "as",
]);

function tokens(s: string): string[] {
  return s.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
}

/** Lightweight reference-free heuristic fallback in [0,1]. */
export function heuristicQe(source: string, mt: string): number {
  if (!mt.trim()) return 0;
  let score = 0.92;
  const src = tokens(source);
  const tgt = tokens(mt);
  if (tgt.length === 0) return 0;

  const ratio = tgt.length / Math.max(1, src.length);
  if (ratio < 0.6 || ratio > 1.9) score -= 0.25;
  else if (ratio < 0.8 || ratio > 1.6) score -= 0.1;

  const englishLeak = tgt.filter((t) => ENGLISH_STOPWORDS.has(t)).length;
  if (englishLeak > 0) score -= Math.min(0.3, 0.08 * englishLeak);

  if (mt.trim().toLowerCase() === source.trim().toLowerCase() && src.length > 2) score -= 0.4;
  if (src.length > 8 && tgt.length < src.length * 0.4) score -= 0.2;

  return Math.max(0, Math.min(1, Number(score.toFixed(3))));
}

/**
 * Reference-free QE in [0,1]. Uses the in-container neural model by default;
 * falls back to the heuristic when the model is unavailable. Unit tests
 * (VITEST) use the heuristic to stay fast and offline.
 */
export async function qe(source: string, mt: string): Promise<number> {
  if (!mt.trim()) return 0;
  if (process.env.VITEST) return heuristicQe(source, mt);

  const model = await neuralQe(source, mt);
  if (model === null) return heuristicQe(source, mt);

  // Light sanity floor: a no-op (target === source) is never high-quality,
  // even if the embedding model rates the identical strings as similar.
  let score = model;
  if (mt.trim().toLowerCase() === source.trim().toLowerCase() && tokens(source).length > 2) {
    score = Math.min(score, 0.4);
  }
  return Number(score.toFixed(3));
}
