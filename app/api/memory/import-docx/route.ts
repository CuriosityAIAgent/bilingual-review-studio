/** POST /api/memory/import-docx — learn from a bilingual Word document.
 *  An SME uploads a .docx whose two columns are English ↔ the translation, one
 *  segment pair per row (spec §13). The table rows ARE the alignment — the human
 *  paired them — so we read them straight through (no positional/semantic
 *  re-alignment) and fold the pairs into the selected target language's TM.
 *
 *  Multipart form: file=<.docx>, locale=<Locale>, mode="preview"|"commit".
 *  mode:"preview" classifies pairs against current TM without writing;
 *  mode:"commit" writes via commitTmImport (dedupe + supersede + disclaimer
 *  guards, identical to the paste-import path). Uploaded text is data, never
 *  instructions — it is only read into pairs and stored. */
import { authorize } from "@/src/auth";
import type { Locale } from "@/src/lib/doc-model";
import { tablePairsFromDocx } from "@/src/ingest/docx";
import { commitTmImport, previewTmImport } from "@/src/memory";
import { ensureSeeded } from "@/src/memory/seed";
import { fail, ok, seatFrom } from "@/src/server/context";
import { getStore } from "@/src/store";

export async function POST(req: Request) {
  const seat = seatFrom(req);
  const authz = authorize(seat, "propose_change_or_rule");
  if (!authz.allowed) return fail(`Not permitted: ${authz.reason}`, 403);

  const ct = req.headers.get("content-type") || "";
  if (!ct.includes("multipart/form-data")) return fail("Upload a .docx file as multipart/form-data.");

  let buffer: Buffer;
  let filename = "document.docx";
  let locale: Locale = "es-419";
  let mode: "preview" | "commit" = "preview";
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return fail("No file provided.");
    filename = file.name || filename;
    buffer = Buffer.from(await file.arrayBuffer());
    const loc = form.get("locale");
    if (typeof loc === "string" && loc) locale = loc as Locale;
    if (form.get("mode") === "commit") mode = "commit";
  } catch (e) {
    return fail(`Could not read upload: ${(e as Error).message}`);
  }
  if (!/\.docx$/i.test(filename)) return fail("Only Word .docx files are supported for table import.");

  let extracted;
  try {
    extracted = await tablePairsFromDocx(buffer);
  } catch (e) {
    // Fail loud (ADR 0013): a corrupt/unreadable file is surfaced, never a silent
    // empty import that looks like "nothing to learn".
    console.error(`[memory/import-docx] parse failed (file=${filename}, seat=${seat.user_id}): ${(e as Error).message}`);
    return fail(`Could not read the Word document: ${(e as Error).message}`, 422);
  }

  const { pairs, tables, rowsSeen, headerSkipped, droppedRows, columnSwapped, cjkDetected, columnConfident } = extracted;
  if (pairs.length === 0) {
    return fail(
      tables === 0
        ? "No table found in the document. Put English in one column and the translation in the other, then re-upload."
        : "Found a table but no usable English↔translation rows in it. Each row needs both columns filled.",
    );
  }

  await ensureSeeded(getStore(), locale);

  // Script ↔ target-language sanity check. A Chinese target with no CJK (or a
  // non-Chinese target that IS full of CJK) means the wrong file or the wrong
  // target language. When neither side carries distinguishing script (an
  // accent-free Latin↔Latin table) we couldn't detect column order and only
  // guessed English-left. In every case, warn rather than silently write
  // mis-paired memory — preview shows the pairs so the user can verify first.
  const isZh = locale.startsWith("zh");
  const warning = isZh && !cjkDetected
    ? "No Chinese characters were found in the document. Check you uploaded the right file and picked the matching target language before saving."
    : !isZh && cjkDetected
      ? `This document contains Chinese text, but the target language is ${locale}. Check you picked the right target language before saving.`
      : !columnConfident
        ? "Couldn't tell which column is the translation (both columns use the same script), so we assumed English is on the left. Check the pairs below before saving."
        : undefined;

  const summary = {
    align: "table" as const,
    tables,
    rowsSeen,
    headerSkipped,
    droppedRows,
    columnSwapped,
    columnConfident,
    cjkDetected,
    sourceBlocks: pairs.length,
    targetBlocks: pairs.length,
    sourceExtra: [] as string[],
    targetExtra: [] as string[],
    warning,
  };

  if (mode === "commit") {
    const result = await commitTmImport(pairs, seat.user_id, locale);
    return ok({ result, ...summary });
  }
  const rows = await previewTmImport(pairs, locale);
  return ok({ rows, ...summary });
}
