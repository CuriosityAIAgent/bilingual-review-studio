/**
 * KPIs (spec §15). The HEADLINE is edits per 1,000 words — it should fall as
 * neutralization rules are learned. We deliberately avoid "average QE" as a
 * headline (it misleads — QE is routing only).
 */
import type { DocMetrics, DocModel, FlagCategory } from "@/src/lib/doc-model";

function wordCount(text: string): number {
  return (text.match(/\p{L}+/gu) ?? []).length;
}

export function computeMetrics(doc: DocModel): DocMetrics {
  const totalWords = doc.blocks.reduce((s, b) => s + wordCount(b.source_text), 0) || 1;

  // Human corrections = explicit edit/neutralize events in the append-only log.
  const humanEdits = doc.edit_log.filter((e) => e.action === "edit" || e.action === "neutralize");
  const edits_per_1k = Number(((humanEdits.length / totalWords) * 1000).toFixed(2));

  // HTER by error category.
  const hterByCat: Record<string, { sum: number; n: number }> = {};
  for (const e of doc.edit_log) {
    if (e.action !== "edit" && e.action !== "neutralize") continue;
    for (const cat of e.error_categories_corrected.length ? e.error_categories_corrected : (["accuracy"] as FlagCategory[])) {
      hterByCat[cat] ??= { sum: 0, n: 0 };
      hterByCat[cat].sum += e.hter;
      hterByCat[cat].n += 1;
    }
  }
  const hter_by_category: Record<string, number> = {};
  for (const [cat, { sum, n }] of Object.entries(hterByCat)) {
    hter_by_category[cat] = Number((sum / n).toFixed(3));
  }

  // Accept rate of model suggestions.
  const accepts = doc.edit_log.filter((e) => e.action === "accept").length;
  const rejects = doc.edit_log.filter((e) => e.action === "reject").length;
  const reviewer_accept_rate = accepts + rejects ? Number((accepts / (accepts + rejects)).toFixed(3)) : 0;

  // Validator failure rates across blocks.
  const blocks = doc.blocks.length || 1;
  const failRate = (validator: string) =>
    Number(
      (doc.blocks.filter((b) => b.validator_results.some((v) => v.validator === validator && v.status === "fail")).length / blocks).toFixed(3),
    );

  const time_to_approval_s =
    doc.approval.approved_at && doc.created_at
      ? Math.max(0, Math.round((Date.parse(doc.approval.approved_at) - Date.parse(doc.created_at)) / 1000))
      : 0;

  return {
    edits_per_1k,
    hter_by_category,
    number_fail_rate: failRate("number"),
    terminology_fail_rate: failRate("glossary"),
    regionalism_fail_rate: failRate("regionalism"),
    reviewer_accept_rate,
    time_to_approval_s,
  };
}

/** A point on the learning curve — edits/1k for one document over time (spec §1). */
export interface LearningPoint {
  doc_id: string;
  title: string;
  created_at: string;
  edits_per_1k: number;
}
