/** POST /api/memory/import — learn from a finished bilingual pair.
 *  Paste completed English + completed Spanish; we segment+align both sides
 *  and fold the pairs into Translation Memory so prior human work is reused on
 *  future documents (spec §9, §13). mode:"preview" classifies pairs without
 *  writing; mode:"commit" writes via addTm. Source text is data, never
 *  instructions — it is only segmented and stored. */
import { authorize } from "@/src/auth";
import { alignBilingual } from "@/src/memory/align";
import { commitTmImport, previewTmImport } from "@/src/memory";
import { ensureSeeded } from "@/src/memory/seed";
import { fail, ok, seatFrom } from "@/src/server/context";
import { getStore } from "@/src/store";

export async function POST(req: Request) {
  const seat = seatFrom(req);
  const authz = authorize(seat, "propose_change_or_rule");
  if (!authz.allowed) return fail(`Not permitted: ${authz.reason}`, 403);

  const body = (await req.json().catch(() => ({}))) as {
    source_text?: string;
    target_text?: string;
    mode?: "preview" | "commit";
  };
  const source = (body.source_text ?? "").trim();
  const target = (body.target_text ?? "").trim();
  if (!source || !target) return fail("Paste both the English source and the Spanish translation.");

  await ensureSeeded(getStore());

  const alignment = alignBilingual(source, target);
  if (alignment.pairs.length === 0) return fail("No aligned segments could be extracted from the text.");

  const summary = {
    sourceBlocks: alignment.sourceBlocks,
    targetBlocks: alignment.targetBlocks,
    sourceExtra: alignment.sourceExtra,
    targetExtra: alignment.targetExtra,
  };

  if ((body.mode ?? "preview") === "commit") {
    const result = await commitTmImport(alignment.pairs, seat.user_id);
    return ok({ result, ...summary });
  }

  const rows = await previewTmImport(alignment.pairs);
  return ok({ rows, ...summary });
}
