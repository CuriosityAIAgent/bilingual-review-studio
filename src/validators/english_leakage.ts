/** English-leakage validator (spec §10). Detects residual untranslated English
 * in the Spanish target. Uses a curated set of unambiguously-English words (none
 * of which are valid Spanish) to avoid false positives on cognates. Small leaks
 * are advisory (minor, non-blocking); larger leaks block auto-pass. */
import type { ValidatorResult } from "@/src/lib/doc-model";
import { residualEnglishWords } from "@/src/lib/leakage-words";
import type { ValidatorFn, ValidatorInput } from "./types";

export const englishLeakageValidator: ValidatorFn = (i: ValidatorInput): ValidatorResult => {
  // Ignore kept-in-English names (DNT terms + entities) so a legitimate product
  // name like "Global Income Fund" isn't flagged as leakage. Shared with the QE
  // translatedness cap so the gate and the routing signal agree.
  const leaked = residualEnglishWords(i.target, { dntTerms: i.dntTerms, entities: i.entities });
  const issues: ValidatorResult["issues"] = leaked.map((w) => ({
    span: w,
    message: `Residual English word "${w}" in the Spanish target`,
  }));
  const leak = issues.length;
  return {
    validator: "english_leakage",
    status: leak ? "fail" : "pass",
    severity: leak >= 3 ? "major" : leak ? "minor" : undefined,
    blocking: leak >= 3,
    issues,
  };
};
