# Training run: JPM LatAm bilingual pairs

What went into the live memory, what it stored, and the two engineering changes
that came out of it. Run against `translations.tigerai.tech` (gated), read back
from the live `/api/memory` endpoint — numbers are observed, not estimated.

## Final state of the governed memory

| Store | Count | Notes |
|---|---|---|
| Translation memory | 69 | 6 protected disclaimers + 63 vetted segment pairs, 0 superseded |
| Glossary | 33 | 32 active terms + 1 `nearshoring` candidate (in the governance queue) |
| Neutralization rules | 9 | unchanged |

The 63 segment pairs come from four pieces that are genuine EN/ES matches:

| Piece | Mode | Pairs |
|---|---|---|
| Globalization / fragmentation | paragraph (faithful 1:1) | 17 |
| The Cybersecurity Imperative | paragraph (faithful 1:1) | 27 |
| LatAm policy edge (rates/inflation) | semantic | 4 |
| Cutting through the noise (goals-based) | semantic | 15 |

## What the stored pairs teach

Real es-419 from the bank's own desk, so they encode house style:

- **Billón trap, correct every time:** `$1.5 trillion` → `1,5 billones`, `$1 trillion`
  → `un billón`, `$873 billion` → `873 mil millones`, `$213 billion` → `213.000
  millones`, `$3.8 billion` → `3.800 millones`.
- **Neutral vocabulary:** `inversionistas` (not Iberian `inversores`), `cadenas de
  suministro`, `PIB`, `aranceles`, `confianza cero` (zero-trust), `Internet de las
  Cosas`, LatAm decimal commas (`12,4%`, `4.000 millones`).

## The hard finding: most JPM LatAm pages are NOT translations

Screened ~20 articles by hand and with a sweep agent. The Spanish pages are
overwhelmingly editorial **adaptations**, not literal 1:1 translations — typically
50-60% of the English paragraph count, with whole sections dropped or reordered.
Some `/es/` paths even serve a JS-hydrated hub instead of the article body. Of
everything screened, only the four pieces above were faithful enough to train by
paragraph.

The dangerous case: *"LatAm 2026 / optionality"* has **matching** paragraph counts
(47 = 47) but the content drifts out of position from paragraph 6 on. Paragraph
alignment would have "succeeded" and stored ~40 semantically-wrong pairs.

## Change 1: glossary now primes the first draft

The Train flow only stores sentence pairs (TM); it does not extract terminology. So
TM helps on repeats but not on a fresh sentence. To fix the bigger lever, the 10
recurring terms above were promoted into the **governed glossary** (active), which
goes into the translator's prompt and is enforced by validators. New built:
`POST /api/glossary` (propose; an approver/admin may `activate` in the same call).
Glossary had no HTTP route before — only rules did.

## Change 2: semantic alignment, so adaptations become usable

Built `align:"semantic"` on `/api/memory/import`. It splits both sides into
sentences, embeds them with the in-container QE model, and keeps only **mutual-best**
matches at or above `thresholds.align_min_cosine` (0.78). Drifted sentences are
dropped, never paired. This turns an adaptation from "untrainable" into "harvest the
sentences that genuinely correspond." Live results: goals-based → 15 pairs
(0.83–0.98), policy-edge → 4 pairs (0.86–0.91), the rest dropped as no-confident-match.

Safeguards (added after a codex review): `min_score` can only *tighten* the floor,
never loosen it; commit **fails closed** if the embedding model is unavailable
(no positional guessing); the Train UI exposes a paragraph/meaning toggle and shows
each pair's match score before commit.

## Incident caught by QA, and fixed

A background sweep agent reported "0 trained" but its script had auto-committed in
paragraph mode whenever EN/ES paragraph counts coincidentally matched — storing
~250 positionally-misaligned pairs from adaptations (the exact corruption semantic
alignment prevents). QA found the TM at 463 segments instead of ~63. Cleanup:
`POST /api/admin/tm {action:purge_segments}` (admin-only) removed all machine
segments, kept the protected disclaimers, then the four vetted pieces were
re-trained. Verified back to 69 entries.

Lesson banked: never auto-commit bulk imports on block-count match alone; the
semantic path (or human preview) is the only safe bulk route.

## Still open (flagged, not changed here)

- `apply.ts` / `translator.ts` / `validators/glossary.ts` treat glossary state
  `approved` as applicable alongside `active`. The new route only ever sets
  `active`, but legacy/seeded `approved` entries bypass the "only active is applied"
  rule in CLAUDE.md. Worth a separate governance pass.
- `GET /api/glossary` (like `GET /api/memory` and `/api/rules`) has no per-seat RBAC;
  the whole app sits behind the access gate. RBAC-on-GET is a codebase-wide decision,
  not specific to this change.
