"use client";
import { useState } from "react";
import { ArrowRight, BookPlus, RotateCcw, Sparkles } from "lucide-react";
import { api, type MemoryImportPreview, type MemoryImportCommit, type TmImportStatus } from "@/app/lib/client";
import { roleLabel } from "@/app/lib/roles";
import { useSeat } from "@/components/Providers";

const STATUS: Record<TmImportStatus, { label: string; color: string }> = {
  new: { label: "new", color: "var(--memory)" },
  supersede: { label: "updates wording", color: "var(--edited)" },
  duplicate: { label: "already known", color: "var(--ink-faint)" },
};

const pane: React.CSSProperties = {
  width: "100%", minHeight: 340, resize: "vertical", padding: "14px 16px",
  borderRadius: "var(--r-md)", border: "1px solid var(--line)", background: "var(--surface)",
  color: "var(--ink)", fontFamily: "'Newsreader',serif", fontSize: 15.5, lineHeight: 1.6,
};

export default function LearnPage() {
  const { seat } = useSeat();
  const canLearn = !seat || seat.role !== "viewer";

  const [source, setSource] = useState("");
  const [target, setTarget] = useState("");
  const [phase, setPhase] = useState<"input" | "preview" | "done">("input");
  const [preview, setPreview] = useState<MemoryImportPreview | null>(null);
  const [done, setDone] = useState<MemoryImportCommit | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const onProcess = async () => {
    setBusy("process"); setError("");
    try {
      const r = await api.importMemoryPreview(source, target);
      setPreview(r); setPhase("preview");
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(""); }
  };

  const onSave = async () => {
    setBusy("save"); setError("");
    try {
      const r = await api.importMemoryCommit(source, target);
      setDone(r); setPhase("done");
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(""); }
  };

  const reset = () => {
    setSource(""); setTarget(""); setPreview(null); setDone(null); setError(""); setPhase("input");
  };

  const newCount = preview?.rows.filter((r) => r.status === "new").length ?? 0;
  const supCount = preview?.rows.filter((r) => r.status === "supersede").length ?? 0;
  const dupCount = preview?.rows.filter((r) => r.status === "duplicate").length ?? 0;
  const mismatch = preview && (preview.sourceExtra.length > 0 || preview.targetExtra.length > 0);

  return (
    <div style={{ maxWidth: 1040, margin: "0 auto", padding: "40px 24px 96px" }}>
      <div className="fade-up" style={{ marginBottom: 26 }}>
        <p className="label">{seat ? `Signed in as ${roleLabel(seat.role)}` : "Translation Studio"} · learn</p>
        <h1 className="font-display" style={{ fontSize: 30, letterSpacing: "-0.02em", marginTop: 4 }}>Learn from finished work</h1>
        <p className="doc-body" style={{ color: "var(--ink-soft)", marginTop: 6, maxWidth: 660 }}>
          Paste an English document you've already translated on the left, and your finished Spanish on the right.
          We align them segment by segment and fold the pairs into translation memory — so future drafts reuse
          how your team has actually translated, instead of starting cold.
        </p>
      </div>

      {!canLearn && (
        <div className="card" style={{ padding: 20, marginBottom: 20 }}>
          <span className="ui-base" style={{ color: "var(--ink-soft)" }}>
            Viewers can't add to memory. Sign in as Investment Strategist, Marketing or Supervisory Management to teach from finished work.
          </span>
        </div>
      )}

      {/* ── Input: two panes ── */}
      {phase === "input" && (
        <div className="fade-up">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <p className="label" style={{ marginBottom: 8 }}>English — source</p>
              <textarea style={pane} value={source} disabled={!canLearn}
                onChange={(e) => setSource(e.target.value)}
                placeholder="Paste the full English document…" />
            </div>
            <div>
              <p className="label" style={{ marginBottom: 8 }}>Spanish — your finished translation</p>
              <textarea style={pane} value={target} disabled={!canLearn}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="Paste the full Spanish translation…" />
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 16 }}>
            <button className="btn btn-accent" disabled={!canLearn || !source.trim() || !target.trim() || busy === "process"}
              onClick={onProcess} style={{ padding: "9px 18px" }}>
              {busy === "process" ? <Sparkles size={15} className="live-dot" /> : <ArrowRight size={15} />}
              {busy === "process" ? "Aligning…" : "Process"}
            </button>
            <span className="ui-base" style={{ color: "var(--ink-faint)" }}>
              Aligned by paragraph order — you'll review the pairs before anything is saved.
            </span>
          </div>
        </div>
      )}

      {/* ── Preview: aligned pairs ── */}
      {phase === "preview" && preview && (
        <div className="fade-up">
          <div className="card" style={{ padding: "14px 18px", marginBottom: 16, display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center" }}>
            <span className="font-display" style={{ fontWeight: 600, fontSize: 16 }}>{preview.rows.length} aligned segments</span>
            <span className="ui-base mono" style={{ color: "var(--ink-soft)" }}>
              <b style={{ color: "var(--memory)" }}>{newCount} new</b> · {supCount} updates · {dupCount} already known
            </span>
            <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              <button className="btn btn-ghost ui-base" onClick={() => setPhase("input")} style={{ padding: "7px 12px" }}>Back</button>
              <button className="btn btn-accent" disabled={busy === "save" || newCount + supCount === 0} onClick={onSave} style={{ padding: "7px 14px" }}>
                <BookPlus size={14} /> {busy === "save" ? "Saving…" : `Save ${newCount + supCount} to memory`}
              </button>
            </div>
          </div>

          {mismatch && (
            <div className="card" style={{ padding: "12px 16px", marginBottom: 14, borderColor: "var(--edited)" }}>
              <span className="ui-base" style={{ color: "var(--edited)", fontWeight: 600 }}>Uneven segment counts.</span>{" "}
              <span className="ui-base" style={{ color: "var(--ink-soft)" }}>
                {preview.sourceBlocks} English vs {preview.targetBlocks} Spanish paragraphs.
                {preview.sourceExtra.length + preview.targetExtra.length} unmatched paragraph(s) won't be saved — even out the paragraph breaks and re-process to capture them.
              </span>
            </div>
          )}

          <div style={{ border: "1px solid var(--line)", borderRadius: "var(--r-md)", overflow: "hidden" }}>
            {preview.rows.map((r, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, padding: "13px 16px",
                borderTop: i === 0 ? "none" : "1px solid var(--line)", borderLeft: `2px solid ${STATUS[r.status].color}`, background: "var(--surface)" }}>
                <div style={{ fontFamily: "'Newsreader',serif", fontSize: 14.5, lineHeight: 1.5 }}>{r.source_text}</div>
                <div style={{ fontFamily: "'Newsreader',serif", fontSize: 14.5, lineHeight: 1.5 }}>
                  {r.target_text}
                  <span className="tag" style={{ marginLeft: 8, color: STATUS[r.status].color, verticalAlign: "middle" }}>{STATUS[r.status].label}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Done ── */}
      {phase === "done" && done && (
        <div className="card fade-up" style={{ padding: 28, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <BookPlus size={20} style={{ color: "var(--memory)" }} />
            <span className="font-display" style={{ fontWeight: 600, fontSize: 18 }}>Added to translation memory</span>
          </div>
          <p className="doc-body" style={{ color: "var(--ink-soft)" }}>
            <b style={{ color: "var(--ink)" }}>{done.result.added}</b> new segments captured
            {done.result.superseded > 0 && <> · <b style={{ color: "var(--ink)" }}>{done.result.superseded}</b> updated</>}
            {done.result.skipped > 0 && <> · {done.result.skipped} already known (skipped)</>}.
            These will be reused automatically the next time the same English appears in a document.
          </p>
          <div>
            <button className="btn btn-ghost" onClick={reset} style={{ padding: "8px 14px" }}>
              <RotateCcw size={14} /> Teach another pair
            </button>
          </div>
        </div>
      )}

      {error && <p className="ui-base" style={{ color: "var(--flag)", marginTop: 14 }}>{error}</p>}
    </div>
  );
}
