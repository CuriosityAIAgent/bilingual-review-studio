/** Client-side API layer. The mock-auth seat (spec §11) is stored in
 * localStorage and sent as the `x-brs-seat` header on every request. */
import type { DocModel, GlossaryEntry, NeutralizationRule, TmEntry, TmProposal } from "@/src/lib/doc-model";
import type { DocSummary } from "@/src/store/types";
import type { Seat } from "@/src/auth";

export function getSeatId(): string {
  if (typeof window === "undefined") return "ana";
  return localStorage.getItem("brs-seat") || "ana";
}
export function setSeatId(id: string): void {
  localStorage.setItem("brs-seat", id);
}

async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...opts,
    headers: { "content-type": "application/json", "x-brs-seat": getSeatId(), ...(opts.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || res.statusText);
  return data as T;
}

/** Multipart upload of a bilingual Word document to the table-import endpoint. */
async function importDocx<T>(file: File, locale: string, mode: "preview" | "commit"): Promise<T> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("locale", locale);
  fd.append("mode", mode);
  const res = await fetch("/api/memory/import-docx", { method: "POST", body: fd, headers: { "x-brs-seat": getSeatId() } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || res.statusText);
  return data as T;
}

export interface ActionBody {
  kind: string;
  blockId?: string;
  text?: string;
  cats?: string[];
  reason?: string;
  toUserId?: string;
  note?: string;
  rev?: number;
}

export const api = {
  listDocs: (opts?: { deleted?: boolean }) =>
    req<{ documents: DocSummary[] }>(`/api/documents${opts?.deleted ? "?deleted=true" : ""}`),
  getDoc: (id: string) => req<{ doc: DocModel }>(`/api/documents/${id}`),
  uploadText: (filename: string, text: string, locale?: string) =>
    req<{ doc_id: string }>("/api/documents", { method: "POST", body: JSON.stringify({ filename, text, locale }) }),
  uploadFile: async (file: File, locale?: string) => {
    const fd = new FormData();
    fd.append("file", file);
    if (locale) fd.append("locale", locale);
    const res = await fetch("/api/documents", { method: "POST", body: fd, headers: { "x-brs-seat": getSeatId() } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as { error?: string }).error || res.statusText);
    return data as { doc_id: string };
  },
  action: (id: string, body: ActionBody) =>
    req<{ doc: DocModel }>(`/api/documents/${id}/action`, { method: "POST", body: JSON.stringify(body) }),
  deleteDoc: (id: string) => req<{ deleted: string }>(`/api/documents/${id}`, { method: "DELETE" }),
  restoreDoc: (id: string) => req<{ restored: string }>(`/api/documents/${id}/restore`, { method: "POST" }),
  rules: () => req<{ rules: NeutralizationRule[] }>("/api/rules"),
  proposeRule: (body: { regional_form: string; neutral_form: string; reason?: string; variant?: string; locale?: string }) =>
    req<{ rule: NeutralizationRule }>("/api/rules", { method: "POST", body: JSON.stringify(body) }),
  governRule: (id: string, action: "approve" | "deprecate") =>
    req<{ rule: NeutralizationRule }>(`/api/rules/${id}`, { method: "POST", body: JSON.stringify({ action }) }),
  memory: () => req<{ rules: NeutralizationRule[]; glossary: GlossaryEntry[]; tm: TmEntry[] }>("/api/memory"),
  metrics: (locale?: string) =>
    req<{
      curve: { doc_id: string; title: string; created_at: string; edits_per_1k: number }[];
      documents: number; active_rules: number; proposed_rules: number;
      total_rule_hits: number; edits_per_1k_reduction_pct: number;
    }>(`/api/metrics${locale ? `?locale=${encodeURIComponent(locale)}` : ""}`),
  seats: () => req<{ seats: Seat[] }>("/api/seats"),
  fixtures: () => req<{ samples: { name: string; title: string; words: number }[] }>("/api/fixtures"),
  fixture: (name: string) => req<{ name: string; text: string }>(`/api/fixtures?name=${encodeURIComponent(name)}`),
  importMemoryPreview: (source_text: string, target_text: string, align: AlignMode = "paragraph", locale = "es-419") =>
    req<MemoryImportPreview>("/api/memory/import", { method: "POST", body: JSON.stringify({ source_text, target_text, mode: "preview", align, locale }) }),
  importMemoryCommit: (source_text: string, target_text: string, align: AlignMode = "paragraph", locale = "es-419") =>
    req<MemoryImportCommit>("/api/memory/import", { method: "POST", body: JSON.stringify({ source_text, target_text, mode: "commit", align, locale }) }),
  // Bilingual Word document (two-column table) → TM. Rows are read straight
  // through as English↔translation pairs; preview classifies, commit writes.
  importMemoryDocxPreview: (file: File, locale = "es-419") => importDocx<MemoryImportPreview>(file, locale, "preview"),
  importMemoryDocxCommit: (file: File, locale = "es-419") => importDocx<MemoryImportCommit>(file, locale, "commit"),

  // Reviewer edit → memory (governed): propose, list pending, approve/reject.
  proposeMemory: (body: { source_text: string; target_text: string; doc_id: string; doc_title: string; segment_id: string }) =>
    req<{ proposal: TmProposal }>("/api/memory/proposals", { method: "POST", body: JSON.stringify(body) }),
  listMemoryProposals: (state = "pending") =>
    req<{ proposals: TmProposal[] }>(`/api/memory/proposals?state=${encodeURIComponent(state)}`),
  decideMemoryProposal: (id: string, action: "approve" | "reject") =>
    req<{ proposal: TmProposal; addedToTm: boolean }>(`/api/memory/proposals/${id}`, { method: "POST", body: JSON.stringify({ action }) }),
};

export type AlignMode = "paragraph" | "semantic";
export type TmImportStatus = "new" | "duplicate" | "supersede" | "protected";
interface MemoryImportSummary {
  sourceBlocks: number;
  targetBlocks: number;
  sourceExtra: string[];
  targetExtra: string[];
  /** "semantic" / "positional-fallback" (paste) or "table" (Word upload). */
  align?: string;
  matched?: number;
  warning?: string;
  // ── Word table-import diagnostics (align: "table") ──
  tables?: number;
  rowsSeen?: number;
  headerSkipped?: boolean;
  droppedRows?: number;
  /** The translation column was the left one (auto-detected). */
  columnSwapped?: boolean;
  /** False when column order couldn't be detected by script (assumed English-left). */
  columnConfident?: boolean;
  cjkDetected?: boolean;
}
export interface MemoryImportPreview extends MemoryImportSummary {
  rows: { source_text: string; target_text: string; status: TmImportStatus; score?: number }[];
}
export interface MemoryImportCommit extends MemoryImportSummary {
  result: { added: number; superseded: number; skipped: number };
}
