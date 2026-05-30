/**
 * Validator contract (spec §10). Each validator is INDEPENDENT and TESTABLE,
 * runs OUTSIDE the LLM loop, and returns a structured result. `blocking: true`
 * failures prevent auto-pass at the quality gate (spec §15).
 *
 * Validators are pure functions of their input — no I/O, no shared state — so
 * they can be unit-tested in isolation and (optionally) generated/verified in
 * parallel.
 */
import type { LocaleConfig } from "@/src/lib/config";
import type {
  BlockType,
  Entity,
  GlossaryEntry,
  NeutralizationRule,
  ValidatorResult,
} from "@/src/lib/doc-model";

export type DisclaimerStatus = "exact" | "fuzzy" | "unknown" | "none";

export interface ValidatorInput {
  /** English source text of the block. */
  source: string;
  /** Spanish text under test (mt_text during the loop, final_text at gate). */
  target: string;
  /** Entities extracted from the source at PREPARE. */
  entities: Entity[];
  locale: LocaleConfig;
  glossary: GlossaryEntry[];
  rules: NeutralizationRule[];
  /** Do-Not-Translate tokens that must appear verbatim in the target. */
  dntTerms: string[];
  blockType: BlockType;
  /** Disclaimer routing decision from PREPARE (only set for disclaimer blocks). */
  disclaimer?: { status: DisclaimerStatus; tmScore?: number };
}

export type ValidatorFn = (input: ValidatorInput) => ValidatorResult;

export function pass(validator: ValidatorResult["validator"], blocking = false): ValidatorResult {
  return { validator, status: "pass", blocking, issues: [] };
}
