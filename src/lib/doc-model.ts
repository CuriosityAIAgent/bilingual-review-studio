/**
 * The Document Model — the contract (spec §8).
 *
 * Every pipeline stage reads and writes this object. It is versioned and is the
 * audit record. Models and prompts are configuration, not values baked in here
 * (spec §6) — see `config/models.yml` and `src/lib/config.ts`.
 *
 * Provenance lives in `model_run` (which models/prompts/glossary/rules produced
 * this), and the two append-only logs (`edit_log`, `handoff_log`) are the
 * immutable history (spec §10, §11, §13, §14).
 */

export const SCHEMA_VERSION = "1.0" as const;

// ── Locales ──────────────────────────────────────────────────────────────────
// v1 default is neutral Latin-American Spanish. Per-market locales are
// configurable (spec §2) but neutral is the primary deliverable.
export type Locale = "es-419" | "es-ES" | "es-MX";
export const DEFAULT_TARGET_LOCALE: Locale = "es-419";

// ── Roles, teams, status ─────────────────────────────────────────────────────
export type Role = "author" | "reviewer" | "approver" | "admin" | "viewer";

export interface UserRef {
  user_id: string;
  team_id: string;
}

/** An actor on an audit event may be a human OR a service account (spec §13). */
export interface ActorRef extends UserRef {
  role: Role | "system";
  display_name?: string;
}

/** Document lifecycle (spec §11 state machine). */
export type DocStatus =
  | "draft"
  | "in_review"
  | "changes_requested"
  | "approved"
  | "published";

/** Segment lifecycle (spec §11): machine → edited/proposed → accepted → locked. */
export type SegStatus =
  | "machine"
  | "edited"
  | "proposed"
  | "accepted"
  | "locked";

// ── Blocks & content ─────────────────────────────────────────────────────────
export type BlockType =
  | "title"
  | "subhead"
  | "body"
  | "list_item"
  | "table_cell"
  | "caption"
  | "disclaimer"
  | "footnote";

/**
 * Entity kinds extracted in PREPARE (spec §9 step 2) and re-checked against
 * `final_text` in VALIDATE. These are the "sacred" tokens (spec §16.2 #5).
 */
export type EntityKind =
  | "number"
  | "percent"
  | "date"
  | "currency"
  | "ticker"
  | "isin"
  | "fund"
  | "index"
  | "rating"
  | "entity";

export interface Entity {
  kind: EntityKind;
  /** The exact surface text in the source. */
  text: string;
  /** A normalised, comparable form (e.g. "1.2 billion" → "1200000000"). */
  norm: string;
  /** Character offset within the block's source_text, if known. */
  char_start?: number;
  char_end?: number;
}

export interface SourceSpan {
  char_start: number;
  char_end: number;
}

export interface BlockStyle {
  font?: string;
  size?: number;
  bold?: boolean;
  italic?: boolean;
  level?: number; // heading level / list depth
}

// ── Critic & validators ──────────────────────────────────────────────────────
export type FlagCategory =
  | "terminology"
  | "accuracy"
  | "fluency"
  | "locale"
  | "number"
  | "regionalism";

export type Severity = "minor" | "major" | "critical";

/** Structured MQM-style flag from the cross-model critic (spec §9, Appendix B). */
export interface CriticFlag {
  category: FlagCategory;
  severity: Severity;
  /** Exact offending text in the translation. */
  span: string;
  /** Proposed corrected text. */
  suggestion: string;
}

export type ValidatorName =
  | "number"
  | "currency"
  | "date"
  | "ticker"
  | "isin"
  | "dnt"
  | "glossary"
  | "regionalism"
  | "disclaimer"
  | "english_leakage";

export interface ValidatorIssue {
  span: string;
  message: string;
  expected?: string;
  found?: string;
}

/**
 * Output of a deterministic validator (spec §10). Each validator is independent
 * and testable. `blocking: true` failures prevent auto-pass at the gate.
 */
export interface ValidatorResult {
  validator: ValidatorName;
  status: "pass" | "fail";
  severity?: Severity;
  blocking: boolean;
  issues: ValidatorIssue[];
}

// ── Memory hits ──────────────────────────────────────────────────────────────
export interface GlossaryHit {
  source: string;
  approved_target: string;
  applied: boolean;
}

export interface NeutralizationHit {
  /** Rule id from the governed neutralization-rules store. */
  rule_id: string;
  regional_form: string;
  neutral_form: string;
  applied: boolean;
}

export interface TmMatch {
  /** 1.0 = exact, 0..1 = fuzzy, null/0 = none. */
  score: number;
  source: "TM" | "none";
  tm_id?: string;
}

// ── Comments (span-anchored, threaded) — spec §11 ────────────────────────────
export interface Comment {
  id: string;
  user_id: string;
  team_id: string;
  role: Role;
  source_span?: string;
  target_span?: string;
  text: string;
  ts: string;
  resolved: boolean;
  /** When a lexical debate is resolved, the proposed rule it produced (§13). */
  produced_rule_id?: string;
  thread_parent?: string;
}

// ── The block ────────────────────────────────────────────────────────────────
export interface Block {
  id: string;
  type: BlockType;
  page?: number;
  bbox?: [number, number, number, number];
  style?: BlockStyle;
  source_spans?: SourceSpan[];
  entities: Entity[];
  /** Do-Not-Translate (product/legal-entity names left verbatim). */
  dnt: boolean;

  source_text: string;
  /** Raw machine translation (pre-refine). */
  mt_text: string;
  /** Final accepted text (post-refine / post-edit). Drives export. */
  final_text: string;

  /** QE is a ROUTING signal only — never an approval signal (spec §15). */
  qe_score: number | null;
  critic_flags: CriticFlag[];
  validator_results: ValidatorResult[];

  glossary_hits: GlossaryHit[];
  neutralization_hits: NeutralizationHit[];
  tm_match: TmMatch;

  seg_status: SegStatus;
  /** Owner of this segment for review routing. */
  assigned_to?: UserRef;
  comments: Comment[];
  iterations: number;
}

// ── Figures (Phase 4 — flagged but not auto-translated in v1) ─────────────────
export interface FigureTextRun {
  bbox?: [number, number, number, number];
  source: string;
  translated: string;
  status: "auto" | "flagged";
}

export interface Figure {
  id: string;
  kind: "vector" | "raster";
  needs_human: boolean;
  text_runs: FigureTextRun[];
}

// ── Provenance & approval ─────────────────────────────────────────────────────
export interface ModelRun {
  translator_model_id: string;
  critic_model_id: string;
  qe_model_id: string;
  prompt_version: string;
  glossary_version: string;
  rules_version: string;
  thresholds: {
    qe_threshold: number;
    human_floor: number;
    max_iters: number;
  };
  /** Hash of the resolved config that produced this run (reproducibility). */
  config_hash: string;
}

export interface Approval {
  approved_by?: string;
  approved_at?: string;
  approval_scope?: "document" | "segment" | "disclaimer";
}

export interface DocMetrics {
  edits_per_1k: number;
  hter_by_category: Record<string, number>;
  number_fail_rate: number;
  terminology_fail_rate: number;
  regionalism_fail_rate: number;
  reviewer_accept_rate: number;
  time_to_approval_s: number;
}

// ── Append-only logs (immutable; corrections are compensating events) §10/§13 ──
export type EditAction =
  | "edit"
  | "propose"
  | "accept"
  | "reject"
  | "neutralize"
  | "lock";

export interface EditLogEntry {
  id: string;
  segment_id: string;
  actor: ActorRef;
  action: EditAction;
  before: string;
  after: string;
  char_edit_distance: number;
  /** Human-targeted Translation Edit Rate for this correction. */
  hter: number;
  error_categories_corrected: FlagCategory[];
  ts: string;
}

export type HandoffAction = "handoff" | "submit" | "approve" | "publish" | "reopen";

export interface HandoffLogEntry {
  id: string;
  action: HandoffAction;
  from?: UserRef;
  to?: UserRef;
  actor: ActorRef;
  note: string;
  status_from?: DocStatus;
  status_to?: DocStatus;
  ts: string;
}

// ── The document ──────────────────────────────────────────────────────────────
export interface DocModel {
  schema_version: typeof SCHEMA_VERSION;
  doc_id: string;
  title: string;
  source_lang: "en";
  target_locale: Locale;
  source: {
    filename: string;
    type: "docx" | "txt" | "pdf";
    pages?: number;
    ocr_used: boolean;
  };
  owner: UserRef;
  assigned_to: UserRef;
  status: DocStatus;
  created_at: string;
  updated_at: string;
  model_run: ModelRun;
  blocks: Block[];
  figures: Figure[];
  approval: Approval;
  metrics: DocMetrics;
  edit_log: EditLogEntry[];
  handoff_log: HandoffLogEntry[];
}

// ── Governed memory artifacts (spec §13, Appendix D) ──────────────────────────
export type LifecycleState =
  | "candidate"
  | "proposed"
  | "approved"
  | "active"
  | "deprecated";

/** Only ACTIVE/APPROVED rules are applied by the system (spec §13). */
export interface NeutralizationRule {
  id: string;
  regional_form: string;
  neutral_form: string;
  /** Which regional variant the regional_form belongs to. */
  variant?: "es-ES" | "es-MX" | "other";
  reason: string;
  locale: Locale;
  state: LifecycleState;
  decided_by?: UserRef;
  approved_by?: string;
  proposed_by?: UserRef;
  created_at: string;
  updated_at: string;
  /** How many times the rule has been auto-applied (flywheel evidence). */
  hits: number;
}

export interface GlossaryEntry {
  id: string;
  source: string;
  approved_target: string;
  forbidden_terms: string[];
  locale: Locale;
  domain?: string;
  state: LifecycleState;
  approved_by?: string;
  approved_at?: string;
  notes?: string;
}

export interface TmEntry {
  id: string;
  source_text: string;
  target_text: string;
  locale: Locale;
  /** Disclaimers are versioned; superseded translations are retained (§10). */
  kind: "disclaimer" | "boilerplate" | "segment";
  version: number;
  superseded_by?: string;
  approved_by?: string;
  approved_at?: string;
  created_at: string;
}

// ── Factory helpers ───────────────────────────────────────────────────────────
export function emptyMetrics(): DocMetrics {
  return {
    edits_per_1k: 0,
    hter_by_category: {},
    number_fail_rate: 0,
    terminology_fail_rate: 0,
    regionalism_fail_rate: 0,
    reviewer_accept_rate: 0,
    time_to_approval_s: 0,
  };
}

export function newBlock(partial: Partial<Block> & Pick<Block, "id" | "type" | "source_text">): Block {
  return {
    entities: [],
    dnt: false,
    mt_text: "",
    final_text: "",
    qe_score: null,
    critic_flags: [],
    validator_results: [],
    glossary_hits: [],
    neutralization_hits: [],
    tm_match: { score: 0, source: "none" },
    seg_status: "machine",
    comments: [],
    iterations: 0,
    ...partial,
  };
}

/** A block is auto-pass eligible only if no blocking/major issue remains (§15). */
export function hasBlockingValidatorFailure(b: Block): boolean {
  return b.validator_results.some((v) => v.status === "fail" && v.blocking);
}

export function hasMajorOrCriticalFlag(b: Block): boolean {
  return b.critic_flags.some((f) => f.severity === "major" || f.severity === "critical");
}
