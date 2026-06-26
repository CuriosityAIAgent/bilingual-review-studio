/** GET /api/metrics — the killer metric (spec §1, §15): the learning curve of
 *  edits-per-1,000-words over documents, plus rule-application and regionalism
 *  trend signals. */
import type { Locale } from "@/src/lib/doc-model";
import { ensureSeeded } from "@/src/memory/seed";
import { ok } from "@/src/server/context";
import { getStore } from "@/src/store";

export async function GET(req: Request) {
  const store = getStore();
  // Optional ?locale scopes EVERY number to one target language, so a Chinese
  // review never shows Spanish-heavy totals in the sidebar (curve, doc count,
  // reduction, rule hits). No locale = global (the overview view).
  const locale = new URL(req.url).searchParams.get("locale") as Locale | null;
  await ensureSeeded(store, locale ?? "es-419");
  const [allSummaries, allRules] = await Promise.all([store.listDocs(), store.getRules()]);
  const summaries = locale ? allSummaries.filter((s) => s.target_locale === locale) : allSummaries;
  const rules = locale ? allRules.filter((r) => r.locale === locale) : allRules;

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
