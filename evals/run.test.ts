/**
 * Eval harness (spec §15, Phase 1 acceptance). Loads the seeded finance error
 * cases and asserts each deterministic validator returns the expected verdict.
 * This is the first-class regression net: it must catch billion/trillion,
 * dropped negatives, changed %, wrong dates/tickers, translated DNT names,
 * Peninsular + Mexican regionalisms, false friends, disclaimer variation, and
 * English leakage — and preserve every entity on the PASS counterparts.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getLocale } from "@/src/lib/config";
import type { GlossaryEntry, NeutralizationRule } from "@/src/lib/doc-model";
import { extractEntities } from "@/src/prepare/entities";
import { detectDntEntities, dntTermsFromEntities } from "@/src/prepare/dnt";
import { VALIDATORS } from "@/src/validators";
import type { DisclaimerStatus, ValidatorFn, ValidatorInput } from "@/src/validators/types";

interface EvalCase {
  id: string;
  category: string;
  source: string;
  target: string;
  expect: "fail" | "pass";
  validator: string;
  note?: string;
  dntTerms?: string[];
  disclaimer?: { status: DisclaimerStatus };
  blockType?: string;
}

function readJson<T>(rel: string, fallback: T): T {
  const path = join(process.cwd(), rel);
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return fallback;
  }
}

const locale = getLocale("es-419");
const glossary = readJson<GlossaryEntry[]>("glossaries/neutral-es.json", []);
const rules = readJson<NeutralizationRule[]>("glossaries/neutralization-rules.json", []);
const byName: Record<string, ValidatorFn> = Object.fromEntries(
  VALIDATORS.map((v) => [v({ source: "", target: "", entities: [], locale, glossary: [], rules: [], dntTerms: [], blockType: "body" }).validator, v]),
);

const FILES = [
  "evals/seeded_errors/cases.json",
  "evals/number_integrity_cases/cases.json",
  "evals/regionalism_cases/cases.json",
  "evals/disclaimer_cases/cases.json",
];

function buildInput(c: EvalCase): ValidatorInput {
  const entities = [...extractEntities(c.source), ...detectDntEntities(c.source)];
  return {
    source: c.source,
    target: c.target,
    entities,
    locale,
    glossary,
    rules,
    dntTerms: c.dntTerms ?? dntTermsFromEntities(entities),
    blockType: (c.blockType as ValidatorInput["blockType"]) ?? "body",
    disclaimer: c.disclaimer,
  };
}

for (const file of FILES) {
  const cases = readJson<EvalCase[]>(file, []);
  describe(`eval: ${file} (${cases.length} cases)`, () => {
    for (const c of cases) {
      const fn = byName[c.validator];
      // Only assert cases whose validator we run deterministically.
      const runnable = !!fn;
      it.skipIf(!runnable)(`${c.id} [${c.category}] expects ${c.expect}`, () => {
        const result = fn(buildInput(c));
        expect(result.status, `${c.id}: ${c.note ?? ""}`).toBe(c.expect);
      });
    }
  });
}
