import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addTm, removeTmEntries } from "./index";
import { getStore } from "@/src/store";

describe("removeTmEntries (surgical TM cleanup)", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "brs-rm-"));
    process.env.DATA_DIR = dir;
  });
  afterEach(async () => {
    delete process.env.DATA_DIR;
    await rm(dir, { recursive: true, force: true });
  });

  it("removes only the named segment entries, leaving the rest", async () => {
    const a = await addTm({ source_text: "Net asset value", target_text: "资产净值", locale: "zh-Hans" });
    const b = await addTm({ source_text: "English", target_text: "Chinese", locale: "zh-Hans" }); // noise
    const c = await addTm({ source_text: "Bond", target_text: "债券", locale: "zh-Hans" });

    const res = await removeTmEntries([b.id]);
    expect(res).toEqual({ removed: 1, skippedDisclaimers: 0, notFound: 0 });

    const active = (await getStore().getTm()).filter((t) => !t.superseded_by).map((t) => t.id);
    expect(active).toContain(a.id);
    expect(active).toContain(c.id);
    expect(active).not.toContain(b.id);
  });

  it("never deletes a disclaimer, even if its id is passed", async () => {
    const d = await addTm({ source_text: "NOT FDIC INSURED", target_text: "X", kind: "disclaimer", locale: "zh-Hans" });
    const res = await removeTmEntries([d.id]);
    expect(res).toEqual({ removed: 0, skippedDisclaimers: 1, notFound: 0 });
    const ids = (await getStore().getTm()).map((t) => t.id);
    expect(ids).toContain(d.id);
  });

  it("rolls back to the prior version instead of orphaning it", async () => {
    // v1 approved, then a bad update supersedes it (v2). Removing v2 must
    // REACTIVATE v1, not leave the source with no visible memory.
    const v1 = await addTm({ source_text: "Net asset value", target_text: "资产净值", locale: "zh-Hans" });
    const v2 = await addTm({ source_text: "Net asset value", target_text: "净值WRONG", locale: "zh-Hans" });
    expect((await getStore().getTm()).find((t) => t.id === v1.id)?.superseded_by).toBe(v2.id);

    const res = await removeTmEntries([v2.id]);
    expect(res.removed).toBe(1);
    const active = (await getStore().getTm()).filter((t) => !t.superseded_by);
    const head = active.find((t) => t.source_text === "Net asset value");
    expect(head?.id).toBe(v1.id); // v1 is active again
    expect(head?.target_text).toBe("资产净值");
  });

  it("keeps a single active head when a MIDDLE version is removed", async () => {
    // v1 -> v2 -> v3. Removing v2 must re-link v1 to v3, leaving ONLY v3 active
    // (not both v1 and v3).
    const v1 = await addTm({ source_text: "Yield", target_text: "收益率A", locale: "zh-Hans" });
    const v2 = await addTm({ source_text: "Yield", target_text: "收益率B", locale: "zh-Hans" });
    const v3 = await addTm({ source_text: "Yield", target_text: "收益率C", locale: "zh-Hans" });

    const res = await removeTmEntries([v2.id]);
    expect(res.removed).toBe(1);
    const all = await getStore().getTm();
    const active = all.filter((t) => t.source_text === "Yield" && !t.superseded_by);
    expect(active.map((t) => t.id)).toEqual([v3.id]); // exactly one active head
    expect(all.find((t) => t.id === v1.id)?.superseded_by).toBe(v3.id); // re-linked v1 → v3
  });

  it("reports ids that matched nothing", async () => {
    const res = await removeTmEntries(["tm_does_not_exist"]);
    expect(res).toEqual({ removed: 0, skippedDisclaimers: 0, notFound: 1 });
  });

  it("is a no-op for an empty id list", async () => {
    expect(await removeTmEntries([])).toEqual({ removed: 0, skippedDisclaimers: 0, notFound: 0 });
  });
});
