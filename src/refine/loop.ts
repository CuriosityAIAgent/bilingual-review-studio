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

const majorCount = (flags: CriticFlag[]) =>
  flags.filter((f) => f.severity === "major" || f.severity === "critical").length;

export async function refineSegment(mt: string, ctx: RefineContext): Promise<RefineResult> {
  const { qe_threshold, max_iters, min_qe_gain } = getThresholds();

  let best = mt;
  let bestScore = await qe(ctx.source, best);
  let bestFlags = await critique(validatorInput(best, ctx));
  let i = 0;

  while ((bestScore < qe_threshold || majorCount(bestFlags) > 0) && i < max_iters) {
    const rewritten = await rewriteSegment(best, ctx.source, bestFlags);
    const cand = enforceMemory(rewritten, ctx); // active rules/glossary are hard constraints
    if (cand === best) break; // unchanged → stop
    const candScore = await qe(ctx.source, cand);
    const candFlags = await critique(validatorInput(cand, ctx));
    // Accept if it reduces major/critical flags (objective fix); QE is only the
    // tie-breaker. This prevents a flat-QE deterministic fix (e.g. billón →
    // mil millones) from being reverted, while still guarding against over-edit.
    const fewerMajors = majorCount(candFlags) < majorCount(bestFlags);
    const sameMajorsBetterQe =
      majorCount(candFlags) === majorCount(bestFlags) && candScore > bestScore + min_qe_gain;
    if (!fewerMajors && !sameMajorsBetterQe) break;
    best = cand;
    bestScore = candScore;
    bestFlags = candFlags;
    i += 1;
  }

  return { final: best, qe_score: bestScore, flags: bestFlags, iterations: i };
}
