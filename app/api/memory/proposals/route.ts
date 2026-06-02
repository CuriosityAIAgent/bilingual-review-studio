/** GET  /api/memory/proposals — list TM proposals (optionally ?state=pending).
 *  POST /api/memory/proposals — file a proposal from a reviewer-corrected segment.
 *
 *  This is the "process edits into memory" front door. An edit is saved to the
 *  document immediately; sending it here only QUEUES it. An approver then decides
 *  via /api/memory/proposals/[id]. Memory changes only on approval (governance). */
import { authorize } from "@/src/auth";
import type { TmProposal } from "@/src/lib/doc-model";
import { listTmProposals, proposeTmFromEdit } from "@/src/memory";
import { ensureSeeded } from "@/src/memory/seed";
import { fail, ok, seatFrom } from "@/src/server/context";
import { getStore } from "@/src/store";

export async function GET(req: Request) {
  await ensureSeeded(getStore());
  const url = new URL(req.url);
  const state = url.searchParams.get("state") as TmProposal["state"] | null;
  const proposals = await listTmProposals(state ?? undefined);
  return ok({ proposals });
}

export async function POST(req: Request) {
  const seat = seatFrom(req);
  const authz = authorize(seat, "propose_change_or_rule");
  if (!authz.allowed) return fail(`Not permitted: ${authz.reason}`, 403);

  const body = (await req.json().catch(() => ({}))) as {
    source_text?: string;
    target_text?: string;
    doc_id?: string;
    doc_title?: string;
    segment_id?: string;
  };
  const source_text = (body.source_text ?? "").trim();
  const target_text = (body.target_text ?? "").trim();
  if (!source_text || !target_text) return fail("Both the English source and the corrected Spanish are required.");

  await ensureSeeded(getStore());
  const proposal = await proposeTmFromEdit({
    source_text,
    target_text,
    doc_id: body.doc_id ?? "",
    doc_title: body.doc_title ?? "",
    segment_id: body.segment_id ?? "",
    by: { user_id: seat.user_id, team_id: seat.team_id },
  });
  return ok({ proposal });
}
