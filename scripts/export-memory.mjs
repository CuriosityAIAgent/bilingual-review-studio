#!/usr/bin/env node
/**
 * export-memory.mjs — export the governed, per-language institutional memory into
 * self-describing JSON bundles for handoff to a build team.
 *
 * What this is: the three GOVERNED memory collections for each target locale —
 * Translation Memory (tm/<locale>.json), the neutral glossary
 * (glossaries/neutral-<locale>.json) and the neutralization rules
 * (glossaries/neutralization-rules-<locale>.json) — plus the applied locale
 * CONFIG (config/locales/<locale>.yml). This is the curated, auditable asset that
 * makes translations high quality; it is NOT machine-translation output.
 *
 * What this is NOT: the offline demo fixtures (glossaries/fixture-translations*.json)
 * are a no-key word-substitution dictionary, never governed memory (ADR 0013), so
 * they are deliberately excluded. Pure config (models/permissions/thresholds),
 * DDL (supabase/schema.sql), eval fixtures and planning corpora are excluded too.
 *
 * Governance contract (ADR 0008): only entries with state `active` or `approved`
 * are ever applied by the pipeline. Entries in any other state (proposed /
 * candidate / deprecated) are emitted under `governance_queue`, verbatim with their
 * `state`, and MUST NOT be folded into a live system without approver/admin sign-off.
 *
 * Reproducible: reads only committed source files; no network, no MT. Re-run with
 *   node scripts/export-memory.mjs
 */
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";

const ROOT = process.cwd();
const OUT_DIR = join(ROOT, "exports", "memory");
const LOCALES = ["es-419", "zh-Hans", "zh-Hant"];
const APPLIED_STATES = new Set(["active", "approved"]); // mirrors src/memory/apply.ts isApplicable()

const LOCALE_NAMES = {
  "es-419": "Spanish — neutral Latin American (es-419)",
  "zh-Hans": "Chinese — Simplified (zh-Hans)",
  "zh-Hant": "Chinese — Traditional (zh-Hant)",
};

const LIFECYCLE_LEGEND = {
  active: "Approved and in force — APPLIED by the pipeline.",
  approved: "Approved — APPLIED by the pipeline (treated equivalently to active).",
  proposed: "Submitted to the governance queue, awaiting approver/admin decision — NOT applied.",
  candidate: "Auto-suggested, not yet reviewed — NOT applied.",
  deprecated: "Retired by an admin — NOT applied (kept for audit history).",
};

const FIELD_DICTIONARY = {
  translation_memory: {
    id: "Stable TM segment id.",
    source_text: "Source-language segment (English).",
    target_text: "Approved target-language segment — this is the reusable asset.",
    locale: "Target locale this pair belongs to.",
    kind: "Segment class. 'disclaimer' = compliance boilerplate, routed separately and EXCLUDED from RAG few-shot retrieval.",
    version: "Monotonic version; superseded versions are replaced by a higher version (none superseded in this export).",
    approved_by: "User id of the approver/admin who signed this pair off.",
    approved_at: "ISO timestamp of approval.",
    created_at: "ISO timestamp the pair was created.",
  },
  glossary: {
    id: "Stable glossary entry id.",
    source: "Source term (English).",
    approved_target: "The single approved target rendering.",
    forbidden_terms: "Renderings that must NOT be used for this term (validator-enforced).",
    locale: "Target locale.",
    domain: "Subject domain (e.g. fixed-income, asset-class).",
    state: "Lifecycle state — see lifecycle_legend.",
    approved_by: "Approver id.",
    approved_at: "ISO approval timestamp.",
    notes: "Reviewer guidance for applying the term.",
  },
  neutralization_rules: {
    id: "Stable rule id.",
    regional_form: "Regionalism to neutralize away.",
    neutral_form: "Neutral replacement.",
    variant: "Source variant the regional_form belongs to (e.g. es-ES, es-MX).",
    reason: "Editorial justification for the rule.",
    locale: "Target locale.",
    state: "Lifecycle state — see lifecycle_legend.",
    proposed_by: "{user_id, team_id} who proposed the rule.",
    decided_by: "{user_id, team_id} who decided on it.",
    approved_by: "Approver id.",
    created_at: "ISO creation timestamp.",
    updated_at: "ISO last-update timestamp.",
    hits: "Count of times the rule has fired across processed documents.",
  },
};

function readJson(rel) {
  return JSON.parse(readFileSync(join(ROOT, rel), "utf8"));
}
function tryReadYaml(rel) {
  try {
    return parseYaml(readFileSync(join(ROOT, rel), "utf8"));
  } catch {
    return null;
  }
}
function splitByState(entries) {
  const applied = [];
  const governance_queue = [];
  for (const e of entries) {
    (APPLIED_STATES.has(e?.state) ? applied : governance_queue).push(e);
  }
  return { applied, governance_queue };
}
function countByKind(entries) {
  const by = {};
  for (const e of entries) by[e?.kind ?? "unknown"] = (by[e?.kind ?? "unknown"] ?? 0) + 1;
  return by;
}

// Provenance captured once, shared across bundles.
const generatedAt = new Date().toISOString();
let sourceCommit = "unknown";
try {
  sourceCommit = execSync("git rev-parse HEAD", { cwd: ROOT }).toString().trim();
} catch {
  /* not a git checkout */
}
const models = tryReadYaml("config/models.yml") ?? {};
const configVersions = models.versions ?? {};

mkdirSync(OUT_DIR, { recursive: true });

const index = {
  generated_at: generatedAt,
  source_repo: "CuriosityAIAgent/bilingual-review-studio",
  source_commit: sourceCommit,
  generator: "scripts/export-memory.mjs",
  doc_model_schema_version: "1.0",
  bundles: [],
};

for (const locale of LOCALES) {
  const tm = readJson(`tm/${locale}.json`);
  const glossaryAll = readJson(`glossaries/neutral-${locale}.json`);
  const rulesAll = readJson(`glossaries/neutralization-rules-${locale}.json`);
  const localeCfg = tryReadYaml(`config/locales/${locale}.yml`);

  const glossary = splitByState(glossaryAll);
  const rules = splitByState(rulesAll);

  const gaps = [];
  if (rules.applied.length === 0) {
    gaps.push(
      `No neutralization rules are in force for ${locale} (the rules file is empty or has no active/approved entries). ` +
        "Any reviewer-flagged neutralization knowledge that has not been approved is NOT captured here — it must pass " +
        "through the governed propose→approve lifecycle (/api/memory/proposals) before it becomes applicable. Do not " +
        "hand-edit rules into a live system; route them through governance.",
    );
  }
  if (rules.governance_queue.length > 0) {
    gaps.push(
      `${rules.governance_queue.length} neutralization rule(s) are in the governance queue (not applied): ` +
        rules.governance_queue.map((r) => `${r.id} (${r.state})`).join(", ") +
        ". They are included under neutralization_rules.governance_queue for visibility only.",
    );
  }
  const tmByKind = countByKind(tm);
  if (Object.keys(tmByKind).length === 1 && tmByKind.disclaimer) {
    gaps.push(
      "All TM entries are kind=disclaimer (compliance boilerplate). Disclaimers are routed separately and are " +
        "EXCLUDED from RAG few-shot retrieval, so this bundle contributes reusable disclaimer text but no few-shot " +
        "translation examples yet. Few-shot pairs grow via the Train page / 'Send to memory' governance flows.",
    );
  }

  const bundle = {
    meta: {
      locale,
      locale_name: LOCALE_NAMES[locale] ?? locale,
      doc_model_schema_version: "1.0",
      purpose:
        `Governed institutional translation memory for ${locale}. This is the curated, auditable asset (Translation ` +
        "Memory + neutral glossary + neutralization rules) plus the applied locale config that drives high-quality, " +
        "neutral output. It is NOT machine-translation output and NOT the offline demo fixtures.",
      generated_at: generatedAt,
      source_repo: "CuriosityAIAgent/bilingual-review-studio",
      source_commit: sourceCommit,
      generator: "scripts/export-memory.mjs",
      source_files: [
        `tm/${locale}.json`,
        `glossaries/neutral-${locale}.json`,
        `glossaries/neutralization-rules-${locale}.json`,
        `config/locales/${locale}.yml`,
      ],
      config_versions_global: configVersions, // from config/models.yml (es-419-derived, applied globally)
      counts: {
        translation_memory: tm.length,
        translation_memory_by_kind: tmByKind,
        glossary_applied: glossary.applied.length,
        glossary_governance_queue: glossary.governance_queue.length,
        neutralization_rules_applied: rules.applied.length,
        neutralization_rules_governance_queue: rules.governance_queue.length,
      },
      lifecycle_legend: LIFECYCLE_LEGEND,
      governance_contract:
        "Only entries with state 'active' or 'approved' are applied by the pipeline (src/memory/apply.ts). Entries " +
        "under any `governance_queue` are NOT applied; do not fold them into a live system without approver/admin " +
        "sign-off (ADR 0008). Logs are append-only; corrections are compensating events, never mutations.",
      field_dictionary: FIELD_DICTIONARY,
      gaps,
    },
    translation_memory: {
      description:
        "Approved source→target segment pairs replayed on future documents. kind=disclaimer is compliance boilerplate " +
        "routed separately and excluded from few-shot retrieval.",
      by_kind: tmByKind,
      entries: tm, // verbatim, all fields preserved
    },
    glossary: {
      description:
        "Approved term mappings (source→approved_target) with forbidden_terms. Applied when state is active|approved.",
      applied: glossary.applied,
      governance_queue: glossary.governance_queue,
    },
    neutralization_rules: {
      description:
        "Regional-form→neutral-form rewrite rules. Applied ONLY when state is active|approved; everything else is in " +
        "the governance queue and must not be auto-applied.",
      applied: rules.applied,
      governance_queue: rules.governance_queue,
    },
    locale_config: {
      description:
        "Applied locale configuration from config/locales/<locale>.yml. This is CONFIG, not lifecycle-governed memory, " +
        "but it materially drives quality: scale_terms (the billion=10^9 'mil millones' / 十亿 / 十億 trap), number " +
        "format, register, regional_flags (validator input), morphology, and the language-specific prompt clauses.",
      config: localeCfg,
    },
  };

  const outName = `${locale}.memory.json`;
  writeFileSync(join(OUT_DIR, outName), JSON.stringify(bundle, null, 2) + "\n");
  const sha = createHash("sha256").update(JSON.stringify(bundle)).digest("hex").slice(0, 16);
  index.bundles.push({
    locale,
    file: outName,
    counts: bundle.meta.counts,
    gaps: gaps.length,
    content_hash: sha,
  });
  console.log(
    `[export-memory] ${outName}: TM ${tm.length} (${JSON.stringify(tmByKind)}), glossary ${glossary.applied.length}+${glossary.governance_queue.length}q, rules ${rules.applied.length}+${rules.governance_queue.length}q`,
  );
}

writeFileSync(join(OUT_DIR, "index.json"), JSON.stringify(index, null, 2) + "\n");
console.log(`[export-memory] wrote index.json (${index.bundles.length} bundles) from commit ${sourceCommit.slice(0, 8)}`);
