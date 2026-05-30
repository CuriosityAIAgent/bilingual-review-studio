/**
 * POST /api/documents/[id]/action — dispatch a review/workflow action.
 * body: { kind, blockId?, text?, cats?, reason?, toUserId?, note? }
 * Authorization is enforced per action against the RBAC matrix (spec §11, App.C).
 */
import { authorize } from "@/src/auth";
import type { FlagCategory } from "@/src/lib/doc-model";
import { reTranslateDoc } from "@/src/pipeline/run";
import { fail, ok, seatFrom } from "@/src/server/context";
import { getStore } from "@/src/store";
import {
  acceptSegment,
  approveDoc,
  editSegment,
  handoff,
  lockSegment,
  proposeSegment,
  publishDoc,
  rejectSegment,
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
  publish: "approve_publish",
  retranslate: "upload_translate",
};

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const seat = seatFrom(req);
  const body = (await req.json()) as Body;
  const store = getStore();
  const doc = await store.getDoc(id);
  if (!doc) return fail("Document not found", 404);

  const action = PERM[body.kind];
  if (!action) return fail(`Unknown action "${body.kind}"`);
  const block = body.blockId ? doc.blocks.find((b) => b.id === body.blockId) : undefined;
  const authz = authorize(seat, action, { doc, block });
  if (!authz.allowed) return fail(`Not permitted: ${authz.reason}`, 403);

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
      case "retranslate":
        next = await reTranslateDoc(doc);
        break;
    }
    await store.saveDoc(next);
    return ok({ doc: next });
  } catch (e) {
    return fail((e as Error).message, 422);
  }
}
