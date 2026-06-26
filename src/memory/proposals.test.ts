import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decideTmProposal, listTmProposals, proposeTmFromEdit } from "./index";
import { getStore } from "@/src/store";

// Exercises the governed edit→memory path on the file store.
let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "brs-prop-"));
  process.env.DATA_DIR = dir;
  process.env.STORAGE = "file";
});
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

const by = { user_id: "diego", team_id: "iberia-marketing" };

describe("TM proposals (edit → memory, governed)", () => {
  it("files a pending proposal and is idempotent on identical resend", async () => {
    const a = await proposeTmFromEdit({ source_text: "Equity markets rose.", target_text: "La renta variable subió.", locale: "es-419", doc_id: "d1", doc_title: "Doc", segment_id: "b1", by });
    const b = await proposeTmFromEdit({ source_text: "Equity markets rose.", target_text: "La renta variable subió.", locale: "es-419", doc_id: "d1", doc_title: "Doc", segment_id: "b1", by });
    expect(a.id).toBe(b.id); // deduped
    expect((await listTmProposals("pending")).length).toBe(1);
  });

  it("approve folds the pair into TM; the proposal is marked approved", async () => {
    const p = await proposeTmFromEdit({ source_text: "Tariffs rose sharply.", target_text: "Los aranceles subieron con fuerza.", locale: "es-419", doc_id: "d1", doc_title: "Doc", segment_id: "b2", by });
    const r = await decideTmProposal(p.id, true, "carmen");
    expect(r.addedToTm).toBe(true);
    expect(r.proposal.state).toBe("approved");
    const tm = await getStore().getTm();
    expect(tm.some((t) => t.source_text === "Tariffs rose sharply." && t.target_text === "Los aranceles subieron con fuerza.")).toBe(true);
    expect((await listTmProposals("pending")).length).toBe(0);
  });

  it("deciding an already-decided proposal is a no-op (no double TM write)", async () => {
    const p = await proposeTmFromEdit({ source_text: "Yields fell.", target_text: "Los rendimientos cayeron.", locale: "es-419", doc_id: "d1", doc_title: "Doc", segment_id: "b4", by });
    await decideTmProposal(p.id, true, "carmen");
    const tmAfterFirst = (await getStore().getTm()).length;
    const again = await decideTmProposal(p.id, true, "carmen"); // re-approve
    expect(again.addedToTm).toBe(false);
    expect((await getStore().getTm()).length).toBe(tmAfterFirst); // no second write
  });

  it("reject discards without touching TM", async () => {
    const p = await proposeTmFromEdit({ source_text: "GDP grew.", target_text: "El PIB creció.", locale: "es-419", doc_id: "d1", doc_title: "Doc", segment_id: "b3", by });
    const before = (await getStore().getTm()).length;
    const r = await decideTmProposal(p.id, false, "carmen");
    expect(r.addedToTm).toBe(false);
    expect(r.proposal.state).toBe("rejected");
    expect((await getStore().getTm()).length).toBe(before);
  });
});
