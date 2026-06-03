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
import { humanReviewReasons } from "@/src/lib/doc-model";

export type GateRoute = "auto_pass" | "human_review";

export interface GateDecision {
  route: GateRoute;
  reasons: string[];
}

export function gateBlock(block: Block, opts: { ocrUsed?: boolean } = {}): GateDecision {
  // Already accepted/locked (e.g. exact TM disclaimer) → auto.
  if (block.seg_status === "locked" || block.seg_status === "accepted") {
    return { route: "auto_pass", reasons: ["already accepted/locked"] };
  }
  // Shared, single-source human-review triggers (validators, critic, disclaimer,
  // QE) — same logic the queue/card metric and the outline use. Gate adds OCR.
  const { human_floor } = getThresholds();
  const reasons = humanReviewReasons(block, human_floor);
  if (opts.ocrUsed) reasons.push("OCR-derived content");
  return { route: reasons.length ? "human_review" : "auto_pass", reasons };
}
