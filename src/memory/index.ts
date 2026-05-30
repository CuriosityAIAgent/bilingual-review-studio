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
  UserRef,
} from "@/src/lib/doc-model";
import { id, nowIso } from "@/src/lib/ids";
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
  // Supersede a prior approved entry with the same source (keep it for audit).
  const prior = tm.find((t) => t.source_text === i.source_text && !t.superseded_by);
  const entry: TmEntry = {
    id: id("tm"),
    source_text: i.source_text,
    target_text: i.target_text,
    locale: i.locale ?? "es-419",
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
