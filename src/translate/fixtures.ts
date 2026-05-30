/**
 * Deterministic fixture translator — the offline safety net (spec §6 fallback).
 *
 * When no ANTHROPIC_API_KEY is present the demo must still run end-to-end. This
 * produces plausible neutral-Spanish for the seeded demo documents:
 *   1. exact/normalised lookup in glossaries/fixture-translations.json (seeded)
 *   2. a built-in phrase map for the canonical demo paragraph
 *   3. word-level finance gloss as a last resort (numbers/entities preserved)
 *
 * The base output here may deliberately contain a regionalism (e.g. a
 * Mexican/Peninsular term). The active-rules post-pass (src/memory/apply.ts)
 * neutralises any clash that has a learned rule — which is exactly how the
 * flywheel is demonstrated without a live model.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function loadSeededMap(): Record<string, string> {
  const path = process.env.FIXTURES_PATH || join(process.cwd(), "glossaries", "fixture-translations.json");
  if (existsSync(path)) {
    try {
      return JSON.parse(readFileSync(path, "utf8")) as Record<string, string>;
    } catch {
      /* fall through to built-ins */
    }
  }
  return {};
}

/** Test hook: clear the cached seed map so a new FIXTURES_PATH is honoured. */
export function resetFixtureCache(): void {
  _seeded = null;
}

function normKey(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

// Built-in phrase map (kept small; the seeded JSON enriches this).
const BUILTIN: Record<string, string> = {
  "global markets outlook": "Perspectiva de los mercados globales",
};

// Compact EN→neutral-ES finance gloss for the last-resort word fallback.
const WORDS: Record<string, string> = {
  the: "el", and: "y", of: "de", to: "a", in: "en", for: "para", with: "con",
  market: "mercado", markets: "mercados", equity: "renta variable", equities: "renta variable",
  bond: "bono", bonds: "bonos", yield: "rendimiento", yields: "rendimientos",
  growth: "crecimiento", inflation: "inflación", rate: "tasa", rates: "tasas",
  portfolio: "cartera", portfolios: "carteras", investor: "inversionista",
  investors: "inversionistas", investment: "inversión", risk: "riesgo",
  return: "rendimiento", returns: "rendimientos", quarter: "trimestre",
  outlook: "perspectiva", strategy: "estrategia", performance: "desempeño",
  central: "central", bank: "banco", "interest": "interés", "we": "nosotros",
  expect: "esperamos", remains: "permanece", year: "año", forecast: "pronóstico",
};

function wordGloss(source: string): string {
  return source
    .split(/(\s+)/)
    .map((tok) => {
      if (/^\s+$/.test(tok)) return tok;
      // preserve numbers, %, currency, tickers, punctuation-bound tokens
      if (/[\d%$€£]/.test(tok)) return tok;
      const lead = tok.match(/^[^\p{L}]*/u)?.[0] ?? "";
      const trail = tok.match(/[^\p{L}]*$/u)?.[0] ?? "";
      const core = tok.slice(lead.length, tok.length - trail.length);
      const lower = core.toLowerCase();
      const es = WORDS[lower];
      if (!es) return tok;
      const cased = core[0] === core[0]?.toUpperCase() ? es.charAt(0).toUpperCase() + es.slice(1) : es;
      return lead + cased + trail;
    })
    .join("");
}

let _seeded: Record<string, string> | null = null;

export function fixtureTranslateSegment(source: string): string {
  if (!_seeded) _seeded = { ...BUILTIN, ...loadSeededMap() };
  const key = normKey(source);
  if (_seeded[key]) return _seeded[key];
  return wordGloss(source);
}
