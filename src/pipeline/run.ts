/**
 * Pipeline orchestrator (spec §9): INGEST → PREPARE → TRANSLATE → memory
 * post-pass → REFINE (gated cross-model loop) → VALIDATE → GATE → DocModel.
 *
 * Two entry points:
 *   • runPipeline()   — a fresh upload becomes a reviewed document.
 *   • reTranslateDoc() — re-runs translate/refine/validate on the still-machine
 *     segments using CURRENT memory, preserving human edits. This is what makes
 *     a freshly-learned neutralization rule visibly take effect (the flywheel).
 */
import { buildModelRun, getLocale } from "@/src/lib/config";
import {
  type Block,
  type DocModel,
  type Locale,
  type UserRef,
  SCHEMA_VERSION,
  emptyMetrics,
} from "@/src/lib/doc-model";
import { id, nowIso } from "@/src/lib/ids";
import { computeMetrics } from "@/src/metrics";
import { applyGlossary, applyRules } from "@/src/memory/apply";
import { incrementRuleHits } from "@/src/memory";
import { ensureSeeded } from "@/src/memory/seed";
import { ingest } from "@/src/ingest";
import { type DisclaimerStatusMap, prepare } from "@/src/prepare";
import { dntTermsFromEntities } from "@/src/prepare/dnt";
import { type RefineContext, refineSegment } from "@/src/refine/loop";
import { type TranslateContext, translateSegments } from "@/src/translate/translator";
import { runValidators } from "@/src/validators";
import { getStore } from "@/src/store";

function titleFromBlocks(blocks: Block[], filename: string): string {
  const t = blocks.find((b) => b.type === "title");
  return t?.source_text || filename.replace(/\.[^.]+$/, "");
}

async function loadMemory() {
  const store = getStore();
  await ensureSeeded(store);
  const [glossary, rules, tm] = await Promise.all([store.getGlossary(), store.getRules(), store.getTm()]);
  return { glossary, rules, tm };
}

/** Translate + memory post-pass + refine + validate a set of machine blocks. */
async function processBlocks(
  blocks: Block[],
  disclaimerStatus: DisclaimerStatusMap,
  targetLocale: Locale,
): Promise<{ blocks: Block[]; appliedRuleIds: string[] }> {
  const locale = getLocale(targetLocale);
  const { glossary, rules, tm: _tm } = await loadMemory();
  void _tm;

  const dntTerms = Array.from(new Set(blocks.flatMap((b) => dntTermsFromEntities(b.entities))));
  const heading = blocks.find((b) => b.type === "title")?.source_text;
  const ctx: TranslateContext = { glossary, rules, locale, dntTerms, sectionHeading: heading };

  const machine = blocks.filter((b) => b.seg_status === "machine");
  const mtMap = await translateSegments(
    machine.map((b) => ({ id: b.id, source_text: b.source_text, dnt: b.dnt })),
    ctx,
  );

  const appliedRuleIds = new Set<string>();
  const out: Block[] = [];

  for (const b of blocks) {
    // Locked (exact-TM disclaimer) or accepted (exact-TM segment): keep as is.
    if (b.seg_status !== "machine") {
      out.push({ ...b, qe_score: b.qe_score ?? b.tm_match.score });
      continue;
    }

    const raw = mtMap[b.id] ?? "";
    // Deterministic memory enforcement (active rules + glossary are hard constraints).
    const ruleApplied = applyRules(raw, rules);
    const glossApplied = applyGlossary(ruleApplied.text, glossary);
    const enforced = glossApplied.text;
    for (const h of ruleApplied.hits) appliedRuleIds.add(h.rule_id);

    const refineCtx: RefineContext = {
      source: b.source_text,
      entities: b.entities,
      locale,
      glossary,
      rules,
      dntTerms: dntTermsFromEntities(b.entities),
      blockType: b.type,
      disclaimer: disclaimerStatus[b.id]?.status ? { status: disclaimerStatus[b.id].status } : undefined,
    };
    const refined = await refineSegment(enforced, refineCtx);

    const validatorResults = runValidators({
      source: b.source_text,
      target: refined.final,
      entities: b.entities,
      locale,
      glossary,
      rules,
      dntTerms: refineCtx.dntTerms,
      blockType: b.type,
      disclaimer: refineCtx.disclaimer,
    });

    out.push({
      ...b,
      mt_text: refined.final,
      final_text: refined.final,
      qe_score: refined.qe_score,
      critic_flags: refined.flags,
      validator_results: validatorResults,
      neutralization_hits: ruleApplied.hits,
      glossary_hits: glossApplied.hits,
      iterations: refined.iterations,
    });
  }

  return { blocks: out, appliedRuleIds: [...appliedRuleIds] };
}

export interface RunPipelineInput {
  filename: string;
  buffer: Buffer;
  owner: UserRef;
  targetLocale?: Locale;
}

export async function runPipeline(input: RunPipelineInput): Promise<DocModel> {
  const targetLocale = input.targetLocale ?? "es-419";
  const { blocks: rawBlocks, type, pages, ocr_used } = await ingest(input.filename, input.buffer);
  if (rawBlocks.length === 0) {
    throw new Error("No translatable content found in the document.");
  }

  const { glossary, rules, tm } = await loadMemory();
  const { blocks: prepared, disclaimerStatus } = prepare({
    blocks: rawBlocks,
    glossary,
    rules,
    tm,
    locale: getLocale(targetLocale),
  });

  const { blocks: processed, appliedRuleIds } = await processBlocks(prepared, disclaimerStatus, targetLocale);
  await incrementRuleHits(appliedRuleIds);

  const doc: DocModel = {
    schema_version: SCHEMA_VERSION,
    doc_id: id("doc"),
    title: titleFromBlocks(processed, input.filename),
    source_lang: "en",
    target_locale: targetLocale,
    source: { filename: input.filename, type, pages, ocr_used },
    owner: input.owner,
    assigned_to: input.owner,
    status: "draft",
    created_at: nowIso(),
    updated_at: nowIso(),
    model_run: buildModelRun(targetLocale),
    blocks: processed,
    figures: [],
    approval: {},
    metrics: emptyMetrics(),
    edit_log: [],
    handoff_log: [],
  };
  doc.metrics = computeMetrics(doc);
  return doc;
}

/** Re-run translate/refine/validate on still-machine segments with CURRENT memory. */
export async function reTranslateDoc(doc: DocModel): Promise<DocModel> {
  const { glossary, rules, tm } = await loadMemory();
  // Recompute disclaimer routing (memory may have changed).
  const { blocks: reprepared, disclaimerStatus } = prepare({
    blocks: doc.blocks,
    glossary,
    rules,
    tm,
    locale: getLocale(doc.target_locale),
  });
  // prepare may have re-marked machine segments; preserve human-touched ones.
  const merged = reprepared.map((rb) => {
    const orig = doc.blocks.find((b) => b.id === rb.id)!;
    return orig.seg_status === "machine" ? rb : orig;
  });
  const { blocks: processed, appliedRuleIds } = await processBlocks(merged, disclaimerStatus, doc.target_locale);
  await incrementRuleHits(appliedRuleIds);

  const next: DocModel = { ...doc, blocks: processed, updated_at: nowIso(), model_run: buildModelRun(doc.target_locale) };
  next.metrics = computeMetrics(next);
  return next;
}
