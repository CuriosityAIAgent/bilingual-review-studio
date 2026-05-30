/**
 * Do-Not-Translate detection (spec §9, §10). DNT tokens are identifiers and
 * proper product/vendor/entity names that must survive verbatim. Tickers and
 * ISINs are already entities; here we additionally surface known product and
 * vendor names so they are protected and passed to the translator + validator.
 *
 * DNT terms are modelled AS ENTITIES (kind "fund"/"entity") so the document
 * model carries them without a bespoke field.
 */
import type { Entity } from "@/src/lib/doc-model";

/** Known product / vendor / index proper nouns. Extend per institution. */
export const KNOWN_DNT: string[] = [
  "BlackRock Aladdin", "Aladdin", "BlackRock", "iShares",
  "Bloomberg Terminal", "Bloomberg", "MSCI", "Morningstar", "Refinitiv",
  "S&P 500", "S&P", "FTSE 100", "FTSE", "Nasdaq", "EURO STOXX 50", "EURO STOXX",
  "Aladdin Wealth", "eFront", "Preqin",
];

const DNT_ENTITY_KINDS = new Set<Entity["kind"]>(["ticker", "isin", "fund", "index", "entity", "rating"]);

/** Detect known product/vendor names present in the source, as entities. */
export function detectDntEntities(source: string): Entity[] {
  const out: Entity[] = [];
  // Longest names first so "BlackRock Aladdin" wins over "BlackRock".
  const sorted = [...KNOWN_DNT].sort((a, b) => b.length - a.length);
  const claimed: Array<[number, number]> = [];
  for (const term of sorted) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "gu");
    for (const m of source.matchAll(re)) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      if (claimed.some(([s, e]) => start < e && end > s)) continue;
      claimed.push([start, end]);
      out.push({ kind: "entity", text: m[0], norm: m[0], char_start: start, char_end: end });
    }
  }
  return out;
}

/** The DNT tokens for a block, derived from its entities. */
export function dntTermsFromEntities(entities: Entity[]): string[] {
  const terms = entities.filter((e) => DNT_ENTITY_KINDS.has(e.kind)).map((e) => e.text);
  return Array.from(new Set(terms));
}
