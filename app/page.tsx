"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, FileText, Sparkles, Trash2, Upload as UploadIcon } from "lucide-react";
import { api } from "@/app/lib/client";
import type { DocSummary } from "@/src/store/types";
import { roleLabel } from "@/app/lib/roles";
import { useSeat } from "@/components/Providers";
import { ProcessingView } from "@/components/ProcessingView";

type Sample = { name: string; title: string; words: number };

const STATUS_COLOR: Record<string, string> = {
  draft: "var(--ink-faint)", in_review: "var(--edited)", changes_requested: "var(--flag)",
  approved: "var(--memory)", published: "var(--accent)",
};

export default function HomePage() {
  const router = useRouter();
  const { seat } = useSeat();
  const [samples, setSamples] = useState<Sample[]>([]);
  const [docs, setDocs] = useState<DocSummary[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [paste, setPaste] = useState("");
  const [deleting, setDeleting] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const canUpload = !seat || seat.role === "author" || seat.role === "admin";
  // Delete is destructive, so require a RESOLVED author/admin seat — don't show
  // it during the brief null-seat window while /api/seats loads (a viewer would
  // otherwise see a button that 403s). Mirrors the library page's seat?.role check.
  const canDelete = seat?.role === "author" || seat?.role === "admin";

  const onDelete = async (e: React.MouseEvent, id: string, title: string) => {
    e.stopPropagation(); // don't open the doc — the card itself navigates
    if (!window.confirm(`Delete "${title}"? It moves to the Deleted tab in the Library and can be restored.`)) return;
    setDeleting(id); setError("");
    try {
      await api.deleteDoc(id);
      setDocs((ds) => ds.filter((d) => d.doc_id !== id));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDeleting("");
    }
  };

  useEffect(() => {
    api.fixtures().then((r) => setSamples(r.samples)).catch(() => {});
    api.listDocs().then((r) => setDocs(r.documents)).catch(() => {});
  }, []);

  const go = useCallback(async (fn: () => Promise<{ doc_id: string }>) => {
    setBusy("parsing"); setError("");
    const start = Date.now();
    try {
      const { doc_id } = await fn();
      // Let the stage animation play through (it runs while the real pipeline
      // works); if the doc was tiny and returned fast, hold briefly so the
      // movement is visible. A slow doc just redirects as soon as it's ready.
      const MIN_MS = 3600;
      const elapsed = Date.now() - start;
      if (elapsed < MIN_MS) await new Promise((r) => setTimeout(r, MIN_MS - elapsed));
      router.push(`/review/${doc_id}`);
    } catch (e) { setBusy(""); setError((e as Error).message); }
  }, [router]);

  const onFile = (file: File) => {
    if (!/\.(docx|txt|md)$/i.test(file.name)) {
      setError(/\.pdf$/i.test(file.name) ? "PDFs aren't supported yet — paste the text below, or use a Word (.docx) or text file." : "Word (.docx) or plain text (.txt/.md) only.");
      return;
    }
    go(() => api.uploadFile(file));
  };

  const onTranslate = () => {
    const text = paste.trim();
    if (!text) return;
    const firstLine = text.split("\n").find((l) => l.trim()) || "Pasted text";
    const slug = firstLine.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "pasted-text";
    go(() => api.uploadText(`${slug}.md`, text));
  };

  const uploadedNames = new Set(docs.map((d) => d.filename));
  const freshSamples = samples.filter((s) => !uploadedNames.has(s.name));

  // While a document translates, take over the page with the stage animation.
  if (busy === "parsing") {
    return (
      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "40px 24px 96px" }}>
        <ProcessingView />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1040, margin: "0 auto", padding: "40px 24px 96px" }}>
      <div className="fade-up" style={{ marginBottom: 30 }}>
        <p className="label">{seat ? `Signed in as ${roleLabel(seat.role)}` : "Translation Studio"}</p>
        <h1 className="font-display" style={{ fontSize: 30, letterSpacing: "-0.02em", marginTop: 4 }}>Current work</h1>
        <p className="doc-body" style={{ color: "var(--ink-soft)", marginTop: 6, maxWidth: 620 }}>
          English research, translated to neutral Spanish and reviewed through the short process. Open a piece to pick up where it stands, or start something new below.
        </p>
      </div>

      {/* In-progress documents */}
      {docs.length > 0 && (
        <div style={{ marginBottom: 30 }}>
          <p className="label" style={{ marginBottom: 12 }}>In progress · {docs.length}</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
            {docs.map((d) => {
              const pct = d.block_count ? Math.round((d.approved_count / d.block_count) * 100) : 0;
              const open = () => router.push(`/review/${d.doc_id}`);
              return (
                <div key={d.doc_id} className="card" role="button" tabIndex={0} onClick={open}
                  onKeyDown={(e) => {
                    // Only the card itself navigates on Enter/Space — ignore keys
                    // bubbling up from the nested delete button (else it navigates).
                    if (e.target !== e.currentTarget) return;
                    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
                  }}
                  style={{ padding: "16px 18px", textAlign: "left", cursor: "pointer", display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                    <span className="font-display" style={{ fontWeight: 600, fontSize: 15.5, lineHeight: 1.25 }}>{d.title}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                      <span className="tag" style={{ color: STATUS_COLOR[d.status] }}>
                        <span className="dot" style={{ background: STATUS_COLOR[d.status] }} /> {d.status.replace("_", " ")}
                      </span>
                      {canDelete && (
                        <button className="btn btn-ghost" aria-label={`Delete ${d.title}`} title="Delete this document"
                          disabled={deleting === d.doc_id} onClick={(e) => onDelete(e, d.doc_id, d.title)}
                          style={{ padding: "5px 6px", color: "var(--ink-faint)" }}>
                          <Trash2 size={14} strokeWidth={1.8} />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="ui-base mono" style={{ color: "var(--ink-faint)" }}>{pct}% approved · {d.needs_review_count} to resolve · {d.edits_per_1k} edits/1k</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* J.P. Morgan briefs to pick up */}
      {freshSamples.length > 0 && (
        <div style={{ marginBottom: 36 }}>
          <p className="label" style={{ marginBottom: 12 }}>J.P. Morgan — Top Market Takeaways</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
            {freshSamples.map((s) => (
              <button key={s.name} className="card" disabled={!!busy} onClick={() => go(async () => {
                const { text } = await api.fixture(s.name);
                return api.uploadText(s.name, text);
              })} style={{ padding: "16px 18px", textAlign: "left", cursor: "pointer", display: "flex", flexDirection: "column", gap: 8 }}>
                <span className="font-display" style={{ fontWeight: 600, fontSize: 15.5, lineHeight: 1.25 }}>{s.title}</span>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span className="ui-base mono" style={{ color: "var(--ink-faint)" }}>{s.words} words · EN → Neutral Spanish</span>
                  <span className="ui-base" style={{ color: "var(--accent)", fontWeight: 600, display: "inline-flex", gap: 4, alignItems: "center" }}>Open <ArrowRight size={13} /></span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Start something new */}
      <div>
        <p className="label" style={{ marginBottom: 12 }}>Translate something new</p>

        {/* Paste-to-translate — the primary path. Any English (doc, email, memo). */}
        <div className="card" style={{ padding: 18, marginBottom: 12, opacity: canUpload ? 1 : 0.6 }}>
          <p className="ui-base" style={{ color: "var(--ink-soft)", marginBottom: 10 }}>
            {canUpload
              ? "Paste English — a document, an email, a memo. We split it into paragraphs and translate to neutral Spanish, laid out side by side for review."
              : "Sign in as Investment Strategist to translate new text."}
          </p>
          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            disabled={!canUpload || !!busy}
            placeholder="Paste English text here…"
            style={{
              width: "100%", minHeight: 168, resize: "vertical", padding: "13px 15px",
              borderRadius: "var(--r-sm)", border: "1px solid var(--line)", background: "var(--surface-2)",
              color: "var(--ink)", fontFamily: "'Newsreader', Georgia, serif", fontSize: 15.5, lineHeight: 1.6,
            }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 12, flexWrap: "wrap" }}>
            <button className="btn btn-accent" disabled={!canUpload || !paste.trim() || !!busy} onClick={onTranslate} style={{ padding: "9px 18px" }}>
              <Sparkles size={15} /> {busy === "parsing" ? "Translating…" : "Translate to Neutral Spanish"}
            </button>
            <span className="ui-base" style={{ color: "var(--ink-faint)" }}>EN → Neutral Spanish · segmented into paragraphs</span>
          </div>
        </div>

        {/* Secondary: drop a file */}
        <div
          role="button" tabIndex={0} aria-label="Upload a document"
          onClick={() => canUpload && inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f && canUpload) onFile(f); }}
          className="card"
          style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 14, cursor: canUpload ? "pointer" : "not-allowed", opacity: canUpload ? 1 : 0.6, border: "1.5px dashed var(--line)" }}
        >
          <input ref={inputRef} type="file" accept=".docx,.txt,.md" style={{ display: "none" }} onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          <UploadIcon size={18} strokeWidth={1.6} style={{ color: "var(--ink-faint)" }} />
          <div style={{ flex: 1 }}>
            <div className="ui-base" style={{ fontWeight: 600 }}>Or drop a file</div>
            <div className="ui-base" style={{ color: "var(--ink-soft)", marginTop: 1 }}>Word (.docx) or plain text (.txt, .md)</div>
          </div>
          <FileText size={16} style={{ color: "var(--ink-faint)" }} />
        </div>
        {error && <p className="ui-base" style={{ color: "var(--flag)", marginTop: 12 }}>{error}</p>}
      </div>
    </div>
  );
}
