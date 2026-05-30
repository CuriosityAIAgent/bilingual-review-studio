# 3. Gated Cross-Model Review Loop

Status: Accepted

## Context

A single LLM translating financial Spanish will make systematic errors it cannot see in itself — a generator and its own self-critique share the same blind spots, training distribution, and failure modes. We need adversarial review, but an ungated "translate → critique → revise" loop can also oscillate forever, amplify a confident-but-wrong critic, or burn budget on cosmetic churn.

## Decision

We run a cross-model loop with three distinct roles and explicit gates:

- **Translator: Claude.** Produces and revises the Spanish HTML block tree.
- **Critic: OpenAI (deliberately a different model family).** Reviews Claude's output for accuracy, register, and neutrality, returning block-anchored findings with severities. A different family means the judge does not inherit the generator's blind spots.
- **Quality-Estimation (QE) router: an open-weight model on bank infrastructure.** Routing-only — it scores segments and decides *which* blocks enter the loop and when the loop terminates. It never edits text.

Gates: a block exits the loop when the critic raises no high-severity findings and QE confidence clears threshold, OR after a hard max-iteration cap. Deterministic validators (ADR 0008) must pass before any block is eligible to exit.

## Consequences

- Higher cost per document, justified for regulated financial content.
- The QE/critic split keeps confidential source text on bank infra for routing while still using frontier models for generation/critique.
- Loop termination is bounded and auditable; every iteration is logged (ADR 0010).
