"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  CheckCircle2, Download, FileText, Hand, Lock, PanelLeftClose, PanelRightClose, RotateCcw, Send, Sparkles, UserCheck,
} from "lucide-react";
import { api, type ActionBody } from "@/app/lib/client";
import type { DocModel, FlagCategory } from "@/src/lib/doc-model";
import { useSeat } from "@/components/Providers";
import { type SegCaps, SegmentRow } from "@/components/review/SegmentRow";
import { OutlineNavigator } from "@/components/review/OutlineNavigator";
import { FeedbackPanel } from "@/components/review/FeedbackPanel";
import { TeachRuleModal } from "@/components/review/TeachRuleModal";
import { ProcessStepper } from "@/components/review/ProcessStepper";
import { FormatToolbar } from "@/components/review/FormatToolbar";
import { isYourTurn, roleLabel } from "@/app/lib/roles";

const STATUS_COLOR: Record<string, string> = {
  draft: "var(--ink-faint)", in_review: "var(--edited)", changes_requested: "var(--flag)",
  approved: "var(--memory)", published: "var(--accent)",
};

export default function ReviewPage() {
  const { id } = useParams<{ id: string }>();
  const { seat, seats } = useSeat();
  const [doc, setDoc] = useState<DocModel | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [showOutline, setShowOutline] = useState(true);
  const [showPanel, setShowPanel] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [teach, setTeach] = useState<{ regional: string; neutral: string; blockId: string } | null>(null);
  const [handoffTo, setHandoffTo] = useState("");

  useEffect(() => { api.getDoc(id).then((r) => setDoc(r.doc)).catch((e) => setError(e.message)); }, [id]);

  const role = seat?.role ?? "viewer";
  // Turn-based lock: you can only edit/act when the document is handed to you.
  const yourTurn = doc ? isYourTurn(seat ?? null, doc) : false;
  const caps: SegCaps = {
    canEdit: yourTurn && role !== "viewer",
    canAccept: yourTurn && (role === "reviewer" || role === "approver" || role === "admin"),
    canLock: yourTurn && (role === "approver" || role === "admin"),
    canPropose: yourTurn && role !== "viewer",
  };
  const canApproveRules = role === "approver" || role === "admin"; // governance (memory), not turn-gated

  const act = useCallback(async (body: ActionBody, label = "") => {
    setBusy(label || body.kind); setError("");
    try {
      // Send the revision we hold so the server can reject stale writes (§12).
      const { doc: next } = await api.action(id, { ...body, rev: doc?.rev });
      setDoc(next); setRefreshKey((k) => k + 1);
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      // On a concurrency conflict, reload the latest so the reviewer sees the truth.
      if (/changed since you loaded/i.test(msg)) {
        const fresh = await api.getDoc(id).catch(() => null);
        if (fresh) { setDoc(fresh.doc); setError("Reloaded — another user had changed this document. Re-apply your edit."); }
      }
    }
    finally { setBusy(""); }
  }, [id, doc?.rev]);

  const onEdit = (blockId: string, text: string, cats: FlagCategory[]) => act({ kind: "edit", blockId, text, cats });

  const submitRule = async (regional: string, neutral: string, reason: string, variant: string) => {
    setBusy("teach"); setError("");
    try {
      const { rule } = await api.proposeRule({ regional_form: regional, neutral_form: neutral, reason, variant });
      if (canApproveRules) {
        await api.governRule(rule.id, "approve");
        const { doc: next } = await api.action(id, { kind: "retranslate" });
        setDoc(next);
      }
      setTeach(null); setRefreshKey((k) => k + 1);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(""); }
  };

  const onGovern = async (ruleId: string, action: "approve" | "deprecate") => {
    setBusy("govern"); setError("");
    try {
      await api.governRule(ruleId, action);
      if (action === "approve") { const { doc: next } = await api.action(id, { kind: "retranslate" }); setDoc(next); }
      setRefreshKey((k) => k + 1);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(""); }
  };

  const jump = (blockId: string) => document.getElementById(`seg-${blockId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });

  if (error && !doc) return <Center>Could not load document: {error}</Center>;
  if (!doc) return <Center>Loading review…</Center>;

  const needsReview = doc.blocks.filter((b) =>
    b.validator_results.some((v) => v.status === "fail" && v.blocking)
    || b.critic_flags.some((f) => f.severity === "major" || f.severity === "critical")).length;

  const assignedSeat = seats.find((s) => s.user_id === doc.assigned_to.user_id);
  const assignedName = assignedSeat?.display_name ?? doc.assigned_to.user_id;
  const assignedTeam = assignedSeat ? `${roleLabel(assignedSeat.role)} · ${assignedSeat.team_name}` : doc.assigned_to.team_id;

  const guidance = (() => {
    if (!yourTurn) return "";
    if (role === "author" || (role === "admin" && (doc.status === "draft" || doc.status === "changes_requested")))
      return doc.status === "changes_requested"
        ? "Address the requested changes, then hand off to Marketing."
        : "Review and neutralize the Spanish, then hand off to Marketing.";
    if (role === "reviewer" && doc.status === "in_review") return "Review and neutralize regional word choice, then hand off to Supervisory Management.";
    if (role === "reviewer" && doc.status === "approved") return "Approved by Supervisory Management — deploy to clients when ready.";
    if (role === "approver" && doc.status === "in_review") return "Give final sign-off, or request major changes to send it back.";
    return "This document is assigned to you.";
  })();

  return (
    <div>
      <div style={{ position: "sticky", top: 53, zIndex: 40 }}>
      {/* Workspace sub-bar */}
      <div style={{ background: "color-mix(in srgb, var(--bg) 94%, transparent)", borderBottom: "1px solid var(--line)", backdropFilter: "blur(8px)", padding: "10px 22px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <FileText size={16} style={{ color: "var(--ink-soft)" }} />
        <div style={{ minWidth: 0 }}>
          <div className="font-display" style={{ fontWeight: 600, fontSize: 15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 320 }}>{doc.title}</div>
          <div className="ui-base mono" style={{ color: "var(--ink-faint)" }}>{doc.source.filename} · {doc.target_locale}</div>
        </div>
        <span className="tag" style={{ color: STATUS_COLOR[doc.status] }}>
          <span className="dot" style={{ background: STATUS_COLOR[doc.status] }} /> {doc.status.replace("_", " ")}
        </span>
        <span className="tag">{needsReview} need review</span>
        <span className="tag mono">{doc.metrics.edits_per_1k} edits/1k</span>

        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <button className="btn btn-ghost" disabled={!!busy} onClick={() => act({ kind: "retranslate" }, "retranslate")}>
            <Sparkles size={14} style={{ color: "var(--accent)" }} /> {busy === "retranslate" ? "Re-translating…" : "Re-translate with learnings"}
          </button>

          {/* Export */}
          <a className="btn btn-ghost" href={`/api/documents/${id}/export?format=record&annotations=1`} target="_blank" rel="noreferrer">
            <Download size={14} /> Review record
          </a>

          {/* Workflow — the JPM short process (turn-aware: only the holder sees the CTA) */}
          {yourTurn && (role === "author" || role === "admin") && (doc.status === "draft" || doc.status === "changes_requested") && (
            <button className="btn btn-primary" disabled={!!busy} onClick={() => act({ kind: "submit", note: "Handed off to Marketing" }, "submit")}>
              <Send size={14} /> Hand off to Marketing
            </button>
          )}
          {yourTurn && (role === "reviewer" || role === "admin") && doc.status === "in_review" && (
            <button className="btn btn-primary" disabled={!!busy} onClick={() => act({ kind: "handoff", toUserId: "carmen", note: "For SM approval" }, "handoff")}>
              <Send size={14} /> Hand off to Supervisory Management
            </button>
          )}
          {yourTurn && (role === "approver" || role === "admin") && doc.status === "in_review" && (
            <>
              <button className="btn btn-ghost" disabled={!!busy} onClick={() => act({ kind: "request_changes", note: "Major changes requested" }, "request_changes")}>
                <RotateCcw size={14} /> Request major changes
              </button>
              <button className="btn btn-primary" disabled={!!busy} onClick={() => act({ kind: "approve", note: "SM approved" }, "approve")}>
                <CheckCircle2 size={14} /> SM approval
              </button>
            </>
          )}
          {yourTurn && (role === "reviewer" || role === "admin") && doc.status === "approved" && (
            <button className="btn btn-accent" disabled={!!busy} onClick={() => act({ kind: "publish" }, "publish")}>
              <Send size={14} /> Deploy to clients
            </button>
          )}

          <div style={{ width: 1, height: 22, background: "var(--line)", margin: "0 2px" }} />
          <FormatToolbar />
          <button className="btn btn-ghost" aria-label="Toggle outline" onClick={() => setShowOutline((v) => !v)} style={{ padding: "7px 8px" }}><PanelLeftClose size={15} /></button>
          <button className="btn btn-ghost" aria-label="Toggle panel" onClick={() => setShowPanel((v) => !v)} style={{ padding: "7px 8px" }}><PanelRightClose size={15} /></button>
        </div>
      </div>

      {/* The visible process pipeline */}
      <ProcessStepper doc={doc} />
      </div>

      {/* Turn-based lock banner — who holds the document right now */}
      <div style={{
        padding: "9px 22px", display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid var(--line-2)",
        background: doc.status === "published"
          ? "color-mix(in srgb, var(--memory) 9%, transparent)"
          : yourTurn ? "color-mix(in srgb, var(--accent) 9%, transparent)" : "var(--surface-2)",
      }}>
        {doc.status === "published" ? (
          <>
            <CheckCircle2 size={15} style={{ color: "var(--memory)" }} />
            <span className="ui-base" style={{ color: "var(--ink)" }}><b>Deployed to clients.</b> This document is locked.</span>
          </>
        ) : yourTurn ? (
          <>
            <Hand size={15} style={{ color: "var(--accent)" }} />
            <span className="ui-base" style={{ color: "var(--ink)" }}><b>Your turn ({roleLabel(role)}).</b> {guidance}</span>
            <div style={{ marginLeft: "auto" }}>
              <HandoffControl value={handoffTo} onChange={setHandoffTo} onHandoff={(to) => to && act({ kind: "handoff", toUserId: to, note: "Handed off" }, "handoff")} />
            </div>
          </>
        ) : (
          <>
            <Lock size={15} style={{ color: "var(--ink-faint)" }} />
            <span className="ui-base" style={{ color: "var(--ink-soft)" }}>
              Held by <b style={{ color: "var(--ink)" }}>{assignedName}</b> · {assignedTeam}. Read-only for you until it's handed off.
            </span>
          </>
        )}
        {error && <span className="ui-base" style={{ color: "var(--flag)", marginLeft: yourTurn ? 0 : "auto" }}>⚠ {error}</span>}
      </div>

      {/* Three-column reading room */}
      <div style={{ display: "flex", gap: 28, padding: "24px 22px 80px", maxWidth: 1400, margin: "0 auto", alignItems: "flex-start" }}>
        {showOutline && <OutlineNavigator blocks={doc.blocks} onJump={jump} />}
        <div className="card fade-up" style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
          <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "baseline", background: "var(--surface-2)" }}>
            <div>
              <span className="label">Bilingual review record</span>
              <div className="font-display" style={{ fontSize: 19, fontWeight: 600 }}>{doc.title}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <span className="ui-base" style={{ color: "var(--ink-faint)" }}>{doc.blocks.length} segments · English ⇄ Español neutro</span>
              <div className="ui-base mono" style={{ color: "var(--ink-faint)", fontSize: 10.5, marginTop: 2 }}>
                QE = machine quality estimate (0–1) · routing only · validators + you decide
              </div>
            </div>
          </div>
          {doc.blocks.map((b, i) => (
            <SegmentRow
              key={b.id} block={b} index={i} caps={caps}
              onEdit={onEdit}
              onAccept={(bid) => act({ kind: "accept", blockId: bid })}
              onReject={(bid) => act({ kind: "reject", blockId: bid, reason: "rejected" })}
              onLock={(bid) => act({ kind: "lock", blockId: bid })}
              onTeach={(regional, neutral, blockId) => setTeach({ regional, neutral, blockId })}
            />
          ))}
          <div style={{ padding: "0 24px 20px" }}><ProvenanceFooter doc={doc} /></div>
        </div>
        {showPanel && <FeedbackPanel doc={doc} canApproveRules={canApproveRules} onGovern={onGovern} refreshKey={refreshKey} />}
      </div>

      {teach && (
        <TeachRuleModal
          initialRegional={teach.regional}
          initialNeutral={teach.neutral}
          onClose={() => setTeach(null)}
          onSubmit={submitRule}
        />
      )}
    </div>
  );
}

function HandoffControl({ value, onChange, onHandoff }: { value: string; onChange: (v: string) => void; onHandoff: (to: string) => void }) {
  const { seats } = useSeat();
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <select className="ui-base" value={value} onChange={(e) => onChange(e.target.value)}
        style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--r-sm)", padding: "5px 9px", color: "var(--ink)" }}>
        <option value="">Hand off to…</option>
        {seats.filter((s) => s.role !== "viewer").map((s) => <option key={s.user_id} value={s.user_id}>{s.display_name} · {s.role}</option>)}
      </select>
      <button className="btn btn-ghost ui-base" style={{ padding: "5px 10px" }} disabled={!value} onClick={() => onHandoff(value)}>Hand off</button>
    </div>
  );
}

function ProvenanceFooter({ doc }: { doc: DocModel }) {
  const m = doc.model_run;
  return (
    <div className="ui-base" style={{ marginTop: 32, paddingTop: 16, borderTop: "1px solid var(--line)", color: "var(--ink-faint)", lineHeight: 1.7 }}>
      <span className="label">Provenance</span><br />
      translator {m.translator_model_id} · critic {m.critic_model_id} · QE {m.qe_model_id}<br />
      prompts {m.prompt_version} · rules {m.rules_version} · glossary {m.glossary_version} · config <span className="mono">{m.config_hash}</span><br />
      QE is a routing signal only — deterministic validators and human approval are authoritative.
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="font-ui" style={{ padding: 80, textAlign: "center", color: "var(--ink-soft)" }}>{children}</div>;
}
