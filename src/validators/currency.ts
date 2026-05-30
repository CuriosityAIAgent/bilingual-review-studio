/** Currency-unit validator (spec §10) — BLOCKING. The amount is checked by the
 * number validator; here we ensure the currency UNIT (symbol or ISO code) is not
 * dropped or silently changed. "USD 1.2 billion" must not lose its "USD". */
import type { ValidatorResult } from "@/src/lib/doc-model";
import type { ValidatorFn, ValidatorInput } from "./types";

const UNITS = ["USD", "EUR", "GBP", "CHF", "JPY", "$", "€", "£"];

function counts(text: string): Record<string, number> {
  const up = text.toUpperCase();
  const out: Record<string, number> = {};
  for (const u of UNITS) {
    const re = new RegExp(u === "$" || u === "€" || u === "£" ? `\\${u}` : `\\b${u}\\b`, "g");
    out[u] = (up.match(re) || []).length;
  }
  return out;
}

export const currencyValidator: ValidatorFn = (i: ValidatorInput): ValidatorResult => {
  const issues: ValidatorResult["issues"] = [];
  const s = counts(i.source);
  const t = counts(i.target);
  for (const u of UNITS) {
    if (s[u] > t[u]) {
      issues.push({
        span: u,
        message: `Currency unit "${u}" dropped (${s[u]} → ${t[u]})`,
        expected: `${s[u]}× ${u}`,
        found: `${t[u]}× ${u}`,
      });
    }
  }
  return {
    validator: "currency",
    status: issues.length ? "fail" : "pass",
    severity: issues.length ? "major" : undefined,
    blocking: true,
    issues,
  };
};
