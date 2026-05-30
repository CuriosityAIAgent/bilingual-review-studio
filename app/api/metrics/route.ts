/** GET /api/metrics — the killer metric (spec §1, §15): the learning curve of
 *  edits-per-1,000-words over documents, plus rule-application and regionalism
 *  trend signals. */
import { ensureSeeded } from "@/src/memory/seed";
import { ok } from "@/src/server/context";
import { getStore } from "@/src/store";

export async function GET() {
  const store = getStore();
  await ensureSeeded(store);
  const [summaries, rules] = await Promise.all([store.listDocs(), store.getRules()]);

  const curve = [...summaries]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((s) => ({ doc_id: s.doc_id, title: s.title, created_at: s.created_at, edits_per_1k: s.edits_per_1k }));

  const activeRules = rules.filter((r) => r.state === "active" || r.state === "approved");
  const totalRuleHits = rules.reduce((sum, r) => sum + r.hits, 0);

  const first = curve[0]?.edits_per_1k ?? 0;
  const last = curve[curve.length - 1]?.edits_per_1k ?? 0;
  const reductionPct = first > 0 ? Number((((first - last) / first) * 100).toFixed(1)) : 0;

  return ok({
    curve,
    documents: summaries.length,
    active_rules: activeRules.length,
    proposed_rules: rules.filter((r) => r.state === "proposed").length,
    total_rule_hits: totalRuleHits,
    edits_per_1k_reduction_pct: reductionPct,
  });
}
