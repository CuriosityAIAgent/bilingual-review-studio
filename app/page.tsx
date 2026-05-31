"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, FileText, Sparkles, Upload as UploadIcon } from "lucide-react";
import { api } from "@/app/lib/client";
import type { DocSummary } from "@/src/store/types";
import { roleLabel } from "@/app/lib/roles";
import { useSeat } from "@/components/Providers";

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
  const inputRef = useRef<HTMLInputElement>(null);

  const canUpload = !seat || seat.role === "author" || seat.role === "admin";

  useEffect(() => {
    api.fixtures().then((r) => setSamples(r.samples)).catch(() => {});
    api.listDocs().then((r) => setDocs(r.documents)).catch(() => {});
  }, []);

  const go = useCallback(async (fn: () => Promise<{ doc_id: string }>) => {
    setBusy("parsing"); setError("");
    try {
      const { doc_id } = await fn();
      router.push(`/review/${doc_id}`);
    } catch (e) { setBusy(""); setError((e as Error).message); }
  }, [router]);

  const onFile = (file: File) => {
    if (!/\.(docx|txt|md)$/i.test(file.name)) {
      setError(/\.pdf$/i.test(file.name) ? "PDF is a Phase 3 capability — try DOCX or plain text." : "Word (.docx) or plain text (.txt/.md) only.");
      return;
    }
    go(() => api.uploadFile(file));
  };

  const uploadedNames = new Set(docs.map((d) => d.filename));
  const freshSamples = samples.filter((s) => !uploadedNames.has(s.name));

  return (
    <div style={{ maxWidth: 1040, margin: "0 auto", padding: "40px 24px 96px" }}>
      <div className="fade-up" style={{ marginBottom: 30 }}>
        <p className="label">{seat ? `Signed in as ${roleLabel(seat.role)}` : "Translation Studio"}</p>
        <h1 className="font-display" style={{ fontSize: 30, letterSpacing: "-0.02em", marginTop: 4 }}>Current work</h1>
        <p className="doc-body" style={{ color: "var(--ink-soft)", marginTop: 6, maxWidth: 620 }}>
          English research, translated to neutral Spanish and reviewed through the short process. Open a piece to pick up where it stands, or start something new below.
        </p>
      </div>

      {busy === "parsing" && (
        <div className="card fade-up" style={{ padding: 28, display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <Sparkles size={20} className="live-dot" style={{ color: "var(--accent)" }} />
          <span className="font-ui" style={{ fontWeight: 600 }}>Translating…</span>
          <span className="ui-base" style={{ color: "var(--ink-soft)" }}>reading → segmenting → translating → checking</span>
        </div>
      )}

      {/* In-progress documents */}
      {docs.length > 0 && (
        <div style={{ marginBottom: 30 }}>
          <p className="label" style={{ marginBottom: 12 }}>In progress · {docs.length}</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
            {docs.map((d) => {
              const pct = d.block_count ? Math.round((d.approved_count / d.block_count) * 100) : 0;
              return (
                <button key={d.doc_id} className="card" onClick={() => router.push(`/review/${d.doc_id}`)}
                  style={{ padding: "16px 18px", textAlign: "left", cursor: "pointer", display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                    <span className="font-display" style={{ fontWeight: 600, fontSize: 15.5, lineHeight: 1.25 }}>{d.title}</span>
                    <span className="tag" style={{ color: STATUS_COLOR[d.status], flexShrink: 0 }}>
                      <span className="dot" style={{ background: STATUS_COLOR[d.status] }} /> {d.status.replace("_", " ")}
                    </span>
                  </div>
                  <div className="ui-base mono" style={{ color: "var(--ink-faint)" }}>{pct}% approved · {d.needs_review_count} to resolve · {d.edits_per_1k} edits/1k</div>
                </button>
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
        <p className="label" style={{ marginBottom: 12 }}>Start something new</p>
        <div
          role="button" tabIndex={0} aria-label="Upload a document"
          onClick={() => canUpload && inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f && canUpload) onFile(f); }}
          className="card"
          style={{ padding: "26px 24px", display: "flex", alignItems: "center", gap: 16, cursor: canUpload ? "pointer" : "not-allowed", opacity: canUpload ? 1 : 0.6, border: "1.5px dashed var(--line)" }}
        >
          <input ref={inputRef} type="file" accept=".docx,.txt,.md" style={{ display: "none" }} onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          <UploadIcon size={22} strokeWidth={1.6} style={{ color: "var(--ink-faint)" }} />
          <div style={{ flex: 1 }}>
            <div className="font-display" style={{ fontWeight: 600, fontSize: 16 }}>
              {canUpload ? "Drop a document or browse" : "Sign in as Investment Strategist to start new work"}
            </div>
            <div className="ui-base" style={{ color: "var(--ink-soft)", marginTop: 2 }}>
              Word (.docx) or plain text · <span style={{ opacity: 0.6 }}>PDF in Phase 3</span>
            </div>
          </div>
          <FileText size={18} style={{ color: "var(--ink-faint)" }} />
        </div>
        {error && <p className="ui-base" style={{ color: "var(--flag)", marginTop: 12 }}>{error}</p>}
      </div>
    </div>
  );
}
