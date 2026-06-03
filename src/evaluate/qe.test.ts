import { describe, expect, it } from "vitest";
import type { Entity } from "@/src/lib/doc-model";
import { residualEnglishWords, stripAllowedNames } from "@/src/lib/leakage-words";
import { qe, translatednessCap } from "./qe";

const ent = (text: string, kind: Entity["kind"] = "entity"): Entity => ({ kind, text, norm: text.toLowerCase() });

// The bug this fix targets: a cross-lingual cosine rewards a copy of the source,
// so an untranslated/code-switched draft scored ~1.0. The translatedness cap is
// the deterministic guard. These tests run on the VITEST heuristic+cap path.
describe("translatednessCap", () => {
  it("hard-caps a code-switched draft that copies the English source", () => {
    const source =
      "the region is entering a period in which political outcomes are increasingly determining macro-outcomes";
    const garbled =
      "el region is entering a period en which political outcomes are increasingly determining macro-outcomes";
    expect(translatednessCap(source, garbled)).toBeLessThanOrEqual(0.25);
  });

  it("caps an exact copy of the source", () => {
    const s = "the market outlook remains strong for investors this quarter";
    expect(translatednessCap(s, s)).toBeLessThanOrEqual(0.25);
  });

  it("does NOT penalise a real Spanish translation that shares names + figures", () => {
    const source = "BlackRock expects the S&P 500 to reach 7000 this year";
    const target = "BlackRock espera que el S&P 500 llegue a 7000 este año";
    const opts = { dntTerms: ["BlackRock"], entities: [ent("BlackRock", "fund"), ent("S&P 500", "index")] };
    expect(translatednessCap(source, target, opts)).toBe(1);
  });

  it("does NOT penalise identical-spelling cognates", () => {
    const source = "global markets and total natural capital";
    const target = "los mercados globales y el capital natural total";
    expect(translatednessCap(source, target)).toBe(1);
  });

  it("does not judge overlap on very short segments (proper noun shared)", () => {
    const source = "Apple rose sharply";
    const target = "Apple subió con fuerza";
    expect(translatednessCap(source, target, { entities: [ent("Apple")] })).toBe(1);
  });

  it("does NOT penalise a cognate-rich correct translation", () => {
    // Codex's example: every shared word is a real Spanish cognate (-al / accent).
    const source = "digital fiscal policy and industrial capital";
    const target = "política fiscal digital y capital industrial";
    expect(translatednessCap(source, target)).toBe(1);
  });

  it("caps a short heading copied verbatim from the source", () => {
    expect(translatednessCap("Market outlook", "Market outlook")).toBeLessThanOrEqual(0.4);
  });

  it("does NOT cap a correctly translated short heading", () => {
    expect(translatednessCap("Market outlook", "Perspectiva del mercado")).toBe(1);
  });

  it("does NOT count allowed DNT/entity English names as leakage", () => {
    // "Market Outlook Report" is a kept-in-English name = 3 ENGLISH_ONLY words,
    // but it's an allowed entity, so it must not trip the leak cap.
    const source = "the Market Outlook Report is positive for clients";
    const target = "el Market Outlook Report es positivo para los clientes";
    const opts = { dntTerms: ["Market Outlook Report"], entities: [ent("Market Outlook Report", "fund")] };
    expect(translatednessCap(source, target, opts)).toBe(1);
  });

  it("still catches untranslated words reused outside an allowed entity name", () => {
    // "Global Income Fund" is exempt as a phrase, but the stray English
    // "strong income" left untranslated must still pull the cap below 1.
    const source = "the Global Income Fund posted strong income this quarter";
    const target = "el Global Income Fund registró strong income este trimestre";
    const opts = { dntTerms: ["Global Income Fund"], entities: [ent("Global Income Fund", "fund")] };
    expect(translatednessCap(source, target, opts)).toBeLessThan(1);
  });

  it("caps at <=0.4 when >=3 unambiguous English words leak through", () => {
    // overlap is 0 (no shared content words) — isolates the leak signal.
    const cap = translatednessCap("uno dos tres", "the growth and outlook of foo bar baz");
    expect(cap).toBeLessThanOrEqual(0.4);
  });
});

describe("stripAllowedNames", () => {
  it("removes a name only at word boundaries, not inside other words", () => {
    // "US" as a DNT acronym must not corrupt "ajustes".
    const out = stripAllowedNames("hicimos ajustes en US este mes", { dntTerms: ["US"] });
    expect(out).toMatch(/ajustes/); // not mangled
    expect(out).not.toMatch(/(?<![\p{L}])US(?![\p{L}])/u); // standalone US gone
  });

  it("removes a multi-word/symbol name as a whole phrase", () => {
    expect(stripAllowedNames("el S&P 500 subió", { dntTerms: ["S&P 500"] })).not.toContain("S&P 500");
  });

  it("does not let a single common-word name hide stray leakage of that word", () => {
    // "Growth" share class kept in English, but a stray untranslated "growth"
    // elsewhere must still be detected (single common-word names aren't stripped).
    const words = residualEnglishWords("el fondo Growth y the growth del mercado", { dntTerms: ["Growth"] });
    expect(words).toContain("growth");
  });
});

describe("qe() end-to-end (heuristic + cap)", () => {
  it("REGRESSION: a garbled half-English draft no longer scores high", async () => {
    const source =
      "the region is entering a period in which political outcomes are increasingly determining macro-outcomes";
    const garbled =
      "el region is entering a period en which political outcomes are increasingly determining macro-outcomes";
    expect(await qe(source, garbled)).toBeLessThan(0.5);
  });

  it("a clean Spanish translation sharing names/figures still scores well", async () => {
    const source = "BlackRock expects the S&P 500 to reach 7000 this year";
    const target = "BlackRock espera que el S&P 500 llegue a 7000 este año";
    const score = await qe(source, target, {
      dntTerms: ["BlackRock"],
      entities: [ent("BlackRock", "fund"), ent("S&P 500", "index")],
    });
    expect(score).toBeGreaterThanOrEqual(0.7);
  });

  it("an empty target scores 0", async () => {
    expect(await qe("the market is up", "")).toBe(0);
  });
});
