# 2. HTML as the Canonical Intermediate Format

Status: Accepted

## Context

ADR 0001 commits us to translating a structural block tree. That tree needs a concrete serialization that every stage — translator (Claude), critic (OpenAI), QE router (open-weight), and deterministic validators — can read and write losslessly. Candidates included a bespoke JSON AST, Markdown, and HTML. Markdown cannot represent merged table cells, footnote references, or inline role annotations without extension soup. A bespoke AST would force us to write and maintain serializers for every tool boundary and every LLM prompt.

## Decision

We adopt a constrained, semantic subset of HTML5 as the canonical intermediate format. Structure maps to standard elements (`<section>`, `<table>`, `<th>`, `<li>`, `<sup>` footnote refs). Translation-relevant metadata travels in `data-*` attributes: `data-block-id` (stable identity for diffing and audit), `data-role` (clause, footnote, total-row), and `data-lang`. Numeric tokens are wrapped in `<span data-numeric>` so validators (ADR 0008) can locate them without re-parsing prose.

## Consequences

- LLMs handle HTML natively; prompts stay simple and the critic can return inline edits anchored to `data-block-id`.
- The constrained subset is enforced by a schema validator on ingress/egress of every stage — arbitrary HTML is rejected to prevent style/script smuggling (see ADR 0009).
- Rendering to final output (ADR 0005) is a pure HTML/CSS reflow, no format conversion.
- `data-block-id` becomes the join key for the append-only audit log (ADR 0010).
