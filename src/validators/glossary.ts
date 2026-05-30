/** Glossary/terminology validator (spec §10) — BLOCKING. Every glossary source
 * term that appears in the English source must render as its approved Spanish
 * target, and no forbidden variant may appear in the translation. */
import type { ValidatorResult } from "@/src/lib/doc-model";
import type { ValidatorFn, ValidatorInput } from "./types";

function hasWord(text: string, term: string): boolean {
  return new RegExp(`(?<![\\p{L}\\p{N}])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "iu").test(text);
}

export const glossaryValidator: ValidatorFn = (i: ValidatorInput): ValidatorResult => {
  const issues: ValidatorResult["issues"] = [];
  for (const g of i.glossary) {
    // Enforce only governed (active/approved) glossary terms (spec §13).
    if (g.state !== "active" && g.state !== "approved") continue;
    // Forbidden variants must never appear in the target.
    for (const forbidden of g.forbidden_terms ?? []) {
      if (hasWord(i.target, forbidden)) {
        issues.push({
          span: forbidden,
          message: `Forbidden term "${forbidden}" used; approved term is "${g.approved_target}"`,
          expected: g.approved_target,
          found: forbidden,
        });
      }
    }
    // If the source uses the glossary's source term, the approved target should appear.
    if (hasWord(i.source, g.source) && !hasWord(i.target, g.approved_target)) {
      issues.push({
        span: g.source,
        message: `Source term "${g.source}" should render as "${g.approved_target}"`,
        expected: g.approved_target,
      });
    }
  }
  return {
    validator: "glossary",
    status: issues.length ? "fail" : "pass",
    severity: issues.length ? "major" : undefined,
    blocking: true,
    issues,
  };
};
