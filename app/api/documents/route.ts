/** GET /api/documents — list document summaries.
 *  POST /api/documents — upload a file (multipart) or sample (JSON) → run the
 *  pipeline → persist. Authorization: upload_translate (author/admin). */
import { authorize } from "@/src/auth";
import { fail, ok, seatFrom } from "@/src/server/context";
import { runPipeline } from "@/src/pipeline/run";
import { getStore } from "@/src/store";
import type { Locale } from "@/src/lib/doc-model";

export async function GET(req: Request) {
  // ?deleted=true → the Library "Deleted" tab; default → active docs only.
  // Filtering lives in the store, so every consumer (queue, metrics, home) is
  // consistent without each call site remembering to exclude tombstones.
  const store = getStore();
  const wantDeleted = new URL(req.url).searchParams.get("deleted") === "true";
  return ok({ documents: wantDeleted ? await store.listDeletedDocs() : await store.listDocs() });
}

export async function POST(req: Request) {
  const seat = seatFrom(req);
  const authz = authorize(seat, "upload_translate");
  if (!authz.allowed) return fail(`Not permitted: ${authz.reason}`, 403);

  let filename = "document.txt";
  let buffer: Buffer;
  let targetLocale: Locale = "es-419";

  const ct = req.headers.get("content-type") || "";
  try {
    if (ct.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return fail("No file provided");
      filename = file.name || filename;
      buffer = Buffer.from(await file.arrayBuffer());
      const loc = form.get("locale");
      if (typeof loc === "string" && loc) targetLocale = loc as Locale;
    } else {
      const body = (await req.json()) as { filename?: string; text?: string; locale?: Locale };
      if (!body.text) return fail("No text provided");
      filename = body.filename || filename;
      buffer = Buffer.from(body.text, "utf8");
      if (body.locale) targetLocale = body.locale;
    }
  } catch (e) {
    return fail(`Could not read upload: ${(e as Error).message}`);
  }

  try {
    const doc = await runPipeline({
      filename,
      buffer,
      owner: { user_id: seat.user_id, team_id: seat.team_id },
      targetLocale,
    });
    await getStore().saveDoc(doc);
    return ok({ doc_id: doc.doc_id, title: doc.title, blocks: doc.blocks.length });
  } catch (e) {
    console.error(`[documents] Pipeline failed (file=${filename}, seat=${seat.user_id}): ${(e as Error).message}`);
    return fail(`Pipeline failed: ${(e as Error).message}`, 422);
  }
}
