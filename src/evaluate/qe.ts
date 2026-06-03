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
import type { Entity } from "@/src/lib/doc-model";
import { residualEnglishWords, stripAllowedNames } from "@/src/lib/leakage-words";
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

/** Optional context so QE can tell "shared by design" tokens (names, tickers,
 * figures, DNT terms) apart from "didn't translate". Pulled from RefineContext. */
export interface QeContext {
  dntTerms?: string[];
  entities?: Entity[];
}

/** Lowercase content words (incl. Spanish accents), length >= 3. Numbers are
 * excluded by construction (alphabetic-only), so figures never count as copied. */
function contentTokens(s: string): string[] {
  return (s.toLowerCase().match(/[a-záéíóúñü']+/gu) ?? []).filter((t) => t.length >= 3);
}

/**
 * Treat a token that appears in both source and target as a CORRECT Spanish
 * cognate (not an untranslated copy) when it carries Spanish orthography or
 * morphology. Cheap and dictionary-free — covers the broad cognate class
 * (fiscal, digital, industrial, principal, regional, posición, capacidad…) that
 * a hard-coded list can't. The residual-English leak check backstops the common
 * English words that slip through.
 *
 * Known trade-off: a few English-only `-al` words (commercial, financial) are
 * also treated as Spanish here, so a draft built ENTIRELY of identical-spelling
 * cognate words could evade the overlap cap. That case is rare and genuinely
 * ambiguous with a valid translation; realistic garbled drafts carry many
 * non-cognate English words that still drive overlap high. QE is routing-only,
 * so we accept this over precision that would need a Spanish lexicon.
 */
function looksSpanish(token: string): boolean {
  if (/[áéíóúñü]/.test(token)) return true;
  return /(?:ción|ciones|dad|dades|idad|mente|ales|al|ico|ica|icos|icas|oso|osa|tad)$/.test(token);
}

/**
 * "Did this actually get translated to Spanish?" — an upper bound on QE in [0,1].
 *
 * A reference-free cross-lingual cosine rewards a COPY of the source (it is
 * trivially adequate to itself), so a half-untranslated / code-switched draft
 * scores ~1.0. We cap QE by how much of the target is just English copied
 * verbatim from the source. Kept-in-English names (DNT/entities) are removed as
 * phrases first, numbers are excluded by tokenization, and Spanish-looking
 * cognates are skipped. Returns 1 (no cap) when there's nothing to penalise.
 */
export function translatednessCap(source: string, mt: string, opts?: QeContext): number {
  const tgtText = stripAllowedNames(mt, opts);
  const srcTokens = new Set(contentTokens(source));
  // Candidate "copied English" tokens: content words that don't look Spanish.
  const tgt = contentTokens(tgtText).filter((t) => !looksSpanish(t));
  const overlap = tgt.length ? tgt.filter((t) => srcTokens.has(t)).length / tgt.length : 0;
  let cap = 1;
  if (tgt.length >= 4) {
    if (overlap >= 0.6) cap = 0.25;
    else if (overlap >= 0.4) cap = 0.55;
  } else if (tgt.length >= 2 && overlap === 1) {
    // Short heading copied verbatim from the source (e.g. an untranslated
    // "Market outlook"). >=2 tokens avoids false-flagging a single ambiguous word.
    cap = 0.4;
  }
  // Residual unambiguous-English words — the SAME shared signal the english_leakage
  // validator gates on (>=3 = blocking), so QE and the gate agree by construction.
  if (residualEnglishWords(mt, opts).length >= 3) cap = Math.min(cap, 0.4);
  return cap;
}

/**
 * Reference-free QE in [0,1]. Uses the in-container neural model by default;
 * falls back to the heuristic when the model is unavailable. Unit tests
 * (VITEST) use the heuristic to stay fast and offline. In every path the score
 * is bounded by `translatednessCap` so a copy-of-the-source can't score high.
 */
export async function qe(source: string, mt: string, opts?: QeContext): Promise<number> {
  if (!mt.trim()) return 0;
  const cap = translatednessCap(source, mt, opts);

  if (process.env.VITEST) return clamp(heuristicQe(source, mt), cap);

  const model = await neuralQe(source, mt);
  if (model === null) return clamp(heuristicQe(source, mt), cap);

  // Light sanity floor: a no-op (target === source) is never high-quality,
  // even if the embedding model rates the identical strings as similar.
  let score = model;
  if (mt.trim().toLowerCase() === source.trim().toLowerCase() && tokens(source).length > 2) {
    score = Math.min(score, 0.4);
  }
  return clamp(score, cap);
}

function clamp(score: number, cap: number): number {
  return Number(Math.min(score, cap).toFixed(3));
}
