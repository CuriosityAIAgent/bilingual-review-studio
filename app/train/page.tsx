"use client";
import { useRef, useState } from "react";
import { ArrowRight, BookPlus, FileUp, RotateCcw, Sparkles } from "lucide-react";
import { api, type MemoryImportPreview, type MemoryImportCommit, type TmImportStatus } from "@/app/lib/client";
import { TARGET_LOCALES, roleLabel } from "@/app/lib/roles";
import { useSeat } from "@/components/Providers";

const STATUS: Record<TmImportStatus, { label: string; color: string }> = {
  new: { label: "new", color: "var(--memory)" },
  supersede: { label: "updates wording", color: "var(--edited)" },
  duplicate: { label: "already known", color: "var(--ink-faint)" },
  protected: { label: "disclaimer · locked", color: "var(--flag)" },
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
  const [locale, setLocale] = useState("es-419");
  const [align, setAlign] = useState<"paragraph" | "semantic">("paragraph");
  const targetLabel = TARGET_LOCALES.find((l) => l.code === locale)?.label ?? "Neutral Spanish";
  const [phase, setPhase] = useState<"input" | "preview" | "done">("input");
  const [preview, setPreview] = useState<MemoryImportPreview | null>(null);
  const [done, setDone] = useState<MemoryImportCommit | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  // Which input produced the current preview — so Save commits via the matching
  // endpoint (re-reads the same .docx for file imports; re-aligns text for paste).
  const [src, setSrc] = useState<"paste" | "file">("paste");
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const onProcess = async () => {
    setBusy("process"); setError("");
    try {
      const r = await api.importMemoryPreview(source, target, align, locale);
      setSrc("paste"); setPreview(r); setPhase("preview");
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(""); }
  };

  const onProcessFile = async () => {
    if (!file) return;
    setBusy("file"); setError("");
    try {
      const r = await api.importMemoryDocxPreview(file, locale);
      setSrc("file"); setPreview(r); setPhase("preview");
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(""); }
  };

  const onSave = async () => {
    setBusy("save"); setError("");
    try {
      const r = src === "file" && file
        ? await api.importMemoryDocxCommit(file, locale)
        : await api.importMemoryCommit(source, target, align, locale);
      setDone(r); setPhase("done");
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(""); }
  };

  const reset = () => {
    setSource(""); setTarget(""); setPreview(null); setDone(null); setError(""); setPhase("input");
    setSrc("paste"); setFile(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const newCount = preview?.rows.filter((r) => r.status === "new").length ?? 0;
  const supCount = preview?.rows.filter((r) => r.status === "supersede").length ?? 0;
  const dupCount = preview?.rows.filter((r) => r.status === "duplicate").length ?? 0;
  const protCount = preview?.rows.filter((r) => r.status === "protected").length ?? 0;
  const mismatch = preview && (preview.sourceExtra.length > 0 || preview.targetExtra.length > 0);

  return (
    <div style={{ maxWidth: 1040, margin: "0 auto", padding: "40px 24px 96px" }}>
      <div className="fade-up" style={{ marginBottom: 26 }}>
        <p className="label">{seat ? `Signed in as ${roleLabel(seat.role)}` : "Translation Studio"} · train</p>
        <h1 className="font-display" style={{ fontSize: 30, letterSpacing: "-0.02em", marginTop: 4 }}>Train from finished work</h1>
        <p className="doc-body" style={{ color: "var(--ink-soft)", marginTop: 6, maxWidth: 660 }}>
          Upload a bilingual Word document — a two-column table of English and your finished {targetLabel} — or paste
          both sides as text. We turn each pair into translation memory for that language, so future drafts reuse how
          your team has actually translated, instead of starting cold.
        </p>
      </div>

      {!canLearn && (
        <div className="card" style={{ padding: 20, marginBottom: 20 }}>
          <span className="ui-base" style={{ color: "var(--ink-soft)" }}>
            Viewers can't add to memory. Sign in as Investment Strategist, Marketing or Supervisory Management to teach from finished work.
          </span>
        </div>
      )}

      {/* ── Input ── */}
      {phase === "input" && (
        <div className="fade-up">
          {/* Target language governs BOTH the upload and the paste path below —
              a Chinese pair never enters Spanish memory, and vice-versa. */}
          <label className="ui-base" style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--ink-soft)", marginBottom: 18 }}>
            Target language
            <select value={locale} onChange={(e) => setLocale(e.target.value)} disabled={!canLearn}
              style={{ padding: "7px 10px", borderRadius: "var(--r-sm)", border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink)", fontSize: 13.5 }}>
              {TARGET_LOCALES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </label>

          {/* ── Upload a bilingual Word document (two-column table) ── */}
          <div className="card" style={{ padding: 18, marginBottom: 22, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14 }}>
            <FileUp size={20} style={{ color: "var(--accent)", flexShrink: 0 }} />
            <div style={{ flex: "1 1 280px", minWidth: 0 }}>
              <p className="ui-base" style={{ fontWeight: 600, color: "var(--ink)" }}>Upload a bilingual Word document</p>
              <p className="ui-base" style={{ color: "var(--ink-soft)", marginTop: 2 }}>
                A two-column table — English in one column, {targetLabel} in the other. Each row becomes one memory pair;
                we detect which column is which.
              </p>
              {file && <p className="ui-base mono" style={{ color: "var(--ink-soft)", marginTop: 6 }}>{file.name}</p>}
            </div>
            <input ref={fileRef} type="file" accept=".docx" hidden
              onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(""); }} />
            <button className="btn btn-ghost ui-base" disabled={!canLearn} onClick={() => fileRef.current?.click()} style={{ padding: "8px 13px" }}>
              {file ? "Choose another" : "Choose .docx"}
            </button>
            <button className="btn btn-accent" disabled={!canLearn || !file || busy === "file"} onClick={onProcessFile} style={{ padding: "8px 15px" }}>
              {busy === "file" ? <Sparkles size={14} className="live-dot" /> : <FileUp size={14} />}
              {busy === "file" ? "Reading…" : "Process document"}
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "0 0 18px" }}>
            <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
            <span className="label" style={{ color: "var(--ink-faint)" }}>or paste the text</span>
            <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <p className="label" style={{ marginBottom: 8 }}>English — source</p>
              <textarea style={pane} value={source} disabled={!canLearn}
                onChange={(e) => setSource(e.target.value)}
                placeholder="Paste the full English document…" />
            </div>
            <div>
              <p className="label" style={{ marginBottom: 8 }}>{targetLabel} — your finished translation</p>
              <textarea style={pane} value={target} disabled={!canLearn} lang={locale.startsWith("zh") ? locale : "es"}
                onChange={(e) => setTarget(e.target.value)}
                placeholder={`Paste the full ${targetLabel} translation…`} />
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14, marginTop: 16 }}>
            <button className="btn btn-accent" disabled={!canLearn || !source.trim() || !target.trim() || busy === "process"}
              onClick={onProcess} style={{ padding: "9px 18px" }}>
              {busy === "process" ? <Sparkles size={15} className="live-dot" /> : <ArrowRight size={15} />}
              {busy === "process" ? "Aligning…" : "Process"}
            </button>
            <div style={{ display: "inline-flex", border: "1px solid var(--line)", borderRadius: "var(--r-md)", overflow: "hidden" }}>
              {(["paragraph", "semantic"] as const).map((m) => (
                <button key={m} onClick={() => setAlign(m)} disabled={!canLearn}
                  className="ui-base"
                  style={{
                    padding: "8px 12px", border: "none", cursor: "pointer",
                    background: align === m ? "var(--accent)" : "transparent",
                    color: align === m ? "#fff" : "var(--ink-soft)",
                    fontWeight: align === m ? 600 : 400,
                  }}>
                  {m === "paragraph" ? "Match by paragraph" : "Match by meaning"}
                </button>
              ))}
            </div>
          </div>
          <p className="ui-base" style={{ color: "var(--ink-faint)", marginTop: 8, maxWidth: 660 }}>
            {align === "paragraph"
              ? `Pairs paragraph-by-paragraph. Best when the ${targetLabel} is a faithful 1:1 translation of the English.`
              : `Splits both sides into sentences and matches them by meaning, keeping only confident pairs. Use this when the ${targetLabel} is a shorter or reordered adaptation, not a literal translation. You'll review every pair (with its match score) before anything is saved.`}
          </p>
        </div>
      )}

      {/* ── Preview: aligned pairs ── */}
      {phase === "preview" && preview && (
        <div className="fade-up">
          <div className="card" style={{ padding: "14px 18px", marginBottom: 16, display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center" }}>
            <span className="font-display" style={{ fontWeight: 600, fontSize: 16 }}>
              {preview.rows.length} {preview.align === "table" ? "rows from your document" : preview.align === "semantic" ? "matched sentence pairs" : "aligned segments"}
            </span>
            <span className="ui-base mono" style={{ color: "var(--ink-soft)" }}>
              <b style={{ color: "var(--memory)" }}>{newCount} new</b> · {supCount} updates · {dupCount} already known{protCount > 0 ? ` · ${protCount} disclaimer${protCount > 1 ? "s" : ""} locked` : ""}
            </span>
            <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              <button className="btn btn-ghost ui-base" onClick={() => setPhase("input")} style={{ padding: "7px 12px" }}>Back</button>
              <button className="btn btn-accent" disabled={busy === "save" || newCount + supCount === 0} onClick={onSave} style={{ padding: "7px 14px" }}>
                <BookPlus size={14} /> {busy === "save" ? "Saving…" : `Save ${newCount + supCount} to memory`}
              </button>
            </div>
          </div>

          {preview.warning && (
            <div className="card" style={{ padding: "12px 16px", marginBottom: 14, borderColor: "var(--flag)" }}>
              <span className="ui-base" style={{ color: "var(--flag)" }}>{preview.warning}</span>
            </div>
          )}

          {preview.align === "table" && (
            <div className="card" style={{ padding: "12px 16px", marginBottom: 14 }}>
              <span className="ui-base" style={{ color: "var(--ink-soft)" }}>
                Read {preview.rowsSeen} row{preview.rowsSeen === 1 ? "" : "s"} from your document
                {preview.headerSkipped ? " (skipped a header row)" : ""} into{" "}
                {preview.rows.length} English↔{targetLabel} pair{preview.rows.length === 1 ? "" : "s"}
                {preview.skippedTables ? ` · ignored ${preview.skippedTables} non-Chinese table${preview.skippedTables === 1 ? "" : "s"}` : ""}
                {preview.droppedRows ? ` · dropped ${preview.droppedRows} row${preview.droppedRows === 1 ? "" : "s"} missing one side` : ""}
                {preview.columnSwapped ? ` · detected ${targetLabel} in the left column` : ""}
                {preview.truncated ? ` · capped at ${preview.rows.length} pairs (document was very large)` : ""}.
              </span>
            </div>
          )}

          {mismatch && preview.align === "semantic" && (
            <div className="card" style={{ padding: "12px 16px", marginBottom: 14 }}>
              <span className="ui-base" style={{ color: "var(--ink-soft)" }}>
                Matched {preview.rows.length} of {preview.sourceBlocks} English sentences.{" "}
                {preview.sourceExtra.length} English and {preview.targetExtra.length} {targetLabel} sentences had no confident
                counterpart and were dropped — expected when the {targetLabel} is an adaptation rather than a literal translation.
              </span>
            </div>
          )}

          {mismatch && preview.align !== "semantic" && (
            <div className="card" style={{ padding: "12px 16px", marginBottom: 14, borderColor: "var(--edited)" }}>
              <span className="ui-base" style={{ color: "var(--edited)", fontWeight: 600 }}>Uneven segment counts.</span>{" "}
              <span className="ui-base" style={{ color: "var(--ink-soft)" }}>
                {preview.sourceBlocks} English vs {preview.targetBlocks} {targetLabel} paragraphs.
                {preview.sourceExtra.length + preview.targetExtra.length} unmatched paragraph(s) won't be saved. Even out the
                paragraph breaks and re-process, or switch to “Match by meaning” if the {targetLabel} is an adaptation.
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
                  {r.score != null && (
                    <span className="tag mono" style={{ marginLeft: 6, color: "var(--memory)", verticalAlign: "middle" }} title="cross-lingual match confidence">
                      {r.score.toFixed(2)}
                    </span>
                  )}
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
