/**
 * Disclaimer detection + TM routing (spec §7, §10). Regulated boilerplate must
 * never be freely machine-translated. A heuristic tags disclaimer blocks; they
 * are then routed against the approved Spanish TM:
 *   • exact   → auto-fill + lock from approved TM
 *   • fuzzy   → Compliance (never auto-approve)
 *   • unknown → block publish until approved wording is added
 */
import { getThresholds } from "@/src/lib/config";
import type { TmEntry } from "@/src/lib/doc-model";
import { similarity } from "@/src/lib/similarity";
import type { DisclaimerStatus } from "@/src/validators/types";

const DISCLAIMER_CUES = [
  /informational purposes/i,
  /past performance/i,
  /not (?:investment|tax|legal) advice/i,
  /no(?:t a)? guarantee/i,
  /for institutional (?:investors|use)/i,
  /subject to change without notice/i,
  /consult (?:your|a) (?:financial|tax|legal)/i,
  /this (?:document|material|communication) (?:is|does not)/i,
  /capital at risk/i,
  /may (?:go down|lose value)/i,
  /\bdisclaimer\b/i,
  /indicative (?:only|and)/i,
];

export function isDisclaimer(text: string): boolean {
  return DISCLAIMER_CUES.some((re) => re.test(text));
}

export interface DisclaimerRouting {
  status: DisclaimerStatus;
  tmScore: number;
  tmId?: string;
  tmTarget?: string;
}

export function routeDisclaimer(source: string, tm: TmEntry[]): DisclaimerRouting {
  const { disclaimer_exact_match, disclaimer_fuzzy_low } = getThresholds();
  const candidates = tm.filter((t) => t.kind === "disclaimer" && !t.superseded_by);
  let best: { score: number; entry?: TmEntry } = { score: 0 };
  for (const entry of candidates) {
    const s = similarity(source, entry.source_text);
    if (s > best.score) best = { score: s, entry };
  }
  if (best.entry && best.score >= disclaimer_exact_match) {
    return { status: "exact", tmScore: best.score, tmId: best.entry.id, tmTarget: best.entry.target_text };
  }
  if (best.entry && best.score >= disclaimer_fuzzy_low) {
    return { status: "fuzzy", tmScore: best.score, tmId: best.entry.id, tmTarget: best.entry.target_text };
  }
  return { status: "unknown", tmScore: best.score };
}
