"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, FileText, FileType, Sparkles, Upload as UploadIcon } from "lucide-react";
import { api } from "@/app/lib/client";
import { useSeat } from "@/components/Providers";

type Status = "idle" | "drag" | "uploading" | "parsing" | "error";

export default function UploadPage() {
  const router = useRouter();
  const { seat } = useSeat();
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [samples, setSamples] = useState<{ name: string; title: string; words: number }[]>([]);
  const [recent, setRecent] = useState<{ doc_id: string; title: string; status: string }[]>([]);
  const [locale] = useState("es-419");
  const inputRef = useRef<HTMLInputElement>(null);

  const canUpload = !seat || seat.role === "author" || seat.role === "admin";

  useEffect(() => {
    api.fixtures().then((r) => setSamples(r.samples)).catch(() => {});
    api.listDocs().then((r) => setRecent(r.documents.slice(0, 5).map((d) => ({ doc_id: d.doc_id, title: d.title, status: d.status })))).catch(() => {});
  }, []);

  const go = useCallback(
    async (fn: () => Promise<{ doc_id: string }>) => {
      setStatus("parsing");
      setMessage("Reading layout → segmenting → translating → critiquing → validating…");
      try {
        const { doc_id } = await fn();
        router.push(`/review/${doc_id}`);
      } catch (e) {
        setStatus("error");
        setMessage((e as Error).message);
      }
    },
    [router],
  );

  const onFile = (file: File) => {
    const ok = /\.(docx|txt|md)$/i.test(file.name);
    if (!ok && /\.pdf$/i.test(file.name)) {
      setStatus("error");
      setMessage("PDF ingestion is a Phase 3 capability — try DOCX or plain text for now.");
      return;
    }
    if (!ok) {
      setStatus("error");
      setMessage("Word (.docx) or plain text (.txt/.md) only.");
      return;
    }
    go(() => api.uploadFile(file, locale));
  };

  const dragOver = status === "drag";

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "72px 24px 96px", textAlign: "center" }}>
      <div className="fade-up">
        <p className="label" style={{ marginBottom: 14 }}>Neutral Spanish · español neutro (es-419)</p>
        <h1 className="font-display" style={{ fontSize: 38, lineHeight: 1.12, letterSpacing: "-0.02em" }}>
          Bring a document to review.
        </h1>
        <p className="doc-body" style={{ color: "var(--ink-soft)", maxWidth: 520, margin: "14px auto 0" }}>
          A governed neutral-Spanish review workflow. The machine drafts; you neutralize regional
          word-choice; every correction becomes reusable, auditable institutional memory.
        </p>
      </div>

      {/* Dropzone */}
      <div
        className="fade-up"
        role="button"
        tabIndex={0}
        aria-label="Drop a file or browse"
        onClick={() => canUpload && inputRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && canUpload && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); if (canUpload) setStatus("drag"); }}
        onDragLeave={() => setStatus("idle")}
        onDrop={(e) => {
          e.preventDefault();
          setStatus("idle");
          const f = e.dataTransfer.files?.[0];
          if (f && canUpload) onFile(f);
        }}
        style={{
          marginTop: 40, padding: "52px 28px", borderRadius: "var(--r-lg)", cursor: canUpload ? "pointer" : "not-allowed",
          border: `1.5px dashed ${dragOver ? "var(--accent)" : status === "error" ? "var(--flag)" : "var(--line)"}`,
          background: dragOver ? "color-mix(in srgb, var(--accent) 7%, var(--surface))" : "var(--surface)",
          opacity: canUpload ? 1 : 0.6, transition: "all var(--dur) var(--ease)",
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".docx,.txt,.md"
          style={{ display: "none" }}
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
        />
        {status === "parsing" ? (
          <div className="font-ui">
            <Sparkles size={26} strokeWidth={1.6} style={{ color: "var(--accent)" }} className="live-dot" />
            <p style={{ fontWeight: 600, marginTop: 12 }}>Working…</p>
            <p className="ui-base" style={{ color: "var(--ink-soft)", marginTop: 4 }}>{message}</p>
          </div>
        ) : (
          <>
            <UploadIcon size={28} strokeWidth={1.5} style={{ color: dragOver ? "var(--accent)" : "var(--ink-faint)" }} />
            <p className="font-display" style={{ fontSize: 18, fontWeight: 500, marginTop: 12 }}>
              {canUpload ? "Drop a file or browse" : "Switch to an Author or Admin seat to upload"}
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16, flexWrap: "wrap" }}>
              <span className="tag"><FileType size={11} /> DOCX</span>
              <span className="tag"><FileText size={11} /> Plain text</span>
              <span className="tag" style={{ opacity: 0.55 }}>PDF · Phase 3</span>
            </div>
            {status === "error" && <p className="ui-base" style={{ color: "var(--flag)", marginTop: 16 }}>{message}</p>}
          </>
        )}
      </div>

      {/* Sample documents */}
      {samples.length > 0 && status !== "parsing" && (
        <div className="fade-up" style={{ marginTop: 28 }}>
          <p className="label" style={{ marginBottom: 10 }}>Or try a bundled sample</p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            {samples.map((s) => (
              <button
                key={s.name}
                className="btn btn-ghost"
                disabled={!canUpload}
                onClick={() => go(async () => {
                  const { text } = await api.fixture(s.name);
                  return api.uploadText(s.name, text, locale);
                })}
                style={{ flexDirection: "column", alignItems: "flex-start", textAlign: "left", padding: "12px 14px", maxWidth: 220 }}
              >
                <span className="font-display" style={{ fontWeight: 600, fontSize: 13 }}>{s.title}</span>
                <span className="ui-base mono" style={{ color: "var(--ink-faint)", fontWeight: 400 }}>{s.words} words</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Recent documents */}
      {recent.length > 0 && (
        <div style={{ marginTop: 44, textAlign: "left" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <p className="label">Recent documents</p>
            <Link href="/library" className="ui-base" style={{ color: "var(--accent)", fontWeight: 600, display: "inline-flex", gap: 4, alignItems: "center" }}>
              Library <ArrowRight size={13} />
            </Link>
          </div>
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            {recent.map((d) => (
              <Link key={d.doc_id} href={`/review/${d.doc_id}`} className="card" style={{ padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="font-display" style={{ fontWeight: 500 }}>{d.title}</span>
                <span className="tag">{d.status}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
