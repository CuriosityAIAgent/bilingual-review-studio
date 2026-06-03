/**
 * Storage abstraction (spec §14, Appendix E). Three backends share this interface:
 *   • file     — local JSON store (default; zero setup; runs immediately)
 *   • postgres — plain Postgres via DATABASE_URL (Railway plugin); self-migrates
 *   • supabase — Postgres via @supabase/supabase-js (flip with STORAGE=supabase)
 *
 * The document model (with its append-only edit_log/handoff_log) is the unit of
 * persistence. Memory (glossary / neutralization rules / TM) is stored
 * separately so it is shared across documents — that is the flywheel (spec §13).
 */
import type {
  DocModel,
  DocStatus,
  GlossaryEntry,
  Locale,
  NeutralizationRule,
  TmEntry,
  TmProposal,
} from "@/src/lib/doc-model";
import { blockNeedsReview } from "@/src/lib/doc-model";
import { getThresholds } from "@/src/lib/config";
import { nowIso } from "@/src/lib/ids";

export interface DocSummary {
  doc_id: string;
  title: string;
  filename: string;
  source_type: "docx" | "txt" | "pdf";
  target_locale: Locale;
  status: DocStatus;
  block_count: number;
  approved_count: number;
  needs_review_count: number;
  edits_per_1k: number;
  owner_team: string;
  created_at: string;
  updated_at: string;
  /** Soft-delete tombstone (null = active). Drives the Library "Deleted" tab. */
  deleted_at: string | null;
}

export interface Store {
  // ── documents ──────────────────────────────────────────────────────────────
  saveDoc(doc: DocModel): Promise<void>;
  getDoc(docId: string): Promise<DocModel | null>;
  /** ACTIVE documents only (soft-deleted ones are excluded). The single
   * chokepoint every consumer (queue, metrics, home) shares — so a tombstoned
   * doc can't leak back into the workflow through a forgotten call site. */
  listDocs(): Promise<DocSummary[]>;
  /** Soft-deleted documents only — backs the Library "Deleted" tab. */
  listDeletedDocs(): Promise<DocSummary[]>;
  /** Soft-delete: tombstone the doc (keep it, recoverable). Not a hard delete. */
  deleteDoc(docId: string): Promise<void>;
  /** Clear the soft-delete tombstone, returning the doc to the active queue. */
  restoreDoc(docId: string): Promise<void>;

  // ── memory: neutral glossary ─────────────────────────────────────────────────
  getGlossary(): Promise<GlossaryEntry[]>;
  saveGlossary(entries: GlossaryEntry[]): Promise<void>;

  // ── memory: governed neutralization rules ────────────────────────────────────
  getRules(): Promise<NeutralizationRule[]>;
  saveRules(rules: NeutralizationRule[]): Promise<void>;

  // ── memory: translation memory (incl. approved disclaimers) ──────────────────
  getTm(): Promise<TmEntry[]>;
  saveTm(entries: TmEntry[]): Promise<void>;

  // ── memory: TM proposals from reviewer edits (pending → approved/rejected) ────
  getTmProposals(): Promise<TmProposal[]>;
  saveTmProposals(proposals: TmProposal[]): Promise<void>;
}

/** Set/clear the soft-delete tombstone AND advance rev + updated_at, so the
 * transition participates in optimistic-concurrency and recency sorting exactly
 * like any other document mutation (a stale rev N edit after delete/restore 409s). */
export function tombstone(doc: DocModel, deleted: boolean): DocModel {
  doc.deleted_at = deleted ? nowIso() : null;
  doc.updated_at = nowIso();
  doc.rev += 1;
  return doc;
}

export function summarize(doc: DocModel): DocSummary {
  const approved = doc.blocks.filter(
    (b) => b.seg_status === "accepted" || b.seg_status === "locked",
  ).length;
  // Single source of truth (matches the quality gate + the review outline), with
  // the configured QE floor and the doc-level OCR flag folded in — so "% done"
  // never overstates readiness (incl. unresolved disclaimers and scanned PDFs).
  const { human_floor } = getThresholds();
  const ocr = doc.source.ocr_used;
  const needsReview = doc.blocks.filter((b) => {
    if (b.seg_status === "locked" || b.seg_status === "accepted") return false; // final → auto-pass
    return blockNeedsReview(b, human_floor) || ocr; // OCR routes every other segment to review
  }).length;
  return {
    doc_id: doc.doc_id,
    title: doc.title,
    filename: doc.source.filename,
    source_type: doc.source.type,
    target_locale: doc.target_locale,
    status: doc.status,
    block_count: doc.blocks.length,
    approved_count: approved,
    needs_review_count: needsReview,
    edits_per_1k: doc.metrics.edits_per_1k,
    owner_team: doc.owner.team_id,
    created_at: doc.created_at,
    updated_at: doc.updated_at,
    deleted_at: doc.deleted_at ?? null,
  };
}
