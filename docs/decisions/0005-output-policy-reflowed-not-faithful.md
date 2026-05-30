# 5. Output Policy: Reflowed, Not Pixel-Faithful

Status: Accepted

## Context

Because we translate structure rather than geometry (ADR 0001) and Spanish text expands relative to English, the translated document *cannot* and *should not* be a pixel-for-pixel replica of the source. Stakeholders sometimes expect "the same document, in Spanish," meaning identical pagination. Meeting that expectation would require text truncation, font shrinking, or layout hacks — all unacceptable for financial content where every clause and figure must remain legible and complete.

## Decision

The studio's contractual output is a **reflowed** document: layout is regenerated from the canonical HTML block tree (ADR 0002) using a deterministic CSS print stylesheet. Heading hierarchy, table integrity, footnote anchoring, and reading order are preserved exactly; page breaks, line wrapping, and column widths are recomputed for the Spanish text. We explicitly do **not** guarantee matching page counts or visual coordinates. Every delivered artifact carries a "reflowed translation — not a visual facsimile of the source" notice.

## Consequences

- No content is ever clipped or shrunk to fit a fixed frame.
- Reviewers comparing source and target side-by-side use `data-block-id` correspondence (ADR 0002), not page numbers.
- Rendering is deterministic and reproducible from the block tree, so the same approved tree always yields the same PDF/HTML.
- Clients needing strict facsimiles are out of scope and told so up front.
