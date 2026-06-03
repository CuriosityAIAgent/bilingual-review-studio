/**
 * Memory & the learning flywheel (spec §13) — the highest-value asset.
 *
 * Three governed memories: Translation Memory, the neutral glossary, and
 * neutralization rules. The rule lifecycle is GATED — a bad rule would
 * contaminate future output — so only ACTIVE/APPROVED rules are ever applied
 * (enforced in src/memory/apply.ts). Author/Reviewer PROPOSE; Reviewer (per
 * policy)/Approver/Admin APPROVE; Admin DEPRECATES.
 */
import type {
  GlossaryEntry,
  Locale,
  NeutralizationRule,
  TmEntry,
  TmProposal,
  UserRef,
} from "@/src/lib/doc-model";
import { id, nowIso } from "@/src/lib/ids";
import { isDisclaimer } from "@/src/prepare/disclaimer";
import { getStore } from "@/src/store";

// ── Neutralization rules ──────────────────────────────────────────────────────
export interface ProposeRuleInput {
  regional_form: string;
  neutral_form: string;
  reason: string;
  locale?: Locale;
  variant?: NeutralizationRule["variant"];
  proposed_by: UserRef;
}

export async function proposeRule(i: ProposeRuleInput): Promise<NeutralizationRule> {
  const store = getStore();
  const rules = await store.getRules();
  // Dedup: if an identical (regional→neutral) rule exists, return it.
  const existing = rules.find(
    (r) =>
      r.regional_form.toLowerCase() === i.regional_form.toLowerCase() &&
      r.neutral_form.toLowerCase() === i.neutral_form.toLowerCase() &&
      r.state !== "deprecated",
  );
  if (existing) return existing;

  const rule: NeutralizationRule = {
    id: id("rule"),
    regional_form: i.regional_form,
    neutral_form: i.neutral_form,
    variant: i.variant,
    reason: i.reason,
    locale: i.locale ?? "es-419",
    state: "proposed",
    proposed_by: i.proposed_by,
    created_at: nowIso(),
    updated_at: nowIso(),
    hits: 0,
  };
  await store.saveRules([...rules, rule]);
  return rule;
}

async function setRuleState(
  ruleId: string,
  state: NeutralizationRule["state"],
  decided_by?: UserRef,
): Promise<NeutralizationRule | null> {
  const store = getStore();
  const rules = await store.getRules();
  let updated: NeutralizationRule | null = null;
  const next = rules.map((r) => {
    if (r.id !== ruleId) return r;
    updated = {
      ...r,
      state,
      decided_by: decided_by ?? r.decided_by,
      approved_by: state === "active" ? decided_by?.user_id ?? r.approved_by : r.approved_by,
      updated_at: nowIso(),
    };
    return updated;
  });
  await store.saveRules(next);
  return updated;
}

/** Approve a rule → ACTIVE (immediately applied to subsequent translations). */
export const approveRule = (ruleId: string, by: UserRef) => setRuleState(ruleId, "active", by);
export const deprecateRule = (ruleId: string, by: UserRef) => setRuleState(ruleId, "deprecated", by);

/** Bump the application counter (flywheel evidence) for rules applied to a doc. */
export async function incrementRuleHits(ruleIds: string[]): Promise<void> {
  if (ruleIds.length === 0) return;
  const store = getStore();
  const rules = await store.getRules();
  const set = new Set(ruleIds);
  await store.saveRules(rules.map((r) => (set.has(r.id) ? { ...r, hits: r.hits + 1 } : r)));
}

// ── Glossary ───────────────────────────────────────────────────────────────────
export async function proposeGlossary(
  entry: Omit<GlossaryEntry, "id" | "state">,
  state: GlossaryEntry["state"] = "candidate",
): Promise<GlossaryEntry> {
  const store = getStore();
  const glossary = await store.getGlossary();
  const created: GlossaryEntry = { ...entry, id: id("gloss"), state };
  await store.saveGlossary([...glossary, created]);
  return created;
}

export async function approveGlossary(entryId: string, by: string): Promise<void> {
  const store = getStore();
  const glossary = await store.getGlossary();
  await store.saveGlossary(
    glossary.map((g) => (g.id === entryId ? { ...g, state: "active", approved_by: by, approved_at: nowIso() } : g)),
  );
}

// ── Translation Memory (versioned; approved wording is never deleted) ─────────────
export interface AddTmInput {
  source_text: string;
  target_text: string;
  kind?: TmEntry["kind"];
  locale?: Locale;
  approved_by?: string;
}

export async function addTm(i: AddTmInput): Promise<TmEntry> {
  const store = getStore();
  const tm = await store.getTm();
  const locale = i.locale ?? "es-419";
  // Supersede a prior approved entry with the same source (keep it for audit).
  // Scoped by locale so adding one locale never supersedes another's memory.
  const prior = tm.find((t) => t.source_text === i.source_text && !t.superseded_by && t.locale === locale);
  const entry: TmEntry = {
    id: id("tm"),
    source_text: i.source_text,
    target_text: i.target_text,
    locale,
    kind: i.kind ?? "segment",
    version: prior ? prior.version + 1 : 1,
    approved_by: i.approved_by,
    approved_at: nowIso(),
    created_at: nowIso(),
  };
  const next = prior ? tm.map((t) => (t.id === prior.id ? { ...t, superseded_by: entry.id } : t)) : tm;
  await store.saveTm([...next, entry]);
  return entry;
}

// ── Learn from a finished bilingual pair (bulk TM capture) ────────────────────
// A reviewer pastes completed English + completed Spanish; alignBilingual()
// segments and aligns them, and each pair is folded into TM so prior human work
// is reused on future documents. TM is reference memory (a match score surfaced
// to the translator / reused on exact match), not an auto-rewrite like a rule —
// so capture is direct rather than queued. Source steers content only.
export type TmImportStatus = "new" | "duplicate" | "supersede" | "protected";

export interface TmImportRow {
  source_text: string;
  target_text: string;
  status: TmImportStatus;
  /** Cross-lingual cosine of the match, when semantic alignment was used. */
  score?: number;
}

/** Classify each aligned pair against current (non-superseded) TM — no writes. */
export async function previewTmImport(
  pairs: { source: string; target: string }[],
  locale: Locale = "es-419",
): Promise<TmImportRow[]> {
  const store = getStore();
  const active = (await store.getTm()).filter((t) => !t.superseded_by && t.locale === locale);
  const seen = new Set<string>();
  return pairs.map((p) => {
    let status: TmImportStatus;
    if (seen.has(p.source)) {
      // Same source paragraph repeated within this paste — only the first is
      // written, so the repeats are marked duplicate to keep preview == commit.
      status = "duplicate";
    } else {
      seen.add(p.source);
      const prior = active.find((t) => t.source_text === p.source);
      // Disclaimers are approver/compliance-only (spec §4) and route by kind
      // (routeDisclaimer filters kind === "disclaimer"). The bulk learn flow must
      // never import them — whether or not they're already in TM — so they are
      // surfaced as protected (detected by content OR a prior disclaimer entry).
      status = isDisclaimer(p.source) || prior?.kind === "disclaimer"
        ? "protected"
        : !prior
          ? "new"
          : prior.target_text === p.target
            ? "duplicate"
            : "supersede";
    }
    return { source_text: p.source, target_text: p.target, status };
  });
}

export interface TmImportResult {
  added: number;
  superseded: number;
  skipped: number;
}

/** Commit aligned pairs to TM. Exact duplicates are skipped (no version churn);
 *  a changed target for an existing source supersedes the prior wording (kept). */
export async function commitTmImport(
  pairs: { source: string; target: string }[],
  approvedBy: string,
  locale: Locale = "es-419",
): Promise<TmImportResult> {
  const result: TmImportResult = { added: 0, superseded: 0, skipped: 0 };
  const seen = new Set<string>();
  for (const p of pairs) {
    // Within-batch repeat: first occurrence wins, so preview == commit and we
    // never supersede an entry we just wrote in the same import.
    if (seen.has(p.source)) {
      result.skipped++;
      continue;
    }
    seen.add(p.source);
    // Disclaimers are approver/compliance-only (spec §4) and route by kind. The
    // learn flow must never import one — even a brand-new disclaimer paragraph
    // would land as kind:"segment" and be invisible to disclaimer routing.
    if (isDisclaimer(p.source)) {
      result.skipped++;
      continue;
    }
    const store = getStore();
    // Scope by locale so a same-source entry in another locale (e.g. es-ES)
    // isn't treated as the prior for an es-419 import — keeps commit consistent
    // with preview, which already filters by locale.
    const prior = (await store.getTm()).find((t) => t.source_text === p.source && !t.superseded_by && t.locale === locale);
    if (prior && prior.kind === "disclaimer") {
      result.skipped++;
      continue;
    }
    if (prior && prior.target_text === p.target) {
      result.skipped++;
      continue;
    }
    // Preserve the prior entry's kind (e.g. boilerplate stays boilerplate); new
    // sources enter as plain segments.
    await addTm({ source_text: p.source, target_text: p.target, kind: prior ? prior.kind : "segment", locale, approved_by: approvedBy });
    if (prior) result.superseded++;
    else result.added++;
  }
  return result;
}

// ── TM proposals from reviewer edits (the "process to memory" step) ───────────
// A reviewer's correction does not silently enter memory. "Send to memory" files
// a PENDING proposal (English source + corrected Spanish); an approver approves
// it into TM or rejects it. This keeps the governance promise: memory changes
// only through an approved step, with a full audit trail.

export interface ProposeTmInput {
  source_text: string;
  target_text: string;
  doc_id: string;
  doc_title: string;
  segment_id: string;
  by: UserRef;
}

export async function proposeTmFromEdit(i: ProposeTmInput): Promise<TmProposal> {
  const store = getStore();
  const proposals = await store.getTmProposals();
  // If an identical pending proposal already exists, return it (idempotent — a
  // double-click or re-send doesn't queue duplicates for the approver).
  const dup = proposals.find(
    (p) => p.state === "pending" && p.source_text === i.source_text && p.target_text === i.target_text,
  );
  if (dup) return dup;
  const created: TmProposal = {
    id: id("tmprop"),
    source_text: i.source_text,
    target_text: i.target_text,
    doc_id: i.doc_id,
    doc_title: i.doc_title,
    segment_id: i.segment_id,
    proposed_by: i.by,
    proposed_at: nowIso(),
    state: "pending",
  };
  await store.saveTmProposals([...proposals, created]);
  return created;
}

export async function listTmProposals(state?: TmProposal["state"]): Promise<TmProposal[]> {
  const proposals = await getStore().getTmProposals();
  return state ? proposals.filter((p) => p.state === state) : proposals;
}

/** Approve → fold into TM (governed). Reject → discard. Disclaimers never enter
 *  via this path (they are approver/compliance-only and routed by kind). */
export async function decideTmProposal(
  proposalId: string,
  approve: boolean,
  by: string,
): Promise<{ proposal: TmProposal; addedToTm: boolean }> {
  const store = getStore();
  const proposals = await store.getTmProposals();
  const p = proposals.find((x) => x.id === proposalId);
  if (!p) throw new Error(`unknown proposal ${proposalId}`);
  if (p.state !== "pending") return { proposal: p, addedToTm: false };

  // Persist the decision FIRST, so a concurrent approval that re-reads sees a
  // non-pending state and no-ops (instead of both writing the same pair to TM).
  // Only then fold into TM. addTm supersedes by source, so even if a race slips
  // through, TM keeps a single active entry. (No cross-collection transaction is
  // available in the file/postgres/supabase stores; this ordering is the guard.)
  const decided: TmProposal = { ...p, state: approve ? "approved" : "rejected", decided_by: by, decided_at: nowIso() };
  await store.saveTmProposals(proposals.map((x) => (x.id === proposalId ? decided : x)));

  let addedToTm = false;
  if (approve && !isDisclaimer(p.source_text)) {
    await addTm({ source_text: p.source_text, target_text: p.target_text, kind: "segment", approved_by: by });
    addedToTm = true;
  }
  return { proposal: decided, addedToTm };
}
