/**
 * Workflow engine (spec §11): document/segment state machine, multi-team
 * handoff, tracked-changes accept/reject, segment locking, and approve/publish.
 *
 * All actions append to the immutable edit_log / handoff_log and return a NEW
 * document object (callers persist it). Authorization is enforced at the API
 * boundary via src/auth; these functions implement the state transitions.
 */
import type {
  ActorRef,
  Block,
  DocModel,
  DocStatus,
  FlagCategory,
} from "@/src/lib/doc-model";
import { nowIso } from "@/src/lib/ids";
import { computeMetrics } from "@/src/metrics";
import { gateBlock } from "@/src/quality-gate";
import { type Seat, getSeat } from "@/src/auth";
import { makeEditEntry, makeHandoffEntry } from "./audit";

export const VALID_TRANSITIONS: Record<DocStatus, DocStatus[]> = {
  draft: ["in_review"],
  in_review: ["changes_requested", "approved"],
  changes_requested: ["in_review"],
  approved: ["published", "in_review"],
  published: [],
};

function actorOf(seat: Seat): ActorRef {
  return { user_id: seat.user_id, team_id: seat.team_id, role: seat.role, display_name: seat.display_name };
}

function withBlock(doc: DocModel, blockId: string, fn: (b: Block) => Block): DocModel {
  return { ...doc, blocks: doc.blocks.map((b) => (b.id === blockId ? fn(b) : b)) };
}

function refresh(doc: DocModel): DocModel {
  const next = { ...doc, updated_at: nowIso(), rev: doc.rev + 1 };
  next.metrics = computeMetrics(next);
  return next;
}

// ── Segment-level actions ─────────────────────────────────────────────────────
export function editSegment(
  doc: DocModel,
  seat: Seat,
  blockId: string,
  newText: string,
  cats: FlagCategory[] = [],
): DocModel {
  const block = doc.blocks.find((b) => b.id === blockId);
  if (!block) throw new Error(`unknown block ${blockId}`);
  const before = block.final_text || block.mt_text;
  const entry = makeEditEntry({ segment_id: blockId, actor: actorOf(seat), action: "edit", before, after: newText, error_categories_corrected: cats });
  const next = withBlock(doc, blockId, (b) => ({ ...b, final_text: newText, seg_status: "edited" }));
  return refresh({ ...next, edit_log: [...doc.edit_log, entry] });
}

/** A lower-permission edit recorded as a PROPOSAL pending accept/reject. */
export function proposeSegment(doc: DocModel, seat: Seat, blockId: string, newText: string, cats: FlagCategory[] = []): DocModel {
  const block = doc.blocks.find((b) => b.id === blockId);
  if (!block) throw new Error(`unknown block ${blockId}`);
  const before = block.final_text || block.mt_text;
  const entry = makeEditEntry({ segment_id: blockId, actor: actorOf(seat), action: "propose", before, after: newText, error_categories_corrected: cats });
  const next = withBlock(doc, blockId, (b) => ({ ...b, final_text: newText, seg_status: "proposed" }));
  return refresh({ ...next, edit_log: [...doc.edit_log, entry] });
}

export function acceptSegment(doc: DocModel, seat: Seat, blockId: string): DocModel {
  const block = doc.blocks.find((b) => b.id === blockId);
  if (!block) throw new Error(`unknown block ${blockId}`);
  const entry = makeEditEntry({ segment_id: blockId, actor: actorOf(seat), action: "accept", before: block.mt_text, after: block.final_text });
  const next = withBlock(doc, blockId, (b) => ({ ...b, seg_status: "accepted" }));
  return refresh({ ...next, edit_log: [...doc.edit_log, entry] });
}

export function rejectSegment(doc: DocModel, seat: Seat, blockId: string, reason: string): DocModel {
  const block = doc.blocks.find((b) => b.id === blockId);
  if (!block) throw new Error(`unknown block ${blockId}`);
  const entry = makeEditEntry({ segment_id: blockId, actor: actorOf(seat), action: "reject", before: block.final_text, after: block.mt_text });
  entry.error_categories_corrected = [];
  const next = withBlock(doc, blockId, (b) => ({ ...b, final_text: b.mt_text, seg_status: "machine" }));
  void reason;
  return refresh({ ...next, edit_log: [...doc.edit_log, entry] });
}

export function lockSegment(doc: DocModel, seat: Seat, blockId: string): DocModel {
  const block = doc.blocks.find((b) => b.id === blockId);
  if (!block) throw new Error(`unknown block ${blockId}`);
  const entry = makeEditEntry({ segment_id: blockId, actor: actorOf(seat), action: "lock", before: block.final_text, after: block.final_text });
  const next = withBlock(doc, blockId, (b) => ({ ...b, seg_status: "locked" }));
  return refresh({ ...next, edit_log: [...doc.edit_log, entry] });
}

// ── Document-level transitions ────────────────────────────────────────────────
function transition(doc: DocModel, to: DocStatus): void {
  if (!VALID_TRANSITIONS[doc.status].includes(to)) {
    throw new Error(`invalid transition ${doc.status} → ${to}`);
  }
}

export function handoff(doc: DocModel, seat: Seat, toUserId: string, note: string): DocModel {
  const to = getSeat(toUserId);
  const entry = makeHandoffEntry({
    action: "handoff",
    actor: actorOf(seat),
    from: { user_id: doc.assigned_to.user_id, team_id: doc.assigned_to.team_id },
    to: { user_id: to.user_id, team_id: to.team_id },
    note,
  });
  return refresh({ ...doc, assigned_to: { user_id: to.user_id, team_id: to.team_id }, handoff_log: [...doc.handoff_log, entry] });
}

export function submitForReview(doc: DocModel, seat: Seat, note: string): DocModel {
  transition(doc, "in_review");
  const entry = makeHandoffEntry({ action: "submit", actor: actorOf(seat), note, status_from: doc.status, status_to: "in_review" });
  return refresh({ ...doc, status: "in_review", handoff_log: [...doc.handoff_log, entry] });
}

export function approveDoc(doc: DocModel, seat: Seat, note: string): DocModel {
  transition(doc, "approved");
  // Validators are authoritative (spec §15): every segment must be auto-pass
  // eligible or human-resolved (accepted/locked) before approval.
  const unresolved = doc.blocks.filter(
    (b) => gateBlock(b, { ocrUsed: doc.source.ocr_used }).route === "human_review",
  );
  if (unresolved.length) {
    throw new Error(
      `Cannot approve: ${unresolved.length} segment(s) have unresolved blocking issues — accept, edit, or lock them first (spec §15).`,
    );
  }
  const entry = makeHandoffEntry({ action: "approve", actor: actorOf(seat), note, status_from: doc.status, status_to: "approved" });
  return refresh({
    ...doc,
    status: "approved",
    approval: { approved_by: seat.user_id, approved_at: nowIso(), approval_scope: "document" },
    handoff_log: [...doc.handoff_log, entry],
  });
}

/** Publish — guarded: every disclaimer must be locked (approved-TM only, §10). */
export function publishDoc(doc: DocModel, seat: Seat): DocModel {
  transition(doc, "published");
  const unresolvedDisclaimers = doc.blocks.filter((b) => b.type === "disclaimer" && b.seg_status !== "locked");
  if (unresolvedDisclaimers.length) {
    throw new Error(
      `Cannot publish: ${unresolvedDisclaimers.length} disclaimer(s) not sourced from approved TM (spec §10).`,
    );
  }
  const entry = makeHandoffEntry({ action: "publish", actor: actorOf(seat), note: "Published", status_from: doc.status, status_to: "published" });
  return refresh({ ...doc, status: "published", handoff_log: [...doc.handoff_log, entry] });
}
