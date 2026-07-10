# Documentation

Start here to understand and work on Bilingual Review Studio. Docs follow the
[Diataxis](https://diataxis.fr/) split — reference, how-to, explanation.

## Read in this order

1. **[Project README](../README.md)** — what it is, what works end-to-end, the 90-second demo, and quick start.
2. **[Architecture](ARCHITECTURE.md)** — system shape, pipeline, document model, governed memory, storage, security. *The engineer's map.*
3. **[API Reference](reference-api.md)** — every HTTP endpoint, with auth, params, and responses.
4. **[How to develop locally](howto-local-development.md)** — run, test, and make the common changes.
5. **[Deployment](DEPLOYMENT.md)** — GitHub → Railway → Postgres/Supabase, the access gate, env matrix.
6. **[`CLAUDE.md`](../CLAUDE.md)** (repo root) — the full design contract (the non-negotiable rules).

## By type (Diataxis)

- **Reference** — [Architecture](ARCHITECTURE.md), [API](reference-api.md)
- **How-to** — [Local development](howto-local-development.md), [Deployment](DEPLOYMENT.md)
- **Explanation** — the [ADRs](decisions/) below, plus `CLAUDE.md`

## Architecture Decision Records

The "why" behind the design lives in [`decisions/`](decisions/):

| ADR | Decision |
|---|---|
| [0001](decisions/0001-translate-structure-not-pixels.md) | Translate structure, not pixels |
| [0002](decisions/0002-html-intermediate-format.md) | HTML as the intermediate format |
| [0003](decisions/0003-gated-cross-model-loop.md) | The gated cross-model refine loop |
| [0004](decisions/0004-neutral-spanish-default-with-reconciliation.md) | Neutral Spanish default with reconciliation |
| [0005](decisions/0005-output-policy-reflowed-not-faithful.md) | Output policy: reflowed, not faithful |
| [0006](decisions/0006-rbac-and-handoff-workflow.md) | RBAC and the hand-off workflow |
| [0007](decisions/0007-ingestion-split-docx-first.md) | Ingestion split: docx first |
| [0008](decisions/0008-governed-rule-lifecycle.md) | Governed rule lifecycle |
| [0009](decisions/0009-untrusted-source-prompt-injection.md) | Untrusted source / prompt injection |
| [0010](decisions/0010-append-only-audit.md) | Append-only audit logs |
| [0011](decisions/0011-semantic-train-alignment.md) | Semantic train alignment |
| [0012](decisions/0012-reviewer-edit-to-memory-proposal.md) | Reviewer edit → memory proposal |
| [0013](decisions/0013-fail-loud-not-silent-fixture.md) | Fail loud, not silent fixture garble |
| [0014](decisions/0014-honest-provider-provenance.md) | Honest provider provenance |

## Other artifacts

- [`CHANGELOG.md`](../CHANGELOG.md) — what shipped, by release.
- [`DEPLOYMENT.md`](DEPLOYMENT.md) — operational deploy guide.
- [`training-report.md`](training-report.md) — a memory-training run report.
- `translation-studio-overview.html` — a rendered product overview.
