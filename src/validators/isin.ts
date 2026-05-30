/** ISIN validator (spec §10) — BLOCKING for preservation. Also verifies the ISIN
 * check digit (ISO 6166) and flags a malformed source ISIN as a data-quality
 * issue (non-blocking). */
import type { ValidatorResult } from "@/src/lib/doc-model";
import type { ValidatorFn, ValidatorInput } from "./types";

/** ISO 6166 check-digit validation (Luhn over the letter-expanded digit string). */
export function isValidIsin(isin: string): boolean {
  if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) return false;
  const expanded = isin
    .split("")
    .map((c) => (/[A-Z]/.test(c) ? (c.charCodeAt(0) - 55).toString() : c))
    .join("");
  let sum = 0;
  let dbl = true; // double starting from the rightmost-but-one, moving left
  for (let k = expanded.length - 2; k >= 0; k--) {
    let d = expanded.charCodeAt(k) - 48;
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  const check = (10 - (sum % 10)) % 10;
  return check === expanded.charCodeAt(expanded.length - 1) - 48;
}

export const isinValidator: ValidatorFn = (i: ValidatorInput): ValidatorResult => {
  const issues: ValidatorResult["issues"] = [];
  let severity: ValidatorResult["severity"] = "minor";
  for (const e of i.entities) {
    if (e.kind !== "isin") continue;
    if (!i.target.includes(e.text)) {
      issues.push({ span: e.text, message: `ISIN ${e.text} not preserved in translation`, expected: e.text });
      severity = "critical";
    } else if (!isValidIsin(e.text)) {
      issues.push({ span: e.text, message: `Source ISIN ${e.text} fails the ISO 6166 check digit (data quality)` });
    }
  }
  return {
    validator: "isin",
    status: issues.length ? "fail" : "pass",
    severity: issues.length ? severity : undefined,
    blocking: issues.some((x) => x.expected !== undefined),
    issues,
  };
};
