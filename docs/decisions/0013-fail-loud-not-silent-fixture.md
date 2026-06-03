# 13. Fail Loud on a Failed Live Translator — Never Silent Fixture Fallback

Status: Accepted

## Context

The translator had one fallback for two very different situations: (a) no API key configured (offline demo), and (b) a configured key whose call failed — rate limit, exhausted credit, timeout, or an unparseable/truncated response. In both it silently produced the **deterministic fixture translator**, which does crude word-by-word substitution ("growth holding up" → "crecimiento holding up", "of the" → "de el"). For case (b) that emits **code-switched garbage that looks like a broken translation**, with no error shown. A tester hit this on a real article and got three identical "glitched" drafts (they retried, each retry silently saving more garbage). The root failure was invisible because nothing logged *why* the live call didn't run.

## Decision

When a translator key IS configured, a provider error, an unparseable response, or an incomplete one (any segment missing/empty) **throws**. The request returns a clear 4xx, **no draft is persisted**, and the exact reason is logged (`[translate]` prefix: provider message vs. unparseable-snippet vs. N/M-incomplete). The fixture word-substitution translator is now reachable **only** when no key is configured (the genuine offline demo). The same "log the real reason, don't silently degrade" rule is applied at the critic and document-route boundaries.

## Consequences

- A transient provider problem now surfaces as "try again," not as a glitched document — and produces no phantom drafts.
- Incidents are diagnosable from logs (rate limit vs. credit vs. truncation) instead of guessed.
- Stricter: a rare single dropped segment fails the whole document rather than back-filling garbage. Acceptable for a compliance tool; a "retry only the missing segments once" refinement is a possible future softening.
