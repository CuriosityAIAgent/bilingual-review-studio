# 15. Recover Before Failing Loud — Layered Recovery Under the Fail-Loud Contract

Status: Accepted

## Context

ADR 0013 made the translator **fail loud**: when a key is configured, a provider error, an unparseable reply, or a dropped segment throws, and no draft is saved. That stopped the silent word-substitution garbage — but it was strict. *Any* imperfect reply failed the whole document, and in production that surfaced as an intermittent *"the translation service returned an unreadable response. No draft was saved."* on ordinary work.

Two distinct causes hid behind that one message:

- **Truncation.** The translator asks for a JSON array over the segments, capped at `max_tokens`. A long (or Chinese) document overflowed the cap and cut off mid-JSON (#40). Even after chunking, a single unbroken paragraph (roughly 4,000+ words) could overflow a one-segment call on its own — and batching cannot split *within* a segment (#43).
- **Unparseable-but-complete.** A reply that finished normally but was not valid JSON. The common case is a **raw line break inside a Chinese translation**: JSON forbids control characters inside a string value, so `JSON.parse` throws. This is **length-independent**, so ~800-word Chinese documents hit it just as easily as long ones (#44).

Fail-loud is correct as a floor. Failing loud on a *recoverable* reply is not.

## Decision

Keep fail-loud, but **recover first wherever it is safe**. The translator tries these layers in order and throws only when a single, indivisible segment still cannot be read:

1. **Chunk long documents** so each call's output stays well under `max_tokens` (`batchSegments` sizes batches by source length, a conservative heuristic); a batch that still truncates is split in half and retried. `max_tokens` raised 4096 → 8192. (#40)
2. **Sub-split an oversized single block.** A lone paragraph too large for even a one-segment call is split on sentence boundaries, translated in pieces, and stitched back into one block (`translateOversizedSegment`) — joined with a space for space-delimited targets, and with **no separator for CJK**. (#43)
3. **Repair a malformed reply.** `parseJsonLoose` escapes stray control characters (raw newline / tab / CR) that sit *inside* JSON string values, then re-parses — recovering the common CJK case on the first pass. The repair runs only after a first parse fails, so valid JSON is never touched. (#44)
4. **Retry one unparseable segment.** If a single-segment reply still will not parse (and did not truncate), retry it once on the **same `{id, es}` JSON contract** (`retryTranslateSegment`). A truncated retry falls back to sub-splitting (layer 2); a genuine provider error on the retry surfaces as *"temporarily unavailable,"* not *"unreadable."* (#44)

Only after all of these does an indivisible, still-unreadable segment throw. The `[translate]` logs record when the sub-split path fires and, when recovery ultimately fails, name the cause (truncated-and-unsplittable, unparseable, or provider error); the control-character repair and the batch split-and-retry are silent.

## Consequences

- Long documents, one-paragraph pastes, and short Chinese documents that used to fail now succeed. *"Unreadable response"* is reserved for a genuinely unreadable single segment.
- **Recovery stays on the structured contract.** The retry can only ever yield a validated `{id, es}` translation or fall through to fail loud — it never persists prose, a refusal, or wrapper text. A **plain-text retry was considered and rejected** for exactly this reason: unstructured output cannot be validated, and adversarial review surfaced prose-acceptance, quote-stripping, and escape-corruption failure modes on that path.
- The recovery path costs **extra provider calls, but only on the rare reply that first failed**. The control-character repair (layer 3) adds no call at all.
- **Recovery guards readability, not correctness.** A parseable-but-wrong translation is still caught downstream by the decorrelated critic (ADR 0003), the deterministic validators, and human review. The recovery layer never claims to judge meaning — it only keeps a readable, complete draft from being thrown away.
