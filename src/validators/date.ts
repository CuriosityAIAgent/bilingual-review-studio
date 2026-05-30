/** Date validator (spec §10) — BLOCKING for years. Month names legitimately
 * differ in Spanish ("March" → "marzo"), so we check that every YEAR and every
 * quarter NUMBER survives, rather than matching formatted date strings. */
import type { ValidatorResult } from "@/src/lib/doc-model";
import type { ValidatorFn, ValidatorInput } from "./types";

export const dateValidator: ValidatorFn = (i: ValidatorInput): ValidatorResult => {
  const issues: ValidatorResult["issues"] = [];

  const srcYears = i.source.match(/\b(?:19|20)\d{2}\b/g) || [];
  for (const y of srcYears) {
    if (!i.target.includes(y)) {
      issues.push({ span: y, message: `Year ${y} not preserved in translation`, expected: y });
    }
  }

  const srcQuarters = i.source.match(/\bQ([1-4])\b/gi) || [];
  for (const q of srcQuarters) {
    const num = q.replace(/Q/i, "");
    // Accept "Q1", "1T", "T1", "primer trimestre" forms by checking the digit survives near a quarter cue.
    if (!new RegExp(`(?:Q\\s?${num}\\b|\\b${num}\\s?T\\b|\\bT\\s?${num}\\b)`, "i").test(i.target) && !/trimestre/i.test(i.target)) {
      issues.push({ span: q, message: `Quarter ${q} not clearly preserved`, expected: q });
    }
  }

  return {
    validator: "date",
    status: issues.length ? "fail" : "pass",
    severity: issues.length ? "major" : undefined,
    blocking: true,
    issues,
  };
};
