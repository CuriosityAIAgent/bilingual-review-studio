/**
 * Quality policy (spec §15). QE is a ROUTING signal only — never an approval
 * signal. Deterministic validators and human approval are authoritative.
 *
 * Auto-pass eligible: no critical/major validator failure · no disclaimer issue
 * · no major critic flag · no unresolved glossary/regionalism violation · QE
 * above the calibrated threshold.
 *
 * Human-review required: low QE · any critical/major flag · disclaimer fuzzy or
 * unknown · OCR-derived content · (later) raster-chart text / numeric-dense tables.
 */
import { getThresholds } from "@/src/lib/config";
import type { Block } from "@/src/lib/doc-model";
import { hasBlockingValidatorFailure } from "@/src/lib/doc-model";

export type GateRoute = "auto_pass" | "human_review";

export interface GateDecision {
  route: GateRoute;
  reasons: string[];
}

export function gateBlock(block: Block, opts: { ocrUsed?: boolean } = {}): GateDecision {
  const { human_floor } = getThresholds();
  const reasons: string[] = [];

  // Already accepted/locked (e.g. exact TM disclaimer) → auto.
  if (block.seg_status === "locked" || block.seg_status === "accepted") {
    return { route: "auto_pass", reasons: ["already accepted/locked"] };
  }

  if (hasBlockingValidatorFailure(block)) {
    for (const v of block.validator_results) {
      if (v.status === "fail" && v.blocking) reasons.push(`validator:${v.validator} (${v.severity ?? "fail"})`);
    }
  }
  const majorFlags = block.critic_flags.filter((f) => f.severity === "major" || f.severity === "critical");
  if (majorFlags.length) reasons.push(`critic:${majorFlags.length} major/critical flag(s)`);

  // Any disclaimer reaching here is NOT an exact TM match (those are locked and
  // returned above), so it must be reviewed by Compliance (spec §10).
  if (block.type === "disclaimer") {
    reasons.push("disclaimer: not an exact approved-TM match");
  }
  if (block.qe_score !== null && block.qe_score < human_floor) {
    reasons.push(`QE ${block.qe_score} below human floor ${human_floor}`);
  }
  if (opts.ocrUsed) reasons.push("OCR-derived content");

  return { route: reasons.length ? "human_review" : "auto_pass", reasons };
}
