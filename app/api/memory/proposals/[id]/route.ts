/** POST /api/memory/proposals/[id] — approve or reject a TM proposal.
 *  body: { action: "approve" | "reject" }. Approve folds the corrected pair into
 *  translation memory; reject discards it. Approver/Admin only (approve_rule),
 *  the same gate that governs neutralization rules. */
import { authorize } from "@/src/auth";
import { decideTmProposal } from "@/src/memory";
import { ensureSeeded } from "@/src/memory/seed";
import { fail, ok, seatFrom } from "@/src/server/context";
import { getStore } from "@/src/store";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const seat = seatFrom(req);
  const authz = authorize(seat, "approve_rule");
  if (!authz.allowed) return fail(`Not permitted: ${authz.reason}`, 403);

  const body = (await req.json().catch(() => ({}))) as { action?: string };
  if (body.action !== "approve" && body.action !== "reject") {
    return fail('action must be "approve" or "reject".');
  }

  await ensureSeeded(getStore());
  try {
    const result = await decideTmProposal(id, body.action === "approve", seat.user_id);
    return ok(result);
  } catch (e) {
    return fail((e as Error).message, 404);
  }
}
