/** Do-Not-Translate validator (spec §10) — BLOCKING. Product names, legal
 * entities and other DNT tokens must appear verbatim in the translation. */
import type { ValidatorResult } from "@/src/lib/doc-model";
import type { ValidatorFn, ValidatorInput } from "./types";

export const dntValidator: ValidatorFn = (i: ValidatorInput): ValidatorResult => {
  const issues: ValidatorResult["issues"] = [];
  for (const term of i.dntTerms) {
    if (!term.trim()) continue;
    // Only enforce DNT terms that actually appear in the source.
    if (i.source.includes(term) && !i.target.includes(term)) {
      issues.push({ span: term, message: `DNT token "${term}" was altered or dropped`, expected: term });
    }
  }
  return {
    validator: "dnt",
    status: issues.length ? "fail" : "pass",
    severity: issues.length ? "major" : undefined,
    blocking: true,
    issues,
  };
};
