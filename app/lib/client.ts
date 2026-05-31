/** Client-side API layer. The mock-auth seat (spec §11) is stored in
 * localStorage and sent as the `x-brs-seat` header on every request. */
import type { DocModel, GlossaryEntry, NeutralizationRule, TmEntry } from "@/src/lib/doc-model";
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
  listDocs: () => req<{ documents: DocSummary[] }>("/api/documents"),
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
  rules: () => req<{ rules: NeutralizationRule[] }>("/api/rules"),
  proposeRule: (body: { regional_form: string; neutral_form: string; reason?: string; variant?: string }) =>
    req<{ rule: NeutralizationRule }>("/api/rules", { method: "POST", body: JSON.stringify(body) }),
  governRule: (id: string, action: "approve" | "deprecate") =>
    req<{ rule: NeutralizationRule }>(`/api/rules/${id}`, { method: "POST", body: JSON.stringify({ action }) }),
  memory: () => req<{ rules: NeutralizationRule[]; glossary: GlossaryEntry[]; tm: TmEntry[] }>("/api/memory"),
  metrics: () =>
    req<{
      curve: { doc_id: string; title: string; created_at: string; edits_per_1k: number }[];
      documents: number; active_rules: number; proposed_rules: number;
      total_rule_hits: number; edits_per_1k_reduction_pct: number;
    }>("/api/metrics"),
  seats: () => req<{ seats: Seat[] }>("/api/seats"),
  fixtures: () => req<{ samples: { name: string; title: string; words: number }[] }>("/api/fixtures"),
  fixture: (name: string) => req<{ name: string; text: string }>(`/api/fixtures?name=${encodeURIComponent(name)}`),
  importMemoryPreview: (source_text: string, target_text: string) =>
    req<MemoryImportPreview>("/api/memory/import", { method: "POST", body: JSON.stringify({ source_text, target_text, mode: "preview" }) }),
  importMemoryCommit: (source_text: string, target_text: string) =>
    req<MemoryImportCommit>("/api/memory/import", { method: "POST", body: JSON.stringify({ source_text, target_text, mode: "commit" }) }),
};

export type TmImportStatus = "new" | "duplicate" | "supersede";
interface MemoryImportSummary {
  sourceBlocks: number;
  targetBlocks: number;
  sourceExtra: string[];
  targetExtra: string[];
}
export interface MemoryImportPreview extends MemoryImportSummary {
  rows: { source_text: string; target_text: string; status: TmImportStatus }[];
}
export interface MemoryImportCommit extends MemoryImportSummary {
  result: { added: number; superseded: number; skipped: number };
}
