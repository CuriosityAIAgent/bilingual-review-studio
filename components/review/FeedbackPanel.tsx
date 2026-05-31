"use client";
import { useEffect, useState } from "react";
import { BookOpen, Check, TrendingDown } from "lucide-react";
import { api } from "@/app/lib/client";
import { roleLabel } from "@/app/lib/roles";
import type { DocModel, GlossaryEntry, NeutralizationRule } from "@/src/lib/doc-model";

interface Metrics {
  curve: { doc_id: string; title: string; created_at: string; edits_per_1k: number }[];
  documents: number; active_rules: number; proposed_rules: number;
  total_rule_hits: number; edits_per_1k_reduction_pct: number;
}

function shortMonth(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("en-US", { month: "short" });
}

/** Smooth filled trend curve — reviewer edits per 1k over time (per Claude Design comp). */
function Sparkline({ curve }: { curve: { created_at: string; edits_per_1k: number }[] }) {
  if (curve.length < 2) return <div className="ui-base" style={{ color: "var(--ink-faint)" }}>Awaiting more documents…</div>;
  const values = curve.map((c) => c.edits_per_1k);
  const max = Math.max(...values, 1);
  const w = 256, h = 52, pad = 4;
  const x = (i: number) => (i / (values.length - 1)) * w;
  const y = (v: number) => h - (v / max) * (h - pad * 2) - pad;
  const line = values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  return (
    <div>
      <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: "block" }} aria-label="reviewer edits per 1k trend">
        <polygon points={`0,${h} ${line} ${w},${h}`} fill="color-mix(in srgb, var(--accent) 9%, transparent)" />
        <polyline points={line} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r="3" fill="var(--accent)" />
      </svg>
      <div className="mono" style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "var(--ink-faint)", marginTop: 4 }}>
        <span>{shortMonth(curve[0].created_at)}</span>
        <span>{shortMonth(curve[curve.length - 1].created_at)}</span>
      </div>
    </div>
  );
}

export function FeedbackPanel({ doc, canApproveRules, onGovern, refreshKey }: {
  doc: DocModel;
  canApproveRules: boolean;
  onGovern: (ruleId: string, action: "approve" | "deprecate") => void;
  refreshKey: number;
}) {
  const [rules, setRules] = useState<NeutralizationRule[]>([]);
  const [glossary, setGlossary] = useState<GlossaryEntry[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);

  useEffect(() => {
    api.memory().then((r) => { setRules(r.rules); setGlossary(r.glossary); }).catch(() => {});
    api.metrics().then(setMetrics).catch(() => {});
  }, [refreshKey]);

  const proposed = rules.filter((r) => r.state === "proposed");
  const active = rules.filter((r) => r.state === "active" || r.state === "approved").sort((a, b) => b.hits - a.hits);
  const recentEdits = [...doc.edit_log].reverse().slice(0, 6);

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div style={{ marginBottom: 22 }}>
      <p className="label" style={{ marginBottom: 9 }}>{title}</p>
      {children}
    </div>
  );

  return (
    <aside style={{ width: 320, flexShrink: 0 }}>
      <div style={{ position: "sticky", top: 172, maxHeight: "calc(100dvh - 188px)", overflowY: "auto", overflowX: "hidden", paddingRight: 6 }}>
        <Section title="Reviewer edits · per 1,000 words">
          <div className="card" style={{ padding: 16 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
              <span className="font-display" style={{ fontSize: 30, lineHeight: 1, letterSpacing: "-0.02em" }}>{doc.metrics.edits_per_1k}</span>
              <span className="ui-base" style={{ color: "var(--ink-faint)" }}>edits / 1k</span>
            </div>
            {metrics && metrics.edits_per_1k_reduction_pct > 0 && (
              <div className="ui-base" style={{ color: "var(--memory)", display: "inline-flex", alignItems: "center", gap: 4, marginTop: 4, fontWeight: 600 }}>
                <TrendingDown size={13} /> {metrics.edits_per_1k_reduction_pct}% reduction across {metrics.documents} docs
              </div>
            )}
            <div style={{ marginTop: 12 }}>
              <Sparkline curve={metrics?.curve ?? []} />
            </div>
            <div className="ui-base mono" style={{ color: "var(--ink-faint)", marginTop: 10 }}>
              {metrics?.active_rules ?? 0} active rules · {metrics?.total_rule_hits ?? 0} auto-neutralizations
            </div>
          </div>
        </Section>

        {proposed.length > 0 && (
          <Section title={`Governance queue · ${proposed.length} proposed`}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {proposed.map((r) => (
                <div key={r.id} className="card" style={{ padding: "10px 12px" }}>
                  <div className="doc-body" style={{ fontSize: 14 }}>
                    <s style={{ color: "var(--flag)" }}>{r.regional_form}</s> → <b style={{ color: "var(--memory)" }}>{r.neutral_form}</b>
                  </div>
                  {r.reason && <div className="ui-base" style={{ color: "var(--ink-soft)", marginTop: 2 }}>{r.reason}</div>}
                  <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                    {canApproveRules ? (
                      <>
                        <button className="btn btn-accent ui-base" style={{ padding: "4px 10px" }} onClick={() => onGovern(r.id, "approve")}>
                          <Check size={12} /> Approve → active
                        </button>
                        <button className="btn btn-ghost ui-base" style={{ padding: "4px 10px", color: "var(--flag)" }} onClick={() => onGovern(r.id, "deprecate")}>
                          Deprecate
                        </button>
                      </>
                    ) : (
                      <span className="tag accent">awaiting approver</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        <Section title={`Active neutralization rules · ${active.length}`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {active.slice(0, 8).map((r) => (
              <div key={r.id} className="ui-base" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <BookOpen size={12} style={{ color: "var(--memory)", flexShrink: 0 }} />
                <span style={{ color: "var(--ink-soft)" }}><s>{r.regional_form}</s> → {r.neutral_form}</span>
                {r.hits > 0 && <span className="tag memory" style={{ marginLeft: "auto" }}>{r.hits}×</span>}
              </div>
            ))}
            {active.length === 0 && <span className="ui-base" style={{ color: "var(--ink-faint)" }}>None yet — teach one from a flagged regionalism.</span>}
          </div>
        </Section>

        <Section title={`Neutral glossary · ${glossary.length} terms`}>
          <div className="ui-base" style={{ color: "var(--ink-soft)", lineHeight: 1.5 }}>
            {glossary.slice(0, 6).map((g) => g.source).join(" · ")}{glossary.length > 6 ? " …" : ""}
          </div>
        </Section>

        {recentEdits.length > 0 && (
          <Section title="Recent edits · this document">
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {recentEdits.map((e) => (
                <div key={e.id} className="ui-base" style={{ display: "flex", gap: 6, color: "var(--ink-soft)" }}>
                  <span className="tag" style={{ flexShrink: 0 }}>{e.action}</span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {e.actor.role === "system" ? "System" : roleLabel(e.actor.role)} · {e.error_categories_corrected.join(", ") || "edit"} · HTER {e.hter}
                  </span>
                </div>
              ))}
            </div>
          </Section>
        )}
      </div>
    </aside>
  );
}
