/**
 * Deterministic fixture translator — the offline safety net (spec §6 fallback).
 *
 * When no live translator key is present the demo must still run end-to-end. Per
 * target locale:
 *   1. exact/normalised lookup in glossaries/fixture-translations[-<locale>].json
 *   2. (es-419) a built-in phrase map for the canonical demo paragraph
 *   3. word-level finance gloss as a last resort (numbers/entities preserved)
 *
 * The base output may deliberately contain a regionalism; the active-rules
 * post-pass (src/memory/apply.ts) neutralises any clash with a learned rule —
 * how the flywheel is demonstrated without a live model. Fixtures are the no-key
 * path ONLY (ADR 0013): a failed LIVE call never falls back here.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function seedPath(locale: string): string {
  // es-419 keeps the original filename + FIXTURES_PATH test override; other
  // locales read glossaries/fixture-translations-<locale>.json.
  if (locale === "es-419") {
    return process.env.FIXTURES_PATH || join(process.cwd(), "glossaries", "fixture-translations.json");
  }
  return join(process.cwd(), "glossaries", `fixture-translations-${locale}.json`);
}

function loadSeededMap(locale: string): Record<string, string> {
  const path = seedPath(locale);
  if (existsSync(path)) {
    try {
      return JSON.parse(readFileSync(path, "utf8")) as Record<string, string>;
    } catch {
      /* fall through to built-ins */
    }
  }
  return {};
}

/** Test hook: clear the cached seed maps so a new FIXTURES_PATH is honoured. */
export function resetFixtureCache(): void {
  _cache.clear();
}

function normKey(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

// Built-in phrase map per locale (kept small; the seeded JSON enriches this).
const BUILTIN: Record<string, Record<string, string>> = {
  "es-419": { "global markets outlook": "Perspectiva de los mercados globales" },
};

// Compact EN→neutral-ES finance gloss for the last-resort word fallback.
const WORDS_ES: Record<string, string> = {
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

// Minimal EN→Traditional-Chinese finance gloss (no-key demo only; CJK has no
// inter-word spaces, so this produces code-switched text for unseeded input —
// acceptable for the offline path, never for a live failure).
const WORDS_ZH_HANT: Record<string, string> = {
  market: "市場", markets: "市場", equity: "股票", equities: "股票", stock: "股票", stocks: "股票",
  bond: "債券", bonds: "債券", yield: "收益率", yields: "收益率", growth: "增長", inflation: "通脹",
  rate: "利率", rates: "利率", portfolio: "投資組合", portfolios: "投資組合", investor: "投資者",
  investors: "投資者", investment: "投資", risk: "風險", returns: "回報", outlook: "展望",
  strategy: "策略", bank: "銀行", gold: "黃金", liquidity: "流動性", volatility: "波動",
  valuation: "估值", recession: "經濟衰退", tariffs: "關稅", semiconductor: "半導體",
};

const WORDS_BY_LOCALE: Record<string, Record<string, string>> = {
  "es-419": WORDS_ES,
  "zh-Hant": WORDS_ZH_HANT,
};

function wordGloss(source: string, words: Record<string, string>): string {
  return source
    .split(/(\s+)/)
    .map((tok) => {
      if (/^\s+$/.test(tok)) return tok;
      // preserve numbers, %, currency, tickers, punctuation-bound tokens
      if (/[\d%$€£]/.test(tok)) return tok;
      const lead = tok.match(/^[^\p{L}]*/u)?.[0] ?? "";
      const trail = tok.match(/[^\p{L}]*$/u)?.[0] ?? "";
      const core = tok.slice(lead.length, tok.length - trail.length);
      const repl = words[core.toLowerCase()];
      if (repl === undefined) return tok;
      // CJK targets don't case; Latin targets preserve leading capitalisation.
      const cased = /[A-Za-z]/.test(repl) && core[0] === core[0]?.toUpperCase()
        ? repl.charAt(0).toUpperCase() + repl.slice(1)
        : repl;
      return lead + cased + trail;
    })
    .join("");
}

const _cache = new Map<string, Record<string, string>>();

export function fixtureTranslateSegment(source: string, locale = "es-419"): string {
  let seeded = _cache.get(locale);
  if (!seeded) {
    seeded = { ...(BUILTIN[locale] ?? {}), ...loadSeededMap(locale) };
    _cache.set(locale, seeded);
  }
  const key = normKey(source);
  if (seeded[key]) return seeded[key];
  return wordGloss(source, WORDS_BY_LOCALE[locale] ?? WORDS_ES);
}
