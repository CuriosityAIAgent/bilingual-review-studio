/** POST /api/admin/tm — admin-only TM maintenance (incident cleanup).
 *
 *  action:"purge_segments" removes every machine-imported TM entry (kind:"segment")
 *  and KEEPS the protected disclaimers (kind:"disclaimer"). This exists to undo a
 *  bad bulk import — e.g. positionally-misaligned pairs committed by an automated
 *  process — without touching the governed disclaimer memory.
 *
 *  action:"remove" with `ids:[...]` hard-deletes only those specific entries —
 *  surgical cleanup of a handful of noisy pairs without wiping good memory.
 *  Disclaimer ids are skipped, never deleted.
 *
 *  Admin only (manage_org), since it deletes approved wording (CLAUDE.md: TM is
 *  normally append-only; this is a guarded exception for cleanup, gated to admin). */
import { authorize } from "@/src/auth";
import { removeTmEntries } from "@/src/memory";
import { ensureSeeded } from "@/src/memory/seed";
import { fail, ok, seatFrom } from "@/src/server/context";
import { getStore } from "@/src/store";

export async function POST(req: Request) {
  const seat = seatFrom(req);
  const authz = authorize(seat, "manage_org");
  if (!authz.allowed) return fail(`Not permitted: ${authz.reason}`, 403);

  const body = (await req.json().catch(() => ({}))) as { action?: string; ids?: unknown };
  const store = getStore();
  await ensureSeeded(store);

  if (body.action === "remove") {
    const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string") : [];
    if (ids.length === 0) return fail('action:"remove" needs a non-empty "ids" array.');
    const result = await removeTmEntries(ids);
    return ok({ ...result, by: seat.user_id });
  }

  if (body.action === "purge_segments") {
    const tm = await store.getTm();
    const kept = tm.filter((t) => t.kind === "disclaimer");
    const removed = tm.length - kept.length;
    await store.saveTm(kept);
    return ok({ removed, kept: kept.length, by: seat.user_id });
  }

  return fail('Unknown action. Use {"action":"purge_segments"} or {"action":"remove","ids":[...]}.');
}
