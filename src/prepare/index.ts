/**
 * PREPARE stage (spec §9 step 2): segment is already done by ingest; here we
 *   • extract entities (numbers/%/dates/currency/tickers/ISINs/...) + DNT names
 *   • tag disclaimer blocks and route them against approved TM
 *   • reuse exact Translation-Memory matches (skip re-translation)
 *
 * Glossary + active-rule application happens in the TRANSLATE post-pass
 * (src/memory/apply.ts) so it works identically for live and fixture paths.
 */
import { type LocaleConfig, getThresholds } from "@/src/lib/config";
import type {
  Block,
  GlossaryEntry,
  NeutralizationRule,
  TmEntry,
} from "@/src/lib/doc-model";
import { similarity } from "@/src/lib/similarity";
import { detectDntEntities } from "./dnt";
import { isDisclaimer, routeDisclaimer } from "./disclaimer";
import { extractEntities } from "./entities";

export interface PrepareInput {
  blocks: Block[];
  glossary: GlossaryEntry[];
  rules: NeutralizationRule[];
  tm: TmEntry[];
  locale: LocaleConfig;
}

/** Per-block disclaimer routing decision, threaded to VALIDATE by the orchestrator. */
export type DisclaimerStatusMap = Record<string, { status: "exact" | "fuzzy" | "unknown" | "none"; tmScore: number }>;

export interface PrepareResult {
  blocks: Block[];
  disclaimerStatus: DisclaimerStatusMap;
}

export function prepare(input: PrepareInput): PrepareResult {
  const { disclaimer_exact_match } = getThresholds();
  const disclaimerStatus: DisclaimerStatusMap = {};

  const blocks = input.blocks.map((b) => {
    const source = b.source_text;
    const entities = [...extractEntities(source), ...detectDntEntities(source)];
    let type = b.type;

    // Disclaimer detection overrides inferred type (unless it is a heading).
    if (type !== "title" && type !== "subhead" && isDisclaimer(source)) {
      type = "disclaimer";
    }

    const next: Block = { ...b, type, entities };

    if (type === "disclaimer") {
      const routing = routeDisclaimer(source, input.tm);
      disclaimerStatus[b.id] = { status: routing.status, tmScore: routing.tmScore };
      if (routing.status === "exact" && routing.tmTarget) {
        next.tm_match = { score: routing.tmScore, source: "TM", tm_id: routing.tmId };
        next.mt_text = routing.tmTarget;
        next.final_text = routing.tmTarget;
        next.seg_status = "locked"; // approved disclaimer is locked (spec §10)
      } else {
        next.tm_match = { score: routing.tmScore, source: routing.tmScore > 0 ? "TM" : "none", tm_id: routing.tmId };
      }
      return next;
    }

    disclaimerStatus[b.id] = { status: "none", tmScore: 0 };

    // General TM exact-match reuse for non-disclaimer segments (spec §9).
    let best: { score: number; entry?: TmEntry } = { score: 0 };
    for (const t of input.tm) {
      if (t.kind === "disclaimer" || t.superseded_by) continue;
      const s = similarity(source, t.source_text);
      if (s > best.score) best = { score: s, entry: t };
    }
    if (best.entry && best.score >= disclaimer_exact_match) {
      next.tm_match = { score: best.score, source: "TM", tm_id: best.entry.id };
      next.mt_text = best.entry.target_text;
      next.final_text = best.entry.target_text;
      next.seg_status = "accepted";
    }
    return next;
  });

  return { blocks, disclaimerStatus };
}
