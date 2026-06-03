/**
 * Residual-English detection — single source of truth shared by:
 *   - the english_leakage validator (src/validators/english_leakage.ts), the
 *     authoritative gate (>=3 residual words = blocking), and
 *   - the QE translatedness cap (src/evaluate/qe.ts), the routing signal,
 * so the two can never disagree on what counts as untranslated English.
 */
import type { Entity } from "./doc-model";

/** Unambiguously-English tokens — none are valid Spanish — used to detect
 * residual untranslated English. Deliberately conservative (excludes EN/ES
 * cognates) to avoid false positives. */
export const ENGLISH_ONLY = new Set<string>([
  "the", "and", "of", "for", "with", "this", "that", "these", "those", "from",
  "growth", "market", "markets", "yield", "earnings", "however", "therefore",
  "quarter", "outlook", "forecast", "guidance", "wealth", "income",
  "report", "performance", "investment", "investors", "throughout", "during",
  "increase", "decrease", "overweight", "underweight", "we", "our", "their",
]);

/** Names that are supposed to stay in English inside a Spanish target: DNT terms
 * and extracted entity surface forms (proper nouns, tickers, fund/index names). */
export interface AllowedNames {
  dntTerms?: string[];
  entities?: Entity[];
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Remove kept-in-English names from `text` as whole PHRASES, longest first, so a
 * named product like "Global Income Fund" is exempt but an ordinary "income"
 * used untranslated elsewhere still counts (token-level exemption would mask it).
 */
export function stripAllowedNames(text: string, opts?: AllowedNames): string {
  const phrases = [...(opts?.dntTerms ?? []), ...(opts?.entities ?? []).map((e) => e.text)]
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    // A single-word allowed name that is itself a common English word (e.g. a
    // share class literally called "Growth") is NOT stripped: removing every
    // occurrence would hide stray untranslated copies of that word elsewhere.
    // Multi-word names are always safe to strip as a span.
    .filter((p) => p.includes(" ") || !ENGLISH_ONLY.has(p.toLowerCase()))
    .sort((a, b) => b.length - a.length);
  let out = text;
  for (const p of phrases) {
    // Match only as a standalone phrase (not inside a larger word) so a short
    // acronym DNT like "US"/"AI" doesn't corrupt "ajustes"/"aire".
    out = out.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(p)}(?![\\p{L}\\p{N}])`, "giu"), " ");
  }
  return out;
}

/** Distinct residual unambiguous-English words in `text`, ignoring kept-in-
 * English names. The shared primitive behind both the validator and the QE cap. */
export function residualEnglishWords(text: string, opts?: AllowedNames): string[] {
  const stripped = stripAllowedNames(text, opts).toLowerCase();
  const words = stripped.match(/[a-z']+/g) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of words) {
    if (ENGLISH_ONLY.has(w) && !seen.has(w)) {
      seen.add(w);
      out.push(w);
    }
  }
  return out;
}
