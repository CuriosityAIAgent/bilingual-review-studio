/**
 * Bilingual pair alignment for the "learn from finished work" front door.
 *
 * A reviewer pastes a completed English source and its completed Spanish
 * translation; we segment BOTH sides with the same deterministic block
 * splitter the ingester uses (src/ingest/txt.ts) and align them by order.
 * Each aligned pair becomes a governed Translation-Memory entry, so prior
 * human work is reused on future documents instead of being re-translated
 * cold. Alignment is positional and deterministic — no model, fully auditable.
 *
 * Counts that don't match are never silently dropped: the unaligned tail on
 * each side is returned so the UI can surface it before anything is committed.
 */
import { blockifyText } from "@/src/ingest/txt";
import { embedMany } from "@/src/evaluate/qe-model";
import { getThresholds } from "@/src/lib/config";
import { toSentences } from "@/src/memory/sentences";

export interface AlignedPair {
  source: string;
  target: string;
}

export interface AlignmentResult {
  pairs: AlignedPair[];
  /** EN blocks with no ES counterpart (source longer than target). */
  sourceExtra: string[];
  /** ES blocks with no EN counterpart (target longer than source). */
  targetExtra: string[];
  sourceBlocks: number;
  targetBlocks: number;
}

function segments(text: string): string[] {
  return blockifyText(text)
    .map((b) => b.source_text.trim())
    .filter(Boolean);
}

export function alignBilingual(sourceText: string, targetText: string): AlignmentResult {
  const src = segments(sourceText);
  const tgt = segments(targetText);
  const n = Math.min(src.length, tgt.length);
  const pairs: AlignedPair[] = [];
  for (let i = 0; i < n; i++) pairs.push({ source: src[i], target: tgt[i] });
  return {
    pairs,
    sourceExtra: src.slice(n),
    targetExtra: tgt.slice(n),
    sourceBlocks: src.length,
    targetBlocks: tgt.length,
  };
}

// ── Semantic (meaning-based) alignment ───────────────────────────────────────
// Positional alignment is correct only for literal 1:1 translations. Published
// EN/ES is often an editorial ADAPTATION: reordered, merged, condensed — so
// paragraph N on one side is not paragraph N on the other (and equal counts can
// be a coincidence). Here we split BOTH sides into sentences, embed them with the
// QE model into a shared multilingual space, and keep only mutually-confident
// matches (cosine ≥ floor). Drifted / unmatched sentences are returned as extras
// and never become TM pairs. Order-preserving and one-to-one.

export interface ScoredPair extends AlignedPair {
  /** Cross-lingual cosine similarity of the matched sentences, 0–1. */
  score: number;
}

export interface SemanticAlignmentResult {
  pairs: ScoredPair[];
  sourceExtra: string[];
  targetExtra: string[];
  sourceBlocks: number;
  targetBlocks: number;
  /** "semantic" when the model ran; "positional-fallback" if it was unavailable. */
  method: "semantic" | "positional-fallback";
  minScore: number;
}

function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

export async function alignBilingualSemantic(
  sourceText: string,
  targetText: string,
  minScore?: number,
): Promise<SemanticAlignmentResult> {
  const floor = minScore ?? getThresholds().align_min_cosine;
  const src = toSentences(sourceText);
  const tgt = toSentences(targetText);

  const emb = await embedMany([...src, ...tgt]);
  // Model unavailable → fall back to positional sentence alignment so the flow
  // still works (and is honestly labelled as such), rather than failing.
  if (!emb) {
    const n = Math.min(src.length, tgt.length);
    const pairs: ScoredPair[] = [];
    for (let i = 0; i < n; i++) pairs.push({ source: src[i], target: tgt[i], score: 0 });
    return {
      pairs,
      sourceExtra: src.slice(n),
      targetExtra: tgt.slice(n),
      sourceBlocks: src.length,
      targetBlocks: tgt.length,
      method: "positional-fallback",
      minScore: floor,
    };
  }

  const se = emb.slice(0, src.length);
  const te = emb.slice(src.length);

  // All candidate matches at or above the floor, strongest first.
  const cands: { i: number; j: number; score: number }[] = [];
  for (let i = 0; i < se.length; i++) {
    for (let j = 0; j < te.length; j++) {
      const score = dot(se[i], te[j]);
      if (score >= floor) cands.push({ i, j, score });
    }
  }
  cands.sort((a, b) => b.score - a.score);

  // Greedy one-to-one: take the strongest match for each still-free sentence.
  const usedS = new Set<number>();
  const usedT = new Set<number>();
  const chosen: { i: number; j: number; score: number }[] = [];
  for (const c of cands) {
    if (usedS.has(c.i) || usedT.has(c.j)) continue;
    usedS.add(c.i);
    usedT.add(c.j);
    chosen.push(c);
  }

  // Present pairs in source order for a readable preview.
  chosen.sort((a, b) => a.i - b.i);
  const pairs: ScoredPair[] = chosen.map((c) => ({
    source: src[c.i],
    target: tgt[c.j],
    score: Number(c.score.toFixed(3)),
  }));

  return {
    pairs,
    sourceExtra: src.filter((_, i) => !usedS.has(i)),
    targetExtra: tgt.filter((_, j) => !usedT.has(j)),
    sourceBlocks: src.length,
    targetBlocks: tgt.length,
    method: "semantic",
    minScore: floor,
  };
}
