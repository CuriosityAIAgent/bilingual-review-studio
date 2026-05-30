import { describe, expect, it } from "vitest";
import type { Block, DocModel } from "@/src/lib/doc-model";
import { newBlock } from "@/src/lib/doc-model";
import { authorize, getSeat } from "./index";

const reviewer = getSeat("diego"); // Iberia, team iberia-marketing
const approver = getSeat("carmen");
const viewer = getSeat("sam");

function blockOf(type: Block["type"]): Block {
  return newBlock({ id: "b1", type, source_text: "x", assigned_to: { user_id: "diego", team_id: "iberia-marketing" } });
}
const doc = { assigned_to: { user_id: "diego", team_id: "iberia-marketing" } } as DocModel;

describe("RBAC (spec §11, App. C)", () => {
  it("[#3] reviewer may NOT edit a disclaimer block (escalates to Approver/Compliance)", () => {
    const r = authorize(reviewer, "edit_target", { doc, block: blockOf("disclaimer") });
    expect(r.allowed).toBe(false);
  });
  it("reviewer MAY edit an in-scope body block (neutralize)", () => {
    const r = authorize(reviewer, "edit_target", { doc, block: blockOf("body") });
    expect(r.allowed).toBe(true);
  });
  it("approver MAY edit a disclaimer block", () => {
    const r = authorize(approver, "edit_target", { doc, block: blockOf("disclaimer") });
    expect(r.allowed).toBe(true);
  });
  it("reviewer may NOT approve neutralization rules (policy: approver/admin only)", () => {
    expect(authorize(reviewer, "approve_rule").allowed).toBe(false);
    expect(authorize(approver, "approve_rule").allowed).toBe(true);
  });
  it("viewer may NOT mutate (upload/edit/accept)", () => {
    expect(authorize(viewer, "upload_translate").allowed).toBe(false);
    expect(authorize(viewer, "edit_target", { doc, block: blockOf("body") }).allowed).toBe(false);
    expect(authorize(viewer, "accept_reject", { doc, block: blockOf("body") }).allowed).toBe(false);
  });
  it("reviewer may NOT accept/reject a disclaimer (in_scope_non_disclaimer)", () => {
    expect(authorize(reviewer, "accept_reject", { doc, block: blockOf("disclaimer") }).allowed).toBe(false);
    expect(authorize(reviewer, "accept_reject", { doc, block: blockOf("body") }).allowed).toBe(true);
  });
});
