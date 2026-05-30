/** GET /api/documents/[id]/export?format=record|reflowed&annotations=1
 *  Produces the bilingual review record (default) or a clean reflowed render. */
import { buildReflowedHtml, buildReviewRecordHtml } from "@/src/publish/review-record";
import { fail } from "@/src/server/context";
import { getStore } from "@/src/store";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const doc = await getStore().getDoc(id);
  if (!doc) return fail("Document not found", 404);
  const url = new URL(req.url);
  const format = url.searchParams.get("format") ?? "record";
  const annotations = url.searchParams.get("annotations") === "1";
  const html = format === "reflowed" ? buildReflowedHtml(doc) : buildReviewRecordHtml(doc, { annotations });
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
