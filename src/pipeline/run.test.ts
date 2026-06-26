import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NeutralizationRule } from "@/src/lib/doc-model";
import { getLocale } from "@/src/lib/config";
import { getStore } from "@/src/store";
import { resetFixtureCache } from "@/src/translate/fixtures";
import { scriptConsistencyValidator } from "@/src/validators/script_consistency";
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
    expect(b.validator_results).toHaveLength(11); // all validators ran (incl. script_consistency)
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
      expect(b.validator_results).toHaveLength(11);
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

  it("isolates governed memory by target locale — a non-Spanish rule never touches an es-419 doc", async () => {
    // A rule tagged for a DIFFERENT target language must not apply to an es-419
    // document. This is the Phase-0 guarantee multi-target support depends on.
    const store = getStore();
    const foreign: NeutralizationRule = {
      id: "rule_zh_iso", regional_form: "plataforma", neutral_form: "ZH_ONLY_SENTINEL",
      reason: "wrong-locale rule", locale: "zh-Hans", state: "active",
      created_at: "", updated_at: "", hits: 0,
    };
    const existing = await store.getRules();
    await store.saveRules([...existing, foreign]);

    const doc = await runPipeline({
      filename: "isolation.txt",
      buffer: Buffer.from("The new platform runs on the device"),
      owner,
    });
    // The es-419 fixture renders "platform" → "plataforma"; the zh-Hans rule must
    // be filtered out, so the sentinel never appears in the Spanish output.
    expect(doc.target_locale).toBe("es-419");
    expect(JSON.stringify(doc.blocks)).not.toContain("ZH_ONLY_SENTINEL");
  });
});

describe("zh-Hant (Traditional Chinese) target", () => {
  it("translates to Traditional via the locale fixtures and the script check passes", async () => {
    const doc = await runPipeline({
      filename: "outlook-zh.txt",
      buffer: Buffer.from("Key takeaways\n\nWe enter the second half of the year selective, but constructive."),
      owner,
      targetLocale: "zh-Hant",
    });
    expect(doc.target_locale).toBe("zh-Hant");
    // The seeded zh-Hant fixtures render these to Traditional characters.
    const joined = doc.blocks.map((b) => b.final_text).join(" ");
    expect(joined).toContain("要點"); // "Key takeaways"
    // Every block ran the script-purity validator and it passed on clean Traditional.
    for (const b of doc.blocks) {
      expect(b.validator_results.find((v) => v.validator === "script_consistency")?.status).toBe("pass");
    }
  });

  it("flags a Simplified character leaking into a Traditional translation", () => {
    const result = scriptConsistencyValidator({
      source: "the country",
      target: "這個国家", // 国 is Simplified; Traditional is 國
      entities: [],
      locale: getLocale("zh-Hant"),
      glossary: [],
      rules: [],
      dntTerms: [],
      blockType: "body",
    });
    expect(result.status).toBe("fail");
    expect(result.issues.some((iss) => iss.span === "国")).toBe(true);
    // Same validator is a no-op on a Spanish target (self-gates by locale).
    const es = scriptConsistencyValidator({
      source: "the country", target: "el país", entities: [],
      locale: getLocale("es-419"), glossary: [], rules: [], dntTerms: [], blockType: "body",
    });
    expect(es.status).toBe("pass");
  });
});

describe("zh-Hans (Simplified Chinese) target", () => {
  it("translates to Simplified via the locale fixtures and the script check passes", async () => {
    const doc = await runPipeline({
      filename: "outlook-cn.txt",
      buffer: Buffer.from("Key takeaways\n\nThe world today is structurally very different from a decade ago."),
      owner,
      targetLocale: "zh-Hans",
    });
    expect(doc.target_locale).toBe("zh-Hans");
    const joined = doc.blocks.map((b) => b.final_text).join(" ");
    expect(joined).toContain("要点"); // "Key takeaways" (Simplified 点, not Traditional 點)
    for (const b of doc.blocks) {
      expect(b.validator_results.find((v) => v.validator === "script_consistency")?.status).toBe("pass");
    }
  });

  it("flags a Traditional character leaking into a Simplified translation", () => {
    const result = scriptConsistencyValidator({
      source: "the country",
      target: "这个國家", // 國 is Traditional; Simplified is 国
      entities: [],
      locale: getLocale("zh-Hans"),
      glossary: [], rules: [], dntTerms: [], blockType: "body",
    });
    expect(result.status).toBe("fail");
    expect(result.issues.some((iss) => iss.span === "國")).toBe(true);
  });
});
