/** GET /api/glossary — all neutral-glossary entries. POST — propose a new entry
 *  (source → approved neutral es-419 target, with forbidden regional variants).
 *  An approver/admin may set `activate: true` to approve it in the same call, so
 *  it is applied by the system immediately; otherwise it lands as a candidate in
 *  the governance queue (only active entries are ever applied — see CLAUDE.md). */
import { authorize } from "@/src/auth";
import { approveGlossary, proposeGlossary } from "@/src/memory";
import { ensureSeeded } from "@/src/memory/seed";
import { fail, ok, seatFrom } from "@/src/server/context";
import { getStore } from "@/src/store";

export async function GET() {
  const store = getStore();
  await ensureSeeded(store);
  return ok({ glossary: await store.getGlossary() });
}

export async function POST(req: Request) {
  const seat = seatFrom(req);
  const authz = authorize(seat, "propose_change_or_rule");
  if (!authz.allowed) return fail(`Not permitted: ${authz.reason}`, 403);

  const body = (await req.json()) as {
    source: string;
    approved_target: string;
    forbidden_terms?: string[];
    domain?: string;
    notes?: string;
    activate?: boolean;
  };
  if (!body.source || !body.approved_target) {
    return fail("source and approved_target are required");
  }

  // Activating (approving) requires the rule-approval permission, like rules.
  if (body.activate) {
    const approve = authorize(seat, "approve_rule");
    if (!approve.allowed) return fail(`Not permitted to activate: ${approve.reason}`, 403);
  }

  const store = getStore();
  await ensureSeeded(store);

  const entry = await proposeGlossary({
    source: body.source,
    approved_target: body.approved_target,
    forbidden_terms: body.forbidden_terms ?? [],
    locale: "es-419",
    domain: body.domain,
    notes: body.notes,
    approved_by: undefined,
    approved_at: undefined,
  });

  if (body.activate) {
    await approveGlossary(entry.id, seat.user_id);
  }

  const glossary = await store.getGlossary();
  return ok({ entry: glossary.find((g) => g.id === entry.id) ?? entry });
}
