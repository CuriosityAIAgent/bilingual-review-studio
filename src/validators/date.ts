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

  // Ordinal words per quarter, so "Q3" cannot pass as "primer trimestre".
  const ORDINALS: Record<string, string[]> = {
    "1": ["primer", "primero", "1.º", "1er"],
    "2": ["segundo", "2.º", "2do"],
    "3": ["tercer", "tercero", "3.º", "3er"],
    "4": ["cuarto", "4.º", "4to"],
  };
  const srcQuarters = i.source.match(/\bQ([1-4])\b/gi) || [];
  for (const q of srcQuarters) {
    const num = q.replace(/Q/i, "");
    const digitForm = new RegExp(`(?:Q\\s?${num}\\b|\\b${num}\\s?T\\b|\\bT\\s?${num}\\b)`, "i").test(i.target);
    const ordForm =
      /trimestre/i.test(i.target) &&
      (ORDINALS[num] ?? []).some((o) => new RegExp(o.replace(/[.]/g, "\\."), "i").test(i.target));
    if (!digitForm && !ordForm) {
      issues.push({ span: q, message: `Quarter ${q} not clearly preserved (wrong or missing quarter)`, expected: q });
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
