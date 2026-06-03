"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, FileText, RotateCcw, Trash2 } from "lucide-react";
import { api } from "@/app/lib/client";
import type { DocSummary } from "@/src/store/types";
import { useSeat } from "@/components/Providers";

const STATUS_COLOR: Record<string, string> = {
  draft: "var(--ink-faint)", in_review: "var(--edited)", changes_requested: "var(--flag)",
  approved: "var(--memory)", published: "var(--accent)",
};

export default function LibraryPage() {
  const { seat } = useSeat();
  const [docs, setDocs] = useState<DocSummary[]>([]);
  const [deleted, setDeleted] = useState<DocSummary[]>([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  const loadActive = () => api.listDocs().then((r) => setDocs(r.documents)).finally(() => setLoading(false));
  const loadDeleted = () => api.listDocs({ deleted: true }).then((r) => setDeleted(r.documents));
  useEffect(() => { loadActive(); }, []);
  useEffect(() => { if (filter === "deleted") loadDeleted(); }, [filter]);

  const canDelete = seat?.role === "admin" || seat?.role === "author";
  const isDeleted = filter === "deleted";
  const shown = isDeleted ? deleted : filter === "all" ? docs : docs.filter((d) => d.status === filter);

  const onDelete = async (d: DocSummary) => {
    if (!confirm(`Delete "${d.title}"? It moves to the Deleted tab and can be restored.`)) return;
    await api.deleteDoc(d.doc_id);
    loadActive();
    loadDeleted();
  };
  const onRestore = async (d: DocSummary) => {
    await api.restoreDoc(d.doc_id);
    loadActive();
    loadDeleted();
  };

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: "40px 24px 80px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 22 }}>
        <div>
          <p className="label">Document queue</p>
          <h1 className="font-display" style={{ fontSize: 28 }}>Library</h1>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {["all", "draft", "in_review", "approved", "published", "deleted"].map((f) => (
            <button key={f} className={`btn btn-ghost ui-base`} onClick={() => setFilter(f)}
              style={{ padding: "6px 11px", fontWeight: 600, color: filter === f ? "var(--ink)" : "var(--ink-soft)", borderColor: filter === f ? "var(--line)" : "transparent" }}>
              {f.replace("_", " ")}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="ui-base" style={{ color: "var(--ink-soft)" }}>Loading…</p>
      ) : shown.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: "center" }}>
          <FileText size={26} strokeWidth={1.5} style={{ color: "var(--ink-faint)" }} />
          <p className="font-display" style={{ fontSize: 17, marginTop: 10 }}>No documents yet</p>
          <p className="ui-base" style={{ color: "var(--ink-soft)", marginTop: 4 }}>Upload one to start a review.</p>
          <Link href="/" className="btn btn-primary" style={{ marginTop: 16, display: "inline-flex" }}>Upload a document</Link>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {shown.map((d) => {
            const pct = d.block_count ? Math.round((d.approved_count / d.block_count) * 100) : 0;
            return (
              <div key={d.doc_id} className="card" style={{ padding: "16px 18px", display: "grid", gridTemplateColumns: "1fr auto auto", gap: 18, alignItems: "center" }}>
                {isDeleted ? (
                  <div style={{ minWidth: 0 }}>
                    <div className="font-display" style={{ fontWeight: 600, fontSize: 16, color: "var(--ink-soft)" }}>{d.title}</div>
                    <div className="ui-base" style={{ color: "var(--ink-faint)", marginTop: 3 }}>
                      {d.source_type.toUpperCase()} · {d.block_count} segments · deleted — restore to edit
                    </div>
                  </div>
                ) : (
                  <Link href={`/review/${d.doc_id}`} style={{ minWidth: 0 }}>
                    <div className="font-display" style={{ fontWeight: 600, fontSize: 16 }}>{d.title}</div>
                    <div className="ui-base" style={{ color: "var(--ink-soft)", marginTop: 3 }}>
                      {d.source_type.toUpperCase()} · {d.block_count} segments · {d.needs_review_count} need review · team {d.owner_team}
                    </div>
                  </Link>
                )}
                <div style={{ textAlign: "right" }}>
                  <div className="mono ui-base" style={{ color: "var(--ink-soft)" }}>{pct}% done</div>
                  <div className="mono ui-base" style={{ color: "var(--ink-faint)" }}>{d.edits_per_1k} edits/1k</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span className="tag" style={{ color: STATUS_COLOR[d.status] }}>
                    <span className="dot" style={{ background: STATUS_COLOR[d.status] }} /> {d.status.replace("_", " ")}
                  </span>
                  {canDelete && (isDeleted ? (
                    <button className="btn btn-ghost" aria-label="Restore" title="Restore this document"
                      onClick={() => onRestore(d)} style={{ padding: "6px 8px", color: "var(--memory)" }}>
                      <RotateCcw size={14} />
                    </button>
                  ) : (
                    <button className="btn btn-ghost" aria-label="Delete" title="Delete (recoverable)"
                      onClick={() => onDelete(d)} style={{ padding: "6px 8px", color: "var(--flag)" }}>
                      <Trash2 size={14} />
                    </button>
                  ))}
                  {!isDeleted && (
                    <Link href={`/review/${d.doc_id}`} className="btn btn-ghost" style={{ padding: "6px 8px" }}><ArrowRight size={15} /></Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
