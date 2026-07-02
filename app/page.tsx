"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, FileText, Sparkles, Trash2, Upload as UploadIcon } from "lucide-react";
import { api } from "@/app/lib/client";
import type { DocSummary } from "@/src/store/types";
import { TARGET_LOCALES, roleLabel, localeLabel } from "@/app/lib/roles";
import { useSeat } from "@/components/Providers";
import { ProcessingView } from "@/components/ProcessingView";

type Sample = { name: string; title: string; words: number };

const STATUS_COLOR: Record<string, string> = {
  draft: "var(--ink-faint)", in_review: "var(--edited)", changes_requested: "var(--flag)",
  approved: "var(--memory)", published: "var(--accent)",
};

/**
 * Group documents by target language for display. Known target locales come
 * first in TARGET_LOCALES order; any unexpected code falls into a trailing group
 * keyed by its raw code. Only non-empty groups are returned. Preserves the input
 * order within each group.
 */
function groupByLocale(docs: DocSummary[]): { code: string; label: string; docs: DocSummary[] }[] {
  const groups: { code: string; label: string; docs: DocSummary[] }[] = [];
  const indexByCode = new Map<string, number>();
  const codeOf = (d: DocSummary) => d.target_locale;
  for (const d of docs) {
    const code = codeOf(d);
    let idx = indexByCode.get(code);
    if (idx === undefined) {
      idx = groups.length;
      indexByCode.set(code, idx);
      groups.push({ code, label: localeLabel(code), docs: [] });
    }
    groups[idx].docs.push(d);
  }
  const rank = (code: string) => {
    const i = TARGET_LOCALES.findIndex((l) => l.code === code);
    return i === -1 ? TARGET_LOCALES.length : i;
  };
  return groups.sort((a, b) => rank(a.code) - rank(b.code));
}

/** Humanize slug-like titles (pasted text becomes a hyphen filename with no spaces)
 *  so cards read as a title, not "inflation-in-particular-to-all-the-more-likely". A
 *  real title already has spaces and is left untouched. */
function prettyTitle(t: string): string {
  return /\s/.test(t) ? t : t.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Compact relative time for the "updated" line on Home cards ("3h ago",
 *  "2d ago"). Falls back to a local date past a week so old docs read cleanly. */
function relTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const s = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function HomePage() {
  const router = useRouter();
  const { seat } = useSeat();
  const [samples, setSamples] = useState<Sample[]>([]);
  const [docs, setDocs] = useState<DocSummary[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [paste, setPaste] = useState("");
  const [deleting, setDeleting] = useState("");
  // Target language for new documents. Each target carries its own governed memory.
  const [locale, setLocale] = useState("es-419");
  // Which target-language group "Current work" shows. Persisted so each team lands
  // on their own language instead of scrolling past the others. "all" = every group.
  const [workFilter, setWorkFilter] = useState("all");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const saved = typeof window !== "undefined" ? window.localStorage.getItem("ts_work_filter") : null;
      if (saved) setWorkFilter(saved);
    } catch { /* localStorage can throw (SecurityError) in sandboxed/private modes */ }
  }, []);
  const pickFilter = (code: string) => {
    setWorkFilter(code);
    try { window.localStorage.setItem("ts_work_filter", code); } catch { /* ignore quota/private-mode */ }
  };

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
    if (!/\.(pdf|docx|txt|md)$/i.test(file.name)) {
      setError("PDF, Word (.docx), or plain text (.txt/.md) only.");
      return;
    }
    go(() => api.uploadFile(file, locale));
  };

  const onTranslate = () => {
    const text = paste.trim();
    if (!text) return;
    const firstLine = text.split("\n").find((l) => l.trim()) || "Pasted text";
    const slug = firstLine.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "pasted-text";
    go(() => api.uploadText(`${slug}.md`, text, locale));
  };

  const uploadedNames = new Set(docs.map((d) => d.filename));
  const freshSamples = samples.filter((s) => !uploadedNames.has(s.name));

  // While a document translates, take over the page with the stage animation.
  if (busy === "parsing") {
    return (
      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "40px 24px 96px" }}>
        <ProcessingView targetLabel={TARGET_LOCALES.find((l) => l.code === locale)?.label ?? "Neutral Spanish"} />
      </div>
    );
  }

  // Group the queue by target language, then apply the team's language filter.
  // A saved filter that no longer matches any group falls back to "all".
  const groups = groupByLocale(docs);
  const activeFilter = groups.some((g) => g.code === workFilter) ? workFilter : "all";
  const shownGroups = activeFilter === "all" ? groups : groups.filter((g) => g.code === activeFilter);

  return (
    <div style={{ maxWidth: 1040, margin: "0 auto", padding: "40px 24px 96px" }}>
      <div className="fade-up" style={{ marginBottom: 30 }}>
        <p className="label">{seat ? `Signed in as ${roleLabel(seat.role)}` : "Translation Studio"}</p>
        <h1 className="font-display" style={{ fontSize: 30, letterSpacing: "-0.02em", marginTop: 4 }}>Current work</h1>
        <p className="doc-body" style={{ color: "var(--ink-soft)", marginTop: 6, maxWidth: 620 }}>
          English research, translated and reviewed through the short process. Open a piece to pick up where it stands, or start something new below.
        </p>
      </div>

      {/* In-progress documents */}
      {docs.length > 0 && (
        <div style={{ marginBottom: 30 }}>
          <p className="label" style={{ marginBottom: 12 }}>In progress · {docs.length}</p>
          {/* Language filter — each team jumps straight to its target language
              instead of scrolling past the others. Only shown when >1 language is
              in the queue; the choice persists across visits (localStorage). */}
          {groups.length > 1 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
              {[{ code: "all", label: "All languages", n: docs.length }, ...groups.map((g) => ({ code: g.code, label: g.label, n: g.docs.length }))].map((t) => {
                const on = activeFilter === t.code;
                return (
                  <button key={t.code} onClick={() => pickFilter(t.code)} aria-pressed={on}
                    style={{ padding: "5px 13px", fontSize: 13, borderRadius: 999, cursor: "pointer",
                      background: on ? "var(--ink)" : "transparent", color: on ? "var(--paper)" : "var(--ink-soft)",
                      border: `1px solid ${on ? "var(--ink)" : "var(--line)"}` }}>
                    {t.label} · {t.n}
                  </button>
                );
              })}
            </div>
          )}
          {shownGroups.map((group) => (
            <div key={group.code} style={{ marginBottom: 20 }}>
              <p className="label" style={{ marginBottom: 10, color: "var(--ink-soft)" }}>{group.label} · {group.docs.length}</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
                {group.docs.map((d) => {
                  // "clear" = no outstanding machine check (consistent with "X to resolve"
                  // beside it). Distinct from the outline's "done", which means a human
                  // actually reviewed the segment — the card can't know that.
                  const pct = d.block_count ? Math.round(((d.block_count - d.needs_review_count) / d.block_count) * 100) : 0;
                  const open = () => router.push(`/review/${d.doc_id}`);
                  return (
                    <div key={d.doc_id} className="card" role="button" tabIndex={0} onClick={open}
                      onKeyDown={(e) => {
                        // Only the card itself navigates on Enter/Space — ignore keys
                        // bubbling up from the nested delete button (else it navigates).
                        if (e.target !== e.currentTarget) return;
                        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
                      }}
                      style={{ padding: "15px 17px", textAlign: "left", cursor: "pointer", display: "flex", flexDirection: "column", gap: 10, minHeight: 116 }}>
                      {/* Title (clamped to 2 lines so every card is the same height). The
                          language is named by the group header above, so no per-card badge. */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                        <span className="font-display" title={prettyTitle(d.title)}
                          style={{ fontWeight: 600, fontSize: 15.5, lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", wordBreak: "break-word" }}>
                          {prettyTitle(d.title)}
                        </span>
                        {canDelete && (
                          <button className="btn btn-ghost" aria-label={`Delete ${prettyTitle(d.title)}`} title="Delete this document"
                            disabled={deleting === d.doc_id} onClick={(e) => onDelete(e, d.doc_id, d.title)}
                            style={{ padding: "4px 5px", color: "var(--ink-faint)", flexShrink: 0, marginTop: -2 }}>
                            <Trash2 size={14} strokeWidth={1.8} />
                          </button>
                        )}
                      </div>
                      {/* Footer pinned to the bottom so status + metrics line up across cards. */}
                      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
                        <span className="tag" style={{ color: STATUS_COLOR[d.status], alignSelf: "flex-start" }}>
                          <span className="dot" style={{ background: STATUS_COLOR[d.status] }} /> {d.status.replace("_", " ")}
                        </span>
                        <span className="ui-base mono" title="Clear = segments with no outstanding machine check (validator, critic flag, or low QE) or already accepted. This is not the same as 'reviewed' — open the document and Accept each segment to review it." style={{ color: "var(--ink-faint)" }}>{pct}% clear · {d.needs_review_count} to resolve · {d.edits_per_1k} edits/1k</span>
                        {/* Who touched it, and when — so an admin can audit today's work
                            at a glance (the full trail is in each doc's edit log). */}
                        <span className="ui-base" style={{ color: "var(--ink-faint)" }} title={`Last updated ${new Date(d.updated_at).toLocaleString()}`}>
                          {d.updated_by ? `edited by ${d.updated_by} · ` : ""}updated {relTime(d.updated_at)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
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
                return api.uploadText(s.name, text, locale);
              })} style={{ padding: "15px 17px", textAlign: "left", cursor: "pointer", display: "flex", flexDirection: "column", gap: 10, minHeight: 116 }}>
                <span className="font-display" title={s.title}
                  style={{ fontWeight: 600, fontSize: 15.5, lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", wordBreak: "break-word" }}>{s.title}</span>
                <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <span className="ui-base mono" style={{ color: "var(--ink-faint)" }}>{s.words} words · EN → {TARGET_LOCALES.find((l) => l.code === locale)?.label ?? "Neutral Spanish"}</span>
                  <span className="ui-base" style={{ color: "var(--accent)", fontWeight: 600, display: "inline-flex", gap: 4, alignItems: "center", flexShrink: 0 }}>Open <ArrowRight size={13} /></span>
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
              ? `Paste English — a document, an email, a memo. We split it into paragraphs and translate to ${TARGET_LOCALES.find((l) => l.code === locale)?.label ?? "Neutral Spanish"}, laid out side by side for review.`
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
              <Sparkles size={15} /> {busy === "parsing" ? "Translating…" : `Translate to ${TARGET_LOCALES.find((l) => l.code === locale)?.label ?? "Neutral Spanish"}`}
            </button>
            {/* Target language — each carries its own governed memory. */}
            <label className="ui-base" style={{ display: "inline-flex", alignItems: "center", gap: 7, color: "var(--ink-soft)" }}>
              Target
              <select
                value={locale}
                onChange={(e) => setLocale(e.target.value)}
                disabled={!canUpload || !!busy}
                style={{ padding: "7px 9px", borderRadius: "var(--r-sm)", border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink)", fontSize: 13.5 }}
              >
                {TARGET_LOCALES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
              </select>
            </label>
            <span className="ui-base" style={{ color: "var(--ink-faint)" }}>EN → {TARGET_LOCALES.find((l) => l.code === locale)?.label ?? "Neutral Spanish"} · segmented into paragraphs</span>
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
          <input ref={inputRef} type="file" accept=".pdf,.docx,.txt,.md" style={{ display: "none" }} onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          <UploadIcon size={18} strokeWidth={1.6} style={{ color: "var(--ink-faint)" }} />
          <div style={{ flex: 1 }}>
            <div className="ui-base" style={{ fontWeight: 600 }}>Or drop a file</div>
            <div className="ui-base" style={{ color: "var(--ink-soft)", marginTop: 1 }}>PDF, Word (.docx), or plain text (.txt, .md) · scanned PDFs need OCR (not yet supported)</div>
          </div>
          <FileText size={16} style={{ color: "var(--ink-faint)" }} />
        </div>
        {error && <p className="ui-base" style={{ color: "var(--flag)", marginTop: 12 }}>{error}</p>}
      </div>
    </div>
  );
}
