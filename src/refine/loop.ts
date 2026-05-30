/**
 * The gated cross-model loop (spec §9 — the core differentiator).
 *
 * A model cannot reliably critique its own output, and on a high-resource pair
 * like EN→ES the first draft is usually already good — so a FORCED rewrite loop
 * over-edits and degrades acceptable text. Therefore:
 *   1. force ONE structured critique pass,
 *   2. iterate ONLY on segments that objectively fail (low QE or major flags),
 *   3. re-score after every rewrite and REVERT if it did not improve (anti over-edit),
 *   4. stop early; hard cap at MAX_ITERS.
 *
 * QE is a routing signal only (spec §15). Validators (run separately at VALIDATE)
 * and humans are authoritative.
 */
import { type LocaleConfig, getThresholds } from "@/src/lib/config";
import type {
  Block,
  CriticFlag,
  Entity,
  GlossaryEntry,
  NeutralizationRule,
} from "@/src/lib/doc-model";
import { hasMajorOrCriticalFlag } from "@/src/lib/doc-model";
import { critique } from "@/src/evaluate/critic";
import { qe } from "@/src/evaluate/qe";
import { applyGlossary, applyRules } from "@/src/memory/apply";
import type { ValidatorInput, DisclaimerStatus } from "@/src/validators/types";
import { rewriteSegment } from "./rewrite";

export interface RefineContext {
  source: string;
  entities: Entity[];
  locale: LocaleConfig;
  glossary: GlossaryEntry[];
  rules: NeutralizationRule[];
  dntTerms: string[];
  blockType: Block["type"];
  disclaimer?: { status: DisclaimerStatus; tmScore?: number };
}

export interface RefineResult {
  final: string;
  qe_score: number;
  flags: CriticFlag[];
  iterations: number;
}

function validatorInput(target: string, ctx: RefineContext): ValidatorInput {
  return {
    source: ctx.source,
    target,
    entities: ctx.entities,
    locale: ctx.locale,
    glossary: ctx.glossary,
    rules: ctx.rules,
    dntTerms: ctx.dntTerms,
    blockType: ctx.blockType,
    disclaimer: ctx.disclaimer,
  };
}

/** Enforce active rules + glossary deterministically (used after each rewrite). */
function enforceMemory(text: string, ctx: RefineContext): string {
  const r = applyRules(text, ctx.rules);
  const g = applyGlossary(r.text, ctx.glossary);
  return g.text;
}

export async function refineSegment(mt: string, ctx: RefineContext): Promise<RefineResult> {
  const { qe_threshold, max_iters, min_qe_gain } = getThresholds();

  let best = mt;
  let bestScore = qe(ctx.source, best);
  let flags = await critique(validatorInput(best, ctx));
  let i = 0;

  while ((bestScore < qe_threshold || hasMajorOrCriticalFlag({ critic_flags: flags } as Block)) && i < max_iters) {
    const rewritten = await rewriteSegment(best, ctx.source, flags);
    const cand = enforceMemory(rewritten, ctx); // active rules/glossary are hard constraints
    const candScore = qe(ctx.source, cand);
    // No gain → keep best (anti over-edit). Also stop if text is unchanged.
    if (candScore <= bestScore + min_qe_gain || cand === best) break;
    best = cand;
    bestScore = candScore;
    flags = await critique(validatorInput(best, ctx));
    i += 1;
  }

  return { final: best, qe_score: bestScore, flags, iterations: i };
}
