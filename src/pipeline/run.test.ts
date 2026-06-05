import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NeutralizationRule } from "@/src/lib/doc-model";
import { getStore } from "@/src/store";
import { resetFixtureCache } from "@/src/translate/fixtures";
import { reTranslateDoc, runPipeline } from "./run";

let tmp: string;

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "brs-"));
  process.env.DATA_DIR = join(tmp, "data");
  const fx = join(tmp, "fixtures.json");
  writeFileSync(
    fx,
    JSON.stringify({
      "the new platform runs on the device": "la nueva plataforma funciona en el ordenador",
      "the fund manages 1 billion in client assets": "el fondo gestiona 1 mil millones en activos de clientes",
    }),
  );
  process.env.FIXTURES_PATH = fx;
  resetFixtureCache();
});

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
  delete process.env.DATA_DIR;
  delete process.env.FIXTURES_PATH;
});

const owner = { user_id: "ana", team_id: "latam-strategy" };

describe("runPipeline (end-to-end, fixture mode)", () => {
  it("produces a valid draft DocModel with full validator coverage", async () => {
    const doc = await runPipeline({
      filename: "outlook.txt",
      buffer: Buffer.from("The fund manages 1 billion in client assets"),
      owner,
    });
    expect(doc.status).toBe("draft");
    expect(doc.blocks.length).toBeGreaterThan(0);
    const b = doc.blocks[0];
    expect(b.mt_text).toBeTruthy();
    expect(b.final_text).toBeTruthy();
    expect(b.validator_results).toHaveLength(10); // all §10 validators ran
    // "1 billion" → "mil millones" (NOT billón) ⇒ number validator passes.
    expect(b.validator_results.find((v) => v.validator === "number")?.status).toBe("pass");
    expect(doc.model_run.config_hash).toBeTruthy();
  });

  it("processes a multi-segment doc through the concurrency pool in source order", async () => {
    // More paragraphs than the refine pool's concurrency cap (6), so the bounded
    // mapPool actually queues work across multiple workers. The pool is
    // order-preserving by index, so block N must still map to source paragraph N
    // (a reorder bug here would silently scramble the bilingual record).
    const paras = Array.from({ length: 9 }, (_, i) => `Paragraph number ${i} states a distinct fact about markets.`);
    const doc = await runPipeline({
      filename: "multi.txt",
      buffer: Buffer.from(paras.join("\n\n")),
      owner,
    });
    expect(doc.blocks).toHaveLength(paras.length);
    // Order preserved end-to-end despite parallel refine.
    doc.blocks.forEach((b, i) => {
      expect(b.source_text).toBe(paras[i]);
      expect(b.final_text).toBeTruthy();
      expect(b.validator_results).toHaveLength(10);
    });
  });
});

describe("the learning flywheel (dynamic)", () => {
  it("flags an un-governed regionalism, then auto-neutralizes it once a rule is ACTIVE", async () => {
    // 1) No rule yet → the Peninsular term survives and is FLAGGED.
    const doc1 = await runPipeline({
      filename: "memo.txt",
      buffer: Buffer.from("The new platform runs on the device"),
      owner,
    });
    const block1 = doc1.blocks[0];
    expect(block1.final_text.toLowerCase()).toContain("ordenador");
    expect(block1.validator_results.find((v) => v.validator === "regionalism")?.status).toBe("fail");

    // 2) A reviewer teaches the neutralization rule and it is APPROVED → ACTIVE.
    const store = getStore();
    const rule: NeutralizationRule = {
      id: "rule_test", regional_form: "ordenador", neutral_form: "computadora",
      reason: "Peninsular vs neutral", locale: "es-419", state: "active",
      created_at: "", updated_at: "", hits: 0,
    };
    await store.saveRules([rule]);

    // 3) Re-translate with learnings → the SAME segment is now auto-neutralized.
    const doc2 = await reTranslateDoc(doc1);
    const block2 = doc2.blocks[0];
    expect(block2.final_text.toLowerCase()).toContain("computadora");
    expect(block2.final_text.toLowerCase()).not.toContain("ordenador");
    expect(block2.neutralization_hits.length).toBeGreaterThan(0);
    expect(block2.validator_results.find((v) => v.validator === "regionalism")?.status).toBe("pass");

    // 4) The rule's application counter advanced (flywheel evidence).
    const rulesAfter = await store.getRules();
    expect(rulesAfter[0].hits).toBeGreaterThan(0);
  });
});
