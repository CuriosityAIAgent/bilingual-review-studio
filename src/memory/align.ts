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
