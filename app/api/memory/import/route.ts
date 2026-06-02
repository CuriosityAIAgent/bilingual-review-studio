/** POST /api/memory/import — learn from a finished bilingual pair.
 *  Paste completed English + completed Spanish; we align both sides and fold the
 *  pairs into Translation Memory so prior human work is reused on future
 *  documents (spec §9, §13). mode:"preview" classifies pairs without writing;
 *  mode:"commit" writes via addTm. Source text is data, never instructions — it
 *  is only segmented and stored.
 *
 *  align:"paragraph" (default) pairs blocks by position — correct for literal
 *  1:1 translations. align:"semantic" splits both sides into sentences and
 *  matches them cross-lingually by the QE embedding model, keeping only pairs at
 *  or above the cosine floor — for published EN/ES that is an editorial
 *  adaptation (reordered/merged/condensed) where positional alignment is wrong. */
import { authorize } from "@/src/auth";
import { getThresholds } from "@/src/lib/config";
import { alignBilingual, alignBilingualSemantic } from "@/src/memory/align";
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
    align?: "paragraph" | "semantic";
    min_score?: number;
  };
  const source = (body.source_text ?? "").trim();
  const target = (body.target_text ?? "").trim();
  if (!source || !target) return fail("Paste both the English source and the Spanish translation.");

  await ensureSeeded(getStore());

  // Build aligned pairs + a summary the UI shows before anything is written.
  let pairs: { source: string; target: string; score?: number }[];
  let summary: Record<string, unknown>;

  if (body.align === "semantic") {
    // min_score is client-supplied but may only TIGHTEN the governed floor, never
    // loosen it — otherwise a caller could pass 0/-1 and commit garbage to TM.
    const floor = getThresholds().align_min_cosine;
    const effectiveMin = typeof body.min_score === "number" ? Math.max(body.min_score, floor) : floor;
    const a = await alignBilingualSemantic(source, target, effectiveMin);

    // Fail closed: if the embedding model was unavailable we fell back to
    // POSITIONAL pairing (the very thing semantic mode exists to avoid). Never
    // commit those guesses; surface it on preview.
    if (a.method === "positional-fallback") {
      if ((body.mode ?? "preview") === "commit") {
        return fail("Semantic alignment is unavailable (embedding model not loaded). Refusing to commit positionally-guessed pairs — retry shortly.", 503);
      }
      const rows = await previewTmImport(a.pairs);
      return ok({
        rows,
        align: a.method,
        minScore: a.minScore,
        warning: "Embedding model unavailable — showing positional fallback only. Commit is blocked until semantic scoring is available.",
        sourceBlocks: a.sourceBlocks,
        targetBlocks: a.targetBlocks,
        matched: a.pairs.length,
        sourceExtra: a.sourceExtra,
        targetExtra: a.targetExtra,
      });
    }

    pairs = a.pairs;
    summary = {
      align: a.method,
      minScore: a.minScore,
      sourceBlocks: a.sourceBlocks,
      targetBlocks: a.targetBlocks,
      matched: a.pairs.length,
      sourceExtra: a.sourceExtra,
      targetExtra: a.targetExtra,
    };
  } else {
    const a = alignBilingual(source, target);
    pairs = a.pairs;
    summary = {
      align: "paragraph",
      sourceBlocks: a.sourceBlocks,
      targetBlocks: a.targetBlocks,
      sourceExtra: a.sourceExtra,
      targetExtra: a.targetExtra,
    };
  }

  if (pairs.length === 0) {
    return fail(
      body.align === "semantic"
        ? "No sentence pairs cleared the confidence floor — these texts may not be translations of each other."
        : "No aligned segments could be extracted from the text.",
    );
  }

  if ((body.mode ?? "preview") === "commit") {
    const result = await commitTmImport(pairs, seat.user_id);
    return ok({ result, ...summary });
  }

  const rows = await previewTmImport(pairs);
  // Carry each pair's match score (semantic mode) onto its preview row.
  const scored = rows.map((r, i) => (pairs[i]?.score != null ? { ...r, score: pairs[i].score } : r));
  return ok({ rows: scored, ...summary });
}
