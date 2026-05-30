/** Ticker validator (spec §10) — BLOCKING. Tickers are identifiers and must
 * appear verbatim in the translation (they are effectively DNT). */
import type { ValidatorResult } from "@/src/lib/doc-model";
import type { ValidatorFn, ValidatorInput } from "./types";

export const tickerValidator: ValidatorFn = (i: ValidatorInput): ValidatorResult => {
  const issues: ValidatorResult["issues"] = [];
  for (const e of i.entities) {
    if (e.kind !== "ticker") continue;
    // Compare the bare symbol (strip $ and parens) for resilience to spacing.
    const sym = e.text.replace(/[$()]/g, "").replace(/^(?:NYSE|NASDAQ|LSE):?/i, "").trim();
    if (sym && !i.target.includes(sym)) {
      issues.push({ span: e.text, message: `Ticker "${sym}" not preserved in translation`, expected: sym });
    }
  }
  return {
    validator: "ticker",
    status: issues.length ? "fail" : "pass",
    severity: issues.length ? "major" : undefined,
    blocking: true,
    issues,
  };
};
