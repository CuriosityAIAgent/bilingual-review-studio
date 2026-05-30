/** POST /api/rules/[id] — govern a rule. body: { action: 'approve' | 'deprecate' }.
 *  Only ACTIVE/APPROVED rules are ever applied (spec §13). */
import { authorize } from "@/src/auth";
import { approveRule, deprecateRule } from "@/src/memory";
import { fail, ok, seatFrom } from "@/src/server/context";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const seat = seatFrom(req);
  const { action } = (await req.json()) as { action: "approve" | "deprecate" };
  const perm = action === "approve" ? "approve_rule" : "deprecate_rule";
  const authz = authorize(seat, perm);
  if (!authz.allowed) return fail(`Not permitted: ${authz.reason}`, 403);

  const ref = { user_id: seat.user_id, team_id: seat.team_id };
  const rule = action === "approve" ? await approveRule(id, ref) : await deprecateRule(id, ref);
  if (!rule) return fail("Rule not found", 404);
  return ok({ rule });
}
