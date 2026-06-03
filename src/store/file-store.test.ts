import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DocModel } from "@/src/lib/doc-model";
import { FileStore } from "./file-store";

function makeDoc(id: string): DocModel {
  return {
    schema_version: "1.0",
    doc_id: id,
    title: `doc ${id}`,
    source_lang: "en",
    target_locale: "es-419",
    source: { filename: "f.txt", type: "txt", ocr_used: false },
    owner: { user_id: "ana", team_id: "team" },
    assigned_to: { user_id: "ana", team_id: "team" },
    status: "draft",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    deleted_at: null,
    rev: 0,
    model_run: {} as DocModel["model_run"],
    blocks: [],
    figures: [],
    approval: {},
    metrics: {} as DocModel["metrics"],
    edit_log: [],
    handoff_log: [],
  };
}

describe("FileStore soft delete / restore", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "brs-store-"));
    process.env.DATA_DIR = dir;
  });
  afterEach(async () => {
    delete process.env.DATA_DIR;
    await rm(dir, { recursive: true, force: true });
  });

  it("tombstones instead of removing, and moves it out of the active list", async () => {
    const s = new FileStore();
    await s.saveDoc(makeDoc("doc_1"));
    await s.deleteDoc("doc_1");

    const got = await s.getDoc("doc_1");
    expect(got).not.toBeNull(); // kept, not hard-deleted
    expect(got?.deleted_at).not.toBeNull(); // tombstoned

    expect(await s.listDocs()).toHaveLength(0); // gone from the active queue (+ metrics, home)
    const deleted = await s.listDeletedDocs();
    expect(deleted).toHaveLength(1);
    expect(deleted[0].doc_id).toBe("doc_1");
  });

  it("restores a soft-deleted doc back to active", async () => {
    const s = new FileStore();
    await s.saveDoc(makeDoc("doc_2"));
    await s.deleteDoc("doc_2");
    await s.restoreDoc("doc_2");
    expect((await s.getDoc("doc_2"))?.deleted_at).toBeNull();
    expect(await s.listDocs()).toHaveLength(1);
    expect(await s.listDeletedDocs()).toHaveLength(0);
  });
});
