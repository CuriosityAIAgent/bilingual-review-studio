/**
 * Translation-memory retrieval for retrieval-augmented translation (spec §9, §13).
 *
 * The flywheel's whole point is that approved human translations make FUTURE
 * drafts better — not only when a sentence repeats verbatim. Exact matches
 * (≥ the TM reuse threshold) are auto-applied upstream in prepare/. This module
 * handles the band BELOW that: for each still-to-translate segment we surface the
 * most similar approved pairs as few-shot EXAMPLES, which the translator is told
 * to follow for terminology and phrasing. That is how a reviewer-approved
 * rendering propagates to new, non-identical content.
 *
 * v1 ranks by normalized edit-distance on the English source — strong for the
 * near-duplicate / boilerplate-variant case that dominates financial documents.
 * (A cross-lingual embedding rank is a later upgrade; see TODO.)
 */
import type { Locale, TmEntry } from "@/src/lib/doc-model";
import { similarity } from "@/src/lib/similarity";

export interface TmExample {
  en: string;
  target: string;
  /** Source similarity in [0,1]; 1.0 ≈ identical English. */
  score: number;
}

export interface RetrieveOpts {
  /** Max examples returned per segment. */
  topK?: number;
  /** Minimum source similarity to include — keeps irrelevant pairs out of the prompt. */
  floor?: number;
  /** Only consider this locale's memory (never mix Spanish into a Chinese draft). */
  locale?: Locale;
}

/** Most-similar approved TM pairs for one source segment, best first. Disclaimers
 *  are excluded (compliance-only, routed separately) and superseded entries are
 *  ignored. Returns [] when nothing clears the floor. */
export function retrieveTmExamples(source: string, tm: TmEntry[], opts: RetrieveOpts = {}): TmExample[] {
  const topK = opts.topK ?? 3;
  const floor = opts.floor ?? 0.5;
  const src = source.trim();
  if (!src) return [];

  const seen = new Set<string>();
  const scored: TmExample[] = [];
  for (const t of tm) {
    if (t.superseded_by || t.kind === "disclaimer") continue;
    if (opts.locale && t.locale !== opts.locale) continue;
    if (!t.target_text?.trim()) continue;
    if (seen.has(t.source_text)) continue; // one example per distinct source
    seen.add(t.source_text);
    const score = similarity(src, t.source_text);
    if (score >= floor) scored.push({ en: t.source_text, target: t.target_text, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}
