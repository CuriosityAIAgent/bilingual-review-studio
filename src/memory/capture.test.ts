import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type Block, type DocModel, newBlock } from "@/src/lib/doc-model";
import { extractEntities } from "@/src/prepare/entities";
import { getStore } from "@/src/store";
import { captureEditToMemory } from "./index";

const BY = { user_id: "ana", team_id: "latam-strategy" };

function block(over: Partial<Block> & Pick<Block, "id" | "type" | "source_text">): Block {
  const b = newBlock(over);
  b.entities = extractEntities(b.source_text);
  return b;
}

function makeDoc(b: Block): DocModel {
  return {
    schema_version: "1.0", doc_id: "doc_t", title: "t", source_lang: "en", target_locale: "es-419",
    source: { filename: "f.txt", type: "txt", ocr_used: false },
    owner: BY, assigned_to: BY, status: "in_review",
    created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", deleted_at: null, rev: 1,
    model_run: {} as DocModel["model_run"], blocks: [b], figures: [], approval: {},
    metrics: {} as DocModel["metrics"], edit_log: [], handoff_log: [],
  };
}

describe("captureEditToMemory (auto-memory on save)", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "brs-mem-"));
    process.env.DATA_DIR = dir;
  });
  afterEach(async () => {
    delete process.env.DATA_DIR;
    await rm(dir, { recursive: true, force: true });
  });

  it("captures a clean edit into active TM (auto-approved)", async () => {
    const b = block({ id: "b1", type: "body", source_text: "The market is strong this quarter", final_text: "El mercado está fuerte este trimestre" });
    expect(await captureEditToMemory(makeDoc(b), "b1", BY)).toBe(true);
    const tm = await getStore().getTm();
    expect(tm.some((t) => t.source_text.includes("market is strong") && !t.superseded_by)).toBe(true);
  });

  it("never learns a disclaimer", async () => {
    const b = block({ id: "b2", type: "disclaimer", source_text: "Past performance is not indicative of future results", final_text: "El rendimiento pasado no garantiza resultados futuros" });
    expect(await captureEditToMemory(makeDoc(b), "b2", BY)).toBe(false);
    expect(await getStore().getTm()).toHaveLength(0);
  });

  it("skips a no-op / untranslated edit (target === source)", async () => {
    const b = block({ id: "b3", type: "body", source_text: "BlackRock Aladdin", final_text: "BlackRock Aladdin" });
    expect(await captureEditToMemory(makeDoc(b), "b3", BY)).toBe(false);
  });

  it("does NOT learn an edit that still fails a blocking validator (billón trap)", async () => {
    const b = block({ id: "b4", type: "body", source_text: "Profits rose 2 billion", final_text: "Las ganancias subieron 2 billón" });
    expect(await captureEditToMemory(makeDoc(b), "b4", BY)).toBe(false);
    expect(await getStore().getTm()).toHaveLength(0);
  });
});
