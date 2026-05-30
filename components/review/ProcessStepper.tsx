"use client";
import {
  BookOpen, Check, Eye, Languages, Send, ShieldCheck, Sparkles, Stamp,
} from "lucide-react";
import type { DocModel } from "@/src/lib/doc-model";
import { PROCESS_STEPS, type StepState, stepState } from "@/app/lib/roles";

const ICONS: Record<string, React.ComponentType<{ size?: number; strokeWidth?: number }>> = {
  translate: Languages, checks: ShieldCheck, governance: BookOpen, rewrite: Sparkles,
  review: Eye, approval: Stamp, deploy: Send,
};

function stats(doc: DocModel): Record<string, string> {
  const blocks = doc.blocks;
  const flagged = blocks.filter(
    (b) => b.validator_results.some((v) => v.status === "fail" && v.blocking) ||
      b.critic_flags.some((f) => f.severity === "major" || f.severity === "critical"),
  ).length;
  const neutralized = blocks.reduce((s, b) => s + b.neutralization_hits.length, 0);
  const refined = blocks.filter((b) => b.iterations > 0).length;
  const locked = blocks.filter((b) => b.seg_status === "locked").length;
  return {
    translate: `${blocks.length} segments`,
    checks: `10 validators · ${flagged} flagged`,
    governance: `${neutralized} neutralized${locked ? ` · ${locked} locked` : ""}`,
    rewrite: `${refined} refined`,
    review: doc.status === "in_review" || doc.status === "changes_requested" ? "in progress" : flagged ? `${flagged} to resolve` : "ready",
    approval: doc.status === "approved" || doc.status === "published" ? "approved" : "pending",
    deploy: doc.status === "published" ? "deployed" : "pending",
  };
}

function Node({ state, label, sub, Icon, last }: {
  state: StepState; label: string; sub: string;
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number }>; last: boolean;
}) {
  const color = state === "done" ? "var(--memory)" : state === "active" ? "var(--accent)" : "var(--ink-faint)";
  return (
    <div style={{ display: "flex", alignItems: "flex-start", flex: last ? "0 0 auto" : "1 1 0", minWidth: 0 }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, width: 30 }}>
        <div
          className={state === "active" ? "live-dot" : ""}
          style={{
            width: 28, height: 28, borderRadius: "50%", display: "grid", placeItems: "center",
            border: `1.5px solid ${color}`,
            background: state === "done" ? "var(--memory)" : state === "active" ? "color-mix(in srgb, var(--accent) 14%, var(--surface))" : "var(--surface)",
            color: state === "done" ? "#fff" : color,
          }}
        >
          {state === "done" ? <Check size={15} strokeWidth={2.4} /> : <Icon size={14} strokeWidth={1.9} />}
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0, paddingLeft: 8, paddingTop: 1 }}>
        <div className="font-ui" style={{ fontSize: 12, fontWeight: 600, color: state === "pending" ? "var(--ink-soft)" : "var(--ink)", whiteSpace: "nowrap" }}>
          {label}
        </div>
        <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-faint)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</div>
        {!last && (
          <div style={{ height: 2, background: state === "done" ? "var(--memory)" : "var(--line)", borderRadius: 2, margin: "9px 12px 0 -38px", marginLeft: 38 }} />
        )}
      </div>
    </div>
  );
}

export function ProcessStepper({ doc }: { doc: DocModel }) {
  const s = stats(doc);
  return (
    <div style={{ borderBottom: "1px solid var(--line)", background: "var(--surface-2)" }}>
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "14px 22px 12px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 12 }}>
          <span className="label">Process</span>
          <span className="ui-base" style={{ color: "var(--ink-faint)" }}>
            automated pipeline → human short process (Investment Strategy → Marketing → Supervisory Management → clients)
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 4 }}>
          {PROCESS_STEPS.map((step, i) => {
            const state = stepState(step.key, doc.status);
            const isGroupEnd = step.key === "rewrite";
            return (
              <div key={step.key} style={{ display: "flex", flex: i === PROCESS_STEPS.length - 1 ? "0 0 auto" : "1 1 0", minWidth: 0 }}>
                <Node state={state} label={step.label} sub={s[step.key]} Icon={ICONS[step.key]} last={i === PROCESS_STEPS.length - 1} />
                {isGroupEnd && <div style={{ width: 1, alignSelf: "stretch", background: "var(--line)", margin: "0 10px", flexShrink: 0 }} />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
