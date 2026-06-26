"use client";
import { useEffect, useState } from "react";
import { BookOpen, Check, TrendingDown } from "lucide-react";
import { api } from "@/app/lib/client";
import { roleLabel, localeLabel } from "@/app/lib/roles";
import type { DocModel, GlossaryEntry, NeutralizationRule } from "@/src/lib/doc-model";
import { changedPhrase } from "@/src/lib/text-diff";

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

export function FeedbackPanel({ doc, canApproveRules, onGovern, refreshKey, onJump }: {
  doc: DocModel;
  canApproveRules: boolean;
  onGovern: (ruleId: string, action: "approve" | "deprecate") => void;
  refreshKey: number;
  onJump?: (blockId: string) => void;
}) {
  const [rules, setRules] = useState<NeutralizationRule[]>([]);
  const [glossary, setGlossary] = useState<GlossaryEntry[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);

  useEffect(() => {
    api.memory().then((r) => { setRules(r.rules); setGlossary(r.glossary); }).catch(() => {});
    // Scope the learning-curve / totals card to THIS document's target language.
    api.metrics(doc.target_locale).then(setMetrics).catch(() => {});
  }, [refreshKey, doc.target_locale]);

  // Each document has ISOLATED governed memory per target language — a zh-Hans doc
  // must never show es-419 (or zh-Hant) rules/glossary. Scope everything below to
  // this document's target locale before deriving proposed/active/glossary.
  const localeRules = rules.filter((r) => r.locale === doc.target_locale);
  const localeGlossary = glossary.filter((g) => g.locale === doc.target_locale);
  const proposed = localeRules.filter((r) => r.state === "proposed");
  // Within this language the queue is the GLOBAL memory queue (rules apply to every
  // document of this locale), but it renders in a per-document sidebar — so surface
  // which proposals actually touch THIS document and sort those to the top, and
  // label the rest as cross-document.
  const docHaystack = doc.blocks
    .map((b) => `${b.source_text} ${b.mt_text} ${b.final_text}`)
    .join(" ")
    .toLowerCase();
  // Word-boundary match (not raw substring) so "red" doesn't match "predicted",
  // and a blank/untrimmed regional_form never matches — mirrors the regionalism
  // validator's token-aware matching.
  const appearsHere = (r: NeutralizationRule) => {
    const form = r.regional_form?.trim().toLowerCase();
    if (!form) return false;
    const esc = form.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?<![\\p{L}\\p{N}])${esc}(?![\\p{L}\\p{N}])`, "u").test(docHaystack);
  };
  const proposedSorted = [...proposed].sort((a, b) => Number(appearsHere(b)) - Number(appearsHere(a)));
  const active = localeRules.filter((r) => r.state === "active" || r.state === "approved").sort((a, b) => b.hits - a.hits);
  const recentEdits = [...doc.edit_log].reverse().slice(0, 6);

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div style={{ marginBottom: 22 }}>
      <p className="label" style={{ marginBottom: 9 }}>{title}</p>
      {children}
    </div>
  );

  return (
    <aside style={{ width: 320, flexShrink: 0 }}>
      {/* Flows with the document (no viewport cap) — extends to the doc's length,
          and only the page scrolls. Previously a sticky maxHeight cut it off. */}
      <div style={{ paddingRight: 6 }}>
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
              {active.length} active rules · {metrics?.total_rule_hits ?? 0} auto-neutralizations
            </div>
          </div>
        </Section>

        {proposed.length > 0 && (
          <Section title={`Governance queue · ${proposed.length} proposed · ${localeLabel(doc.target_locale)}`}>
            <p className="ui-base" style={{ color: "var(--ink-faint)", margin: "-2px 0 9px" }}>
              Rules awaiting an approver. They enter the {localeLabel(doc.target_locale)} memory and apply to every {localeLabel(doc.target_locale)} document — not only this one.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {proposedSorted.map((r) => (
                <div key={r.id} className="card" style={{ padding: "10px 12px" }}>
                  <div className="doc-body" style={{ fontSize: 14 }}>
                    <s style={{ color: "var(--flag)" }}>{r.regional_form}</s> → <b style={{ color: "var(--memory)" }}>{r.neutral_form}</b>
                  </div>
                  {/* Tells the reviewer which queued rules (all in this same target
                      language) are relevant to the text in front of them vs. ones
                      proposed from other documents of this locale. */}
                  <span className="tag" style={{ marginTop: 4, color: appearsHere(r) ? "var(--accent)" : "var(--ink-faint)" }}>
                    {appearsHere(r) ? "appears in this document" : "from another document"}
                  </span>
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
                      // Author/reviewer can't approve rules into memory — only
                      // Supervisory Management (approver) or an admin can. Spell out
                      // what the status means and who acts.
                      <span className="ui-base" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--ink-faint)" }} title="Proposed rules only enter the shared memory once Supervisory Management (or an admin) approves them. Switch to the Supervisory Management seat to approve or deprecate.">
                        <span className="tag accent">proposed</span>
                        waiting for Supervisory Management to approve it into memory
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        <Section title={`Active neutralization rules · ${active.length} · ${localeLabel(doc.target_locale)}`}>
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

        <Section title={`${localeLabel(doc.target_locale)} glossary · ${localeGlossary.length} terms`}>
          <div className="ui-base" style={{ color: localeGlossary.length ? "var(--ink-soft)" : "var(--ink-faint)", lineHeight: 1.5 }}>
            {localeGlossary.length
              ? `${localeGlossary.slice(0, 6).map((g) => g.source).join(" · ")}${localeGlossary.length > 6 ? " …" : ""}`
              : `No ${localeLabel(doc.target_locale)} glossary terms yet — they grow from finished work.`}
          </div>
        </Section>

        {recentEdits.length > 0 && (
          <Section title="Recent edits · this document">
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {recentEdits.map((e) => {
                const { from, to } = changedPhrase(e.before, e.after);
                // Only edit/propose carry a user text change worth diffing; accept/
                // reject/lock set before/after to MT-vs-final, so show the action.
                const showDiff = (e.action === "edit" || e.action === "propose") && !!(from || to);
                return (
                  <button
                    key={e.id}
                    onClick={() => onJump?.(e.segment_id)}
                    className="ui-base"
                    title="Go to this edit"
                    style={{
                      display: "flex", flexDirection: "column", gap: 2, alignItems: "flex-start", textAlign: "left",
                      width: "100%", border: "none", background: "transparent", cursor: "pointer",
                      padding: "6px 8px", borderRadius: "var(--r-sm)", color: "var(--ink-soft)",
                    }}
                  >
                    <span style={{ maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {showDiff ? (
                        <>
                          <span style={{ color: "var(--flag)", textDecoration: "line-through" }}>{from || "—"}</span>
                          {" → "}
                          <span style={{ color: "var(--memory)" }}>{to || "—"}</span>
                        </>
                      ) : (
                        <span className="tag">{e.action}</span>
                      )}
                    </span>
                    <span className="mono" style={{ fontSize: 10, color: "var(--ink-faint)" }}>
                      {e.actor.role === "system" ? "System" : roleLabel(e.actor.role)} · {e.action}
                      {e.error_categories_corrected.length ? ` · ${e.error_categories_corrected.join(", ")}` : ""}
                    </span>
                  </button>
                );
              })}
            </div>
          </Section>
        )}
      </div>
    </aside>
  );
}
