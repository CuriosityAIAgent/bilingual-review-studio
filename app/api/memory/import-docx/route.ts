/** POST /api/memory/import-docx — learn from a bilingual Word document.
 *  An SME uploads a .docx whose two columns are English ↔ the translation, one
 *  segment pair per row (spec §13). The table rows ARE the alignment — the human
 *  paired them — so we read them straight through (no positional/semantic
 *  re-alignment) and fold the pairs into the selected target language's TM.
 *
 *  Multipart form: file=<.docx>, locale=<Locale>, mode="preview"|"commit",
 *  confirm="true"|"false". mode:"preview" classifies pairs against current TM
 *  without writing; mode:"commit" writes via commitTmImport (dedupe + supersede
 *  + disclaimer guards, identical to the paste-import path). A wrong-locale
 *  upload is refused outright; an ambiguous-orientation upload commits only with
 *  confirm=true (the UI sets it once the user has seen the preview), so a blind
 *  mode=commit can't bypass the verify step. Uploaded text is data, never
 *  instructions — it is only read into pairs and stored. */
import { authorize } from "@/src/auth";
import type { Locale } from "@/src/lib/doc-model";
import { tablePairsFromDocx } from "@/src/ingest/docx";
import { commitTmImport, previewTmImport } from "@/src/memory";
import { ensureSeeded } from "@/src/memory/seed";
import { fail, ok, seatFrom } from "@/src/server/context";
import { getStore } from "@/src/store";

// Reject oversized uploads before reading them into memory / handing to mammoth
// (which decompresses the .docx zip) — bounds a decompression-bomb or huge-table
// denial of service. A bilingual glossary is kilobytes; 8 MB is generous.
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

// Target locales we actually support (mirrors app/lib/roles.ts TARGET_LOCALES).
const TARGET_LOCALES: Locale[] = ["es-419", "zh-Hans", "zh-Hant"];

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
  let confirmed = false;
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return fail("No file provided.");
    if (file.size > MAX_UPLOAD_BYTES) {
      return fail(`File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). The limit is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB — a bilingual glossary should be far smaller.`);
    }
    filename = file.name || filename;
    buffer = Buffer.from(await file.arrayBuffer());
    const loc = form.get("locale");
    if (typeof loc === "string" && loc) locale = loc as Locale;
    if (form.get("mode") === "commit") mode = "commit";
    confirmed = form.get("confirm") === "true";
  } catch (e) {
    return fail(`Could not read upload: ${(e as Error).message}`);
  }
  if (!/\.docx$/i.test(filename)) return fail("Only Word .docx files are supported for table import.");
  if (!TARGET_LOCALES.includes(locale)) return fail(`Unsupported target language "${locale}".`);

  const isZh = locale.startsWith("zh");
  let extracted;
  try {
    // Tell the parser the target script so it can ignore non-Chinese tables
    // (returns / fee / layout) when importing for a Chinese target.
    extracted = await tablePairsFromDocx(buffer, { expectCjk: isZh });
  } catch (e) {
    // Fail loud (ADR 0013): a corrupt/unreadable file is surfaced, never a silent
    // empty import that looks like "nothing to learn".
    console.error(`[memory/import-docx] parse failed (file=${filename}, seat=${seat.user_id}): ${(e as Error).message}`);
    return fail(`Could not read the Word document: ${(e as Error).message}`, 422);
  }

  const { pairs, tables, skippedTables, rowsSeen, headerSkipped, droppedRows, columnSwapped, cjkDetected, columnConfident, truncated } = extracted;
  if (pairs.length === 0) {
    return fail(
      tables === 0
        ? "No table found in the document. Put English in one column and the translation in the other, then re-upload."
        : isZh && skippedTables === tables
          ? "No table with Chinese text was found. Check you uploaded the right file and picked the matching target language."
          : "Found a table but no usable English↔translation rows in it. Each row needs both columns filled.",
    );
  }

  await ensureSeeded(getStore(), locale);

  // Script ↔ target-language sanity checks, in priority order. The first two are
  // "definitely wrong file/locale" and BLOCK commit outright. The third
  // (ambiguous column order) only guessed the orientation, so it blocks an
  // unconfirmed commit but can be saved once the user has reviewed the preview.
  const wrongLocale = (isZh && !cjkDetected) || (!isZh && cjkDetected);
  // Collect every applicable warning — truncation must never be hidden behind a
  // higher-priority message (e.g. an ambiguous large table is both ambiguous AND
  // truncated, and the user needs to know both before saving).
  const warnings: string[] = [];
  if (isZh && !cjkDetected) {
    warnings.push("No Chinese characters were found in the document. Check you uploaded the right file and picked the matching target language before saving.");
  } else if (!isZh && cjkDetected) {
    warnings.push(`This document contains Chinese text, but the target language is ${locale}. Check you picked the right target language before saving.`);
  } else if (!columnConfident) {
    warnings.push("Couldn't tell which column is the translation (both columns use the same script), so we assumed English is on the left. Check the pairs below before saving.");
  }
  if (truncated) {
    warnings.push(`Only the first ${pairs.length} pairs were read; the document is unusually large. Split it and re-upload if you need the rest.`);
  }
  const warning = warnings.length > 0 ? warnings.join(" ") : undefined;

  const summary = {
    align: "table" as const,
    tables,
    skippedTables,
    rowsSeen,
    headerSkipped,
    droppedRows,
    columnSwapped,
    columnConfident,
    cjkDetected,
    truncated,
    sourceBlocks: pairs.length,
    targetBlocks: pairs.length,
    sourceExtra: [] as string[],
    targetExtra: [] as string[],
    warning,
  };

  if (mode === "commit") {
    // Governed-memory guard: never write a clearly wrong-locale import, and never
    // write any flagged import (ambiguous orientation, truncated) that wasn't
    // reviewed (confirm=true). Preview is never blocked — that's how the user
    // reviews, and the UI sends confirm=true only from the post-preview Save.
    if (wrongLocale) {
      return fail(`${warning} Nothing was saved.`, 422);
    }
    if (warning && !confirmed) {
      return fail(`Review the preview before saving — ${warning}`, 422);
    }
    const result = await commitTmImport(pairs, seat.user_id, locale);
    return ok({ result, ...summary });
  }
  const rows = await previewTmImport(pairs, locale);
  return ok({ rows, ...summary });
}
