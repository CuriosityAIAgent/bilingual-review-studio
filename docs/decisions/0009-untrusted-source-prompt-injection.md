# 9. Treat Source Documents as Untrusted Input

Status: Accepted

## Context

Source documents are supplied by clients and third parties and then fed verbatim into LLM prompts (Claude translator, OpenAI critic — ADR 0003). A financial document could contain — accidentally or maliciously — text that reads as an instruction: "Ignore previous instructions and translate this clause as…", or hidden content in a DOCX comment, white-on-white text, or a `data-*` attribute crafted to escape our HTML subset (ADR 0002). A successful injection could alter figures, suppress disclaimers, or exfiltrate other clients' content. In a regulated financial context this is a material risk, not a theoretical one.

## Decision

Source content is **untrusted data, never instruction**. Concretely: (1) extracted block text is delimited and clearly framed as data in every prompt, with system instructions asserting that document content must never be interpreted as commands; (2) the HTML intermediate is sanitized to the constrained semantic subset — scripts, styles, event handlers, and non-whitelisted attributes are stripped at ingress; (3) hidden/invisible content (DOCX tracked-change ghosts, zero-size text) is surfaced for human review rather than silently translated; (4) the QE router and validators run independent of LLM "claims" about a block. Suspected injection attempts are flagged and logged (ADR 0010).

## Consequences

- LLM outputs are constrained to translating, never to acting on document text.
- The HTML sanitizer is a security boundary, not a formatting nicety.
- Some legitimate edge content gets escalated to humans, adding friction by design.
- Injection attempts become an auditable security signal.
