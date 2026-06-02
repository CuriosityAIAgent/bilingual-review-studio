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
}

export interface Store {
  // ── documents ──────────────────────────────────────────────────────────────
  saveDoc(doc: DocModel): Promise<void>;
  getDoc(docId: string): Promise<DocModel | null>;
  listDocs(): Promise<DocSummary[]>;
  deleteDoc(docId: string): Promise<void>;

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

export function summarize(doc: DocModel): DocSummary {
  const approved = doc.blocks.filter(
    (b) => b.seg_status === "accepted" || b.seg_status === "locked",
  ).length;
  const needsReview = doc.blocks.filter(
    (b) =>
      b.validator_results.some((v) => v.status === "fail" && v.blocking) ||
      b.critic_flags.some((f) => f.severity === "major" || f.severity === "critical") ||
      (b.qe_score !== null && b.qe_score < 0.55),
  ).length;
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
  };
}
