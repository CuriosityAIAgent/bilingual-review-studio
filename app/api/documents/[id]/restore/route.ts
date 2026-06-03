/** POST /api/documents/[id]/restore — clear a soft-delete tombstone, returning
 *  the document to the active queue. Authorization: upload_translate (author/admin),
 *  same as delete. */
import { authorize } from "@/src/auth";
import { fail, ok, seatFrom } from "@/src/server/context";
import { getStore } from "@/src/store";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const seat = seatFrom(req);
  const authz = authorize(seat, "upload_translate");
  if (!authz.allowed) return fail(`Not permitted: ${authz.reason}`, 403);
  const { id } = await params;
  await getStore().restoreDoc(id);
  return ok({ restored: id });
}
