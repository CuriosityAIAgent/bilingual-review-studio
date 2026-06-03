# 11. Semantic Sentence-Level Alignment for the Train Flow

Status: Accepted

## Context

The Train flow (ADR 0008's memory, fed from finished work) originally aligned a pasted English+Spanish pair **by paragraph position**: paragraph N on the left maps to paragraph N on the right. That is correct only for literal 1:1 translations. Much real published bilingual material — e.g. J.P. Morgan LatAm insights — is an **editorial adaptation**: the Spanish is reordered, merged, or condensed (often 50–60% of the English paragraph count). Worse, paragraph counts sometimes match by coincidence while the content has drifted out of position, so positional alignment "succeeds" and silently stores semantically wrong pairs — exactly the kind of corruption that poisons every future translation. A background bulk-import incident did precisely this (≈250 misaligned pairs), caught only by QA.

## Decision

Add `align:"semantic"` to `/api/memory/import`. It splits both sides into sentences, embeds them with the in-container QE model (the same cross-lingual model used for scoring), and keeps only **mutual-best matches** at or above `thresholds.align_min_cosine` (0.78). Unmatched/drifted sentences are surfaced and **dropped, never paired**. `min_score` from the client may only *tighten* the floor, never loosen it; if the embedding model is unavailable the commit **fails closed** rather than guessing positionally. Paragraph mode remains the default for genuinely literal pairs. The reviewer previews every pair (with its match score) before committing.

## Consequences

- Adaptations become usable: we harvest the sentences that genuinely correspond and discard the rest, instead of rejecting the whole document or corrupting TM.
- Equal-paragraph-count "traps" can no longer produce wrong pairs — matching is by meaning, not position.
- Bulk imports must never auto-commit on block-count match alone; the semantic path (or human preview) is the only safe bulk route. An admin TM purge (`/api/admin/tm`) exists to undo a bad import (keeps protected disclaimers).
