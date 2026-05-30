/** English-leakage validator (spec §10). Detects residual untranslated English
 * in the Spanish target. Uses a curated set of unambiguously-English words (none
 * of which are valid Spanish) to avoid false positives on cognates. Small leaks
 * are advisory (minor, non-blocking); larger leaks block auto-pass. */
import type { ValidatorResult } from "@/src/lib/doc-model";
import type { ValidatorFn, ValidatorInput } from "./types";

// Unambiguously English tokens — deliberately excludes Spanish-valid words.
const ENGLISH_ONLY = new Set([
  "the", "and", "of", "for", "with", "this", "that", "these", "those", "from",
  "growth", "market", "markets", "yield", "earnings", "however", "therefore",
  "quarter", "outlook", "forecast", "guidance", "wealth", "income", "however",
  "report", "performance", "investment", "investors", "throughout", "during",
  "increase", "decrease", "overweight", "underweight", "we", "our", "their",
]);

export const englishLeakageValidator: ValidatorFn = (i: ValidatorInput): ValidatorResult => {
  const issues: ValidatorResult["issues"] = [];
  const seen = new Set<string>();
  const words = i.target.toLowerCase().match(/[a-z']+/g) ?? [];
  for (const w of words) {
    if (ENGLISH_ONLY.has(w) && !seen.has(w)) {
      seen.add(w);
      issues.push({ span: w, message: `Residual English word "${w}" in the Spanish target` });
    }
  }
  const leak = issues.length;
  return {
    validator: "english_leakage",
    status: leak ? "fail" : "pass",
    severity: leak >= 3 ? "major" : leak ? "minor" : undefined,
    blocking: leak >= 3,
    issues,
  };
};
