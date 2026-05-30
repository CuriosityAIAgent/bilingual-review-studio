/** Disclaimer-policy validator (spec §10) — BLOCKS PUBLISH. Regulated boilerplate
 * must never be freely machine-translated. Routing decision is computed in
 * PREPARE against the approved Spanish TM:
 *   • exact   → auto-filled + locked from approved TM            → pass
 *   • fuzzy   → route to Compliance, never auto-approve          → fail (major, blocking)
 *   • unknown → block publish until approved wording is added    → fail (critical, blocking)
 * Non-disclaimer blocks pass trivially. */
import type { ValidatorResult } from "@/src/lib/doc-model";
import type { ValidatorFn, ValidatorInput } from "./types";

export const disclaimerValidator: ValidatorFn = (i: ValidatorInput): ValidatorResult => {
  if (i.blockType !== "disclaimer") {
    return { validator: "disclaimer", status: "pass", blocking: false, issues: [] };
  }
  const status = i.disclaimer?.status ?? "unknown";
  if (status === "exact") {
    return { validator: "disclaimer", status: "pass", blocking: true, issues: [] };
  }
  if (status === "fuzzy") {
    return {
      validator: "disclaimer",
      status: "fail",
      severity: "major",
      blocking: true,
      issues: [{
        span: i.source.slice(0, 60),
        message: "Disclaimer is a FUZZY match to approved TM — route to Compliance; do not auto-approve.",
      }],
    };
  }
  return {
    validator: "disclaimer",
    status: "fail",
    severity: "critical",
    blocking: true,
    issues: [{
      span: i.source.slice(0, 60),
      message: "Unknown disclaimer — publish blocked until approved Spanish wording is added to the TM.",
    }],
  };
};
