/**
 * Entity extraction (spec §9 step 2). These are the "sacred" tokens — numbers,
 * percentages, dates, currencies, tickers, ISINs, fund/index names, ratings,
 * legal entities. Extracted at PREPARE and re-checked against final_text at
 * VALIDATE (spec §10). Numeric corruption is a CRITICAL risk (spec §19).
 */
import type { Entity, EntityKind } from "@/src/lib/doc-model";

const SCALE: Record<string, number> = {
  thousand: 1e3, k: 1e3,
  million: 1e6, mn: 1e6, m: 1e6, mm: 1e6,
  billion: 1e9, bn: 1e9, b: 1e9,
  trillion: 1e12, tn: 1e12, tr: 1e12,
};

/** Normalise a numeric expression to a canonical digit string (English format). */
export function normalizeNumber(raw: string): string {
  const m = raw.match(
    /(-?\d[\d,]*\.?\d*)\s*(thousand|million|billion|trillion|bn|mn|tn|mm|tr|k|m|b)?/i,
  );
  if (!m) return raw.trim();
  const numeric = parseFloat(m[1].replace(/,/g, ""));
  if (Number.isNaN(numeric)) return raw.trim();
  const scaleWord = (m[2] || "").toLowerCase();
  const scale = SCALE[scaleWord] ?? 1;
  const value = numeric * scale;
  // Integer-ish → plain integer string; else trimmed decimal.
  return Number.isInteger(value) ? value.toFixed(0) : String(value);
}

interface Pattern {
  kind: EntityKind;
  re: RegExp;
  norm?: (s: string) => string;
}

// Order matters: more specific patterns first so they win the offset.
const PATTERNS: Pattern[] = [
  // ISIN: 2 letters + 9 alphanumerics + 1 check digit
  { kind: "isin", re: /\b[A-Z]{2}[A-Z0-9]{9}\d\b/g },
  // Currency amount: symbol/code + number (+ optional scale word)
  {
    kind: "currency",
    re: /(?:USD|EUR|GBP|CHF|JPY|\$|€|£)\s?-?\d[\d,]*\.?\d*\s*(?:thousand|million|billion|trillion|bn|mn|tn|k|m|b)?/gi,
    norm: normalizeNumber,
  },
  // Percent
  { kind: "percent", re: /-?\d[\d,]*\.?\d*\s?%/g, norm: (s) => `${normalizeNumber(s)}%` },
  // Basis points
  { kind: "number", re: /\b\d[\d,]*\.?\d*\s?(?:bps|basis points)\b/gi, norm: (s) => `${normalizeNumber(s)}bps` },
  // Ticker in parens or with $ prefix (conservative to avoid acronym noise)
  { kind: "ticker", re: /\$[A-Z]{1,5}\b|\((?:NYSE|NASDAQ|LSE)?:?\s?[A-Z]{1,5}\)/g },
  // Standalone numbers with scale words
  { kind: "number", re: /\b-?\d[\d,]*\.?\d*\s*(?:thousand|million|billion|trillion|bn|mn|tn|k|m|b)\b/gi, norm: normalizeNumber },
  // Bare numbers (incl. decimals)
  { kind: "number", re: /\b-?\d[\d,]*\.?\d+\b|\b-?\d{2,}\b/g, norm: normalizeNumber },
];

// Years / quarters are handled separately so we don't double-count with numbers.
const YEAR_RE = /\b(19|20)\d{2}\b/g;
const QUARTER_RE = /\bQ[1-4]\s?(?:19|20)?\d{2}?\b/gi;

export function extractEntities(text: string): Entity[] {
  const out: Entity[] = [];
  const claimed: Array<[number, number]> = [];

  const overlaps = (a: number, b: number) =>
    claimed.some(([s, e]) => a < e && b > s);

  // Dates first (years + quarters) so plain-number pattern skips them.
  for (const re of [QUARTER_RE, YEAR_RE]) {
    for (const m of text.matchAll(re)) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      if (overlaps(start, end)) continue;
      claimed.push([start, end]);
      out.push({ kind: "date", text: m[0], norm: m[0].replace(/\s+/g, "").toUpperCase(), char_start: start, char_end: end });
    }
  }

  for (const p of PATTERNS) {
    for (const m of text.matchAll(p.re)) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      if (overlaps(start, end)) continue;
      claimed.push([start, end]);
      out.push({
        kind: p.kind,
        text: m[0].trim(),
        norm: p.norm ? p.norm(m[0]) : m[0].trim(),
        char_start: start,
        char_end: end,
      });
    }
  }

  return out.sort((a, b) => (a.char_start ?? 0) - (b.char_start ?? 0));
}
