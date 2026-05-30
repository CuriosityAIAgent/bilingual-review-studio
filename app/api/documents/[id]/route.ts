/** GET /api/documents/[id] — full DocModel. DELETE — remove (admin/author). */
import { authorize } from "@/src/auth";
import { fail, ok, seatFrom } from "@/src/server/context";
import { getStore } from "@/src/store";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const doc = await getStore().getDoc(id);
  if (!doc) return fail("Document not found", 404);
  return ok({ doc });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const seat = seatFrom(req);
  const authz = authorize(seat, "upload_translate");
  if (!authz.allowed) return fail(`Not permitted: ${authz.reason}`, 403);
  const { id } = await params;
  await getStore().deleteDoc(id);
  return ok({ deleted: id });
}
