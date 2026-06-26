/** Script-consistency validator — the Chinese analog of regionalism neutralization.
 *
 * The cardinal Chinese error is mixing scripts: a Simplified glyph in a Traditional
 * translation, or vice-versa (e.g. a stray 国 in otherwise-繁體 text). This flags any
 * wrong-script character in a Chinese target and routes it to a human — the same
 * "blocks auto-pass" treatment regionalisms get for Spanish.
 *
 * Direction comes from the locale config: `script: "traditional"` forbids
 * Simplified glyphs; `script: "simplified"` forbids Traditional ones. Locales with
 * no `script` (es-419) are a no-op, so this lives in the shared validator registry
 * and runs harmlessly on every doc. The character sets live in ./zh-script. */
import type { ValidatorResult } from "@/src/lib/doc-model";
import type { ValidatorFn, ValidatorInput } from "./types";
import { SIMPLIFIED_ONLY, TRADITIONAL_ONLY } from "./zh-script";

export const scriptConsistencyValidator: ValidatorFn = (i: ValidatorInput): ValidatorResult => {
  const pass: ValidatorResult = { validator: "script_consistency", status: "pass", blocking: true, issues: [] };

  // Forbidden set = the OTHER script's characters. No script → no rule.
  const forbidden =
    i.locale.script === "traditional" ? SIMPLIFIED_ONLY
    : i.locale.script === "simplified" ? TRADITIONAL_ONLY
    : null;
  if (!forbidden) return pass;

  const wrongScript = i.locale.script === "traditional" ? "Simplified" : "Traditional";
  const wantScript = i.locale.script === "traditional" ? "Traditional" : "Simplified";

  const seen = new Set<string>();
  const issues: ValidatorResult["issues"] = [];
  for (const ch of i.target) {
    if (forbidden.has(ch) && !seen.has(ch)) {
      seen.add(ch);
      issues.push({
        span: ch,
        message: `${wrongScript} character “${ch}” in a ${wantScript} (${i.locale.locale}) translation — render it in ${wantScript} script`,
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
