# 1. Translate Structure, Not Pixels

Status: Accepted

## Context

Financial review documents arrive as paginated artifacts (PDF, DOCX) where meaning lives in the document's logical structure — headings, tables, footnotes, ordered clauses — not in absolute glyph coordinates. Early prototypes that treated the source as a bitmap or that tried to preserve exact x/y placement produced brittle output: Spanish text runs ~15–30% longer than English, so fixed text boxes overflowed, tables clipped, and footnote anchors drifted. Pixel fidelity also tempted the pipeline toward OCR, which corrupts the very numbers (basis points, currency amounts) that a financial reviewer cannot afford to lose.

## Decision

The studio translates the *structural* representation of a document — the ordered tree of blocks (sections, paragraphs, list items, table cells, footnotes) with their semantic roles — and never the rendered page geometry. Layout coordinates from the source are discarded after structure extraction. Downstream stages (translator, critic, QE, validators) operate exclusively on this block tree.

## Consequences

- Spanish expansion is a non-issue: reflow (ADR 0005) recomputes layout from structure.
- We must invest in robust structure extraction per format (ADR 0007), and structure errors propagate, so extraction is a first-class validated stage.
- We cannot promise visual byte-for-byte parity with the source; this is made explicit in the output policy (ADR 0005).
- Numeric tokens survive intact because they travel as structured cell/inline content, never re-OCR'd.
