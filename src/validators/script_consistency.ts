/** Script-consistency validator — the zh-Hant analog of regionalism neutralization.
 *
 * The cardinal Traditional-Chinese error is mixing Simplified characters into a
 * Traditional translation (e.g. a stray 国 in otherwise-繁體 text). This flags any
 * Simplified-only glyph in a zh-Hant target and routes it to a human — the same
 * "blocks auto-pass" treatment regionalisms get for Spanish.
 *
 * Self-gates by locale (no-op for any non-zh-Hant target), so it lives in the
 * shared validator registry and runs harmlessly on es-419 docs. The Simplified
 * character set lives in ./zh-script. */
import type { ValidatorResult } from "@/src/lib/doc-model";
import type { ValidatorFn, ValidatorInput } from "./types";
import { SIMPLIFIED_ONLY } from "./zh-script";

export const scriptConsistencyValidator: ValidatorFn = (i: ValidatorInput): ValidatorResult => {
  const pass: ValidatorResult = { validator: "script_consistency", status: "pass", blocking: true, issues: [] };
  // v1: only Traditional Chinese has a script-purity rule (Simplified target added
  // with its own forbidden-Traditional set when zh-Hans lands).
  if (i.locale.locale !== "zh-Hant") return pass;

  const seen = new Set<string>();
  const issues: ValidatorResult["issues"] = [];
  for (const ch of i.target) {
    if (SIMPLIFIED_ONLY.has(ch) && !seen.has(ch)) {
      seen.add(ch);
      issues.push({
        span: ch,
        message: `Simplified character “${ch}” in a Traditional (zh-Hant) translation — render it in Traditional script`,
      });
    }
  }
  if (issues.length === 0) return pass;
  return {
    validator: "script_consistency",
    status: "fail",
    // Major (routes to human / blocks auto-pass), not a hard publish-block like a disclaimer.
    severity: "major",
    blocking: true,
    issues,
  };
};
