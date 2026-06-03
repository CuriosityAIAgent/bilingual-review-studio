/**
 * POST /api/documents/[id]/action — dispatch a review/workflow action.
 * body: { kind, blockId?, text?, cats?, reason?, toUserId?, note? }
 * Authorization is enforced per action against the RBAC matrix (spec §11, App.C).
 */
import { authorize } from "@/src/auth";
import type { FlagCategory } from "@/src/lib/doc-model";
import { captureEditToMemory } from "@/src/memory";
import { reTranslateDoc } from "@/src/pipeline/run";
import { fail, ok, seatFrom } from "@/src/server/context";
import { getStore } from "@/src/store";
import {
  acceptSegment,
  approveDoc,
  editSegment,
  handoff,
  isAssignee,
  lockSegment,
  proposeSegment,
  publishDoc,
  rejectSegment,
  requestChanges,
  submitForReview,
} from "@/src/workflow";

interface Body {
  kind: string;
  blockId?: string;
  text?: string;
  cats?: FlagCategory[];
  reason?: string;
  toUserId?: string;
  note?: string;
  /** Document revision the client is acting on (optimistic concurrency, §12). */
  rev?: number;
}

const PERM: Record<string, string> = {
  edit: "edit_target",
  propose: "propose_change_or_rule",
  accept: "accept_reject",
  reject: "accept_reject",
  lock: "lock_segment",
  handoff: "handoff",
  submit: "handoff",
  approve: "approve_publish",
  publish: "deploy_clients",
  request_changes: "request_changes",
  retranslate: "upload_translate",
};

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const seat = seatFrom(req);
  const body = (await req.json()) as Body;
  const store = getStore();
  const doc = await store.getDoc(id);
  if (!doc) return fail("Document not found", 404);
  // A soft-deleted doc is out of the workflow — no edits/handoff/approve/publish
  // until it's restored. (Authoritative guard; the UI also hides it.)
  if (doc.deleted_at) return fail("This document is deleted — restore it before making changes.", 409);

  // Optimistic concurrency (spec §12): reject stale writes instead of clobbering.
  // retranslate regenerates machine segments and is rev-agnostic.
  if (typeof body.rev === "number" && body.rev !== doc.rev && body.kind !== "retranslate") {
    return fail(`This document changed since you loaded it (you have rev ${body.rev}, current is ${doc.rev}). Reload to see the latest.`, 409);
  }

  const action = PERM[body.kind];
  if (!action) return fail(`Unknown action "${body.kind}"`);
  const block = body.blockId ? doc.blocks.find((b) => b.id === body.blockId) : undefined;
  const authz = authorize(seat, action, { doc, block });
  if (!authz.allowed) return fail(`Not permitted: ${authz.reason}`, 403);

  // Turn-based lock (spec §11): only the current holder (or Admin) may act on a
  // document. Everyone else has read-only access until the baton is handed off.
  if (!isAssignee(seat, doc)) {
    return fail(
      `It's not your turn — this document is held by ${doc.assigned_to.user_id} (${doc.assigned_to.team_id}). You have read-only access until it is handed off to you.`,
      423,
    );
  }

  try {
    let next = doc;
    switch (body.kind) {
      case "edit":
        next = editSegment(doc, seat, body.blockId!, body.text ?? "", body.cats);
        break;
      case "propose":
        next = proposeSegment(doc, seat, body.blockId!, body.text ?? "", body.cats);
        break;
      case "accept":
        next = acceptSegment(doc, seat, body.blockId!);
        break;
      case "reject":
        next = rejectSegment(doc, seat, body.blockId!, body.reason ?? "");
        break;
      case "lock":
        next = lockSegment(doc, seat, body.blockId!);
        break;
      case "handoff":
        next = handoff(doc, seat, body.toUserId!, body.note ?? "");
        break;
      case "submit":
        next = submitForReview(doc, seat, body.note ?? "");
        break;
      case "approve":
        next = approveDoc(doc, seat, body.note ?? "");
        break;
      case "publish":
        next = publishDoc(doc, seat);
        break;
      case "request_changes":
        next = requestChanges(doc, seat, body.note ?? "Major changes requested");
        break;
      case "retranslate":
        next = await reTranslateDoc(doc);
        break;
    }
    await store.saveDoc(next);
    // Flywheel: a saved edit auto-captures into memory (governed + safeguarded
    // inside captureEditToMemory). Best-effort — the edit is already saved, so a
    // capture failure must not fail the request.
    if (body.kind === "edit" && body.blockId) {
      try {
        await captureEditToMemory(next, body.blockId, { user_id: seat.user_id, team_id: seat.team_id });
      } catch (e) {
        console.error("[memory] auto-capture on save failed:", (e as Error).message);
      }
    }
    return ok({ doc: next });
  } catch (e) {
    return fail((e as Error).message, 422);
  }
}
