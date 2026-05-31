"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  CheckCircle2, Download, FileText, PanelLeftClose, PanelRightClose, RotateCcw, Send, Sparkles, UserCheck,
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
import { isYourTurn, localeLabel, roleLabel } from "@/app/lib/roles";

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

  const assignedSeat = seats.find((s) => s.user_id === doc.assigned_to.user_id);
  const assignedName = assignedSeat ? roleLabel(assignedSeat.role) : doc.assigned_to.team_id;
  const turnColor = doc.status === "published" ? "var(--memory)" : yourTurn ? "var(--accent)" : "var(--ink-faint)";
  const turnLabel = doc.status === "published"
    ? "Deployed · locked"
    : yourTurn ? `Your turn · ${roleLabel(role)}` : `Held by ${assignedName} · read-only`;

  return (
    <div>
      <div style={{ position: "sticky", top: 53, zIndex: 40 }}>
      {/* Workspace sub-bar */}
      <div style={{ background: "color-mix(in srgb, var(--bg) 94%, transparent)", borderBottom: "1px solid var(--line)", backdropFilter: "blur(8px)", padding: "10px 22px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <FileText size={16} style={{ color: "var(--ink-soft)" }} />
        <div style={{ minWidth: 0 }}>
          <div className="font-display" style={{ fontWeight: 600, fontSize: 15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 320 }}>{doc.title}</div>
          <div className="ui-base mono" style={{ color: "var(--ink-faint)" }}>{doc.source.filename} · {localeLabel(doc.target_locale)}</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          {/* Turn / lock status as a compact chip — replaces the old full-width banner. */}
          <span className="tag" style={{ color: turnColor }}>
            <span className="dot" style={{ background: turnColor }} /> {turnLabel}
          </span>
          {error && <span className="ui-base" style={{ color: "var(--flag)" }}>⚠ {error}</span>}
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
          <button className="btn btn-ghost" aria-label="Toggle outline" onClick={() => setShowOutline((v) => !v)} style={{ padding: "7px 8px" }}><PanelLeftClose size={15} /></button>
          <button className="btn btn-ghost" aria-label="Toggle panel" onClick={() => setShowPanel((v) => !v)} style={{ padding: "7px 8px" }}><PanelRightClose size={15} /></button>
        </div>
      </div>

      {/* The visible process pipeline */}
      <ProcessStepper doc={doc} />
      </div>

      {/* Three-column reading room */}
      <div style={{ display: "flex", gap: 28, padding: "24px 22px 80px", maxWidth: 1400, margin: "0 auto", alignItems: "flex-start" }}>
        {showOutline && <OutlineNavigator blocks={doc.blocks} onJump={jump} />}
        <div className="card fade-up" style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
          <div style={{ padding: "11px 24px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--surface-2)", gap: 12, flexWrap: "wrap" }}>
            <span className="label">Bilingual review record · {doc.blocks.length} segments · EN ⇄ Neutral Spanish</span>
            <FormatToolbar />
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

const MODEL_NAMES: Record<string, string> = {
  "claude-sonnet-4-6": "Claude Sonnet 4.6",
  "gpt-5": "GPT-5",
  "gpt-4o": "GPT-4o",
};
const modelName = (id: string) => MODEL_NAMES[id] ?? id;

function ProvenanceFooter({ doc }: { doc: DocModel }) {
  const m = doc.model_run;
  const qeShort = m.qe_model_id.split("/").pop() ?? m.qe_model_id;
  const rawId = (id: string) => <span className="mono" style={{ fontSize: 11, color: "var(--ink-faint)" }}>({id})</span>;
  const criticDeterministic = m.critic_model_id.includes("deterministic");
  return (
    <div style={{ marginTop: 32, paddingTop: 18, borderTop: "1px solid var(--line)" }}>
      <span className="label">How this translation was produced</span>
      <ul className="ui-base" style={{ margin: "12px 0 0", paddingLeft: 18, color: "var(--ink-soft)", lineHeight: 1.75, display: "flex", flexDirection: "column", gap: 6 }}>
        <li><b style={{ color: "var(--ink)" }}>First draft</b> written by {modelName(m.translator_model_id)} {rawId(m.translator_model_id)} — the translator.</li>
        {criticDeterministic ? (
          <li><b style={{ color: "var(--ink)" }}>Independently checked</b> by deterministic validators — automatic number, glossary and regionalism checks. <span style={{ color: "var(--ink-faint)" }}>(The second-AI review by GPT-5 runs when an OpenAI key is configured.)</span></li>
        ) : (
          <li><b style={{ color: "var(--ink)" }}>Independently checked</b> by {modelName(m.critic_model_id)} {rawId(m.critic_model_id)} — a different AI, so it catches what the first one might miss.</li>
        )}
        <li><b style={{ color: "var(--ink)" }}>Quality-scored</b> by a small model running on our own server ({qeShort}) — it only decides where to focus effort, and never approves the wording.</li>
        <li><b style={{ color: "var(--ink)" }}>Your team's approved glossary and rules</b> were applied automatically.</li>
      </ul>
      <p className="ui-base" style={{ color: "var(--ink-soft)", marginTop: 12 }}>
        The final Spanish is decided by automated checks and a human sign-off — never by an AI's confidence score.
      </p>
      <p className="mono" style={{ fontSize: 10.5, color: "var(--ink-faint)", marginTop: 14, lineHeight: 1.6 }}>
        Audit · prompts {m.prompt_version} · rules {m.rules_version} · glossary {m.glossary_version} · config {m.config_hash}
      </p>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="font-ui" style={{ padding: 80, textAlign: "center", color: "var(--ink-soft)" }}>{children}</div>;
}
