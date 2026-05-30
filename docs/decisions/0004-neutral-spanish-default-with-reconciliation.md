# 4. Neutral Spanish (es-419) Default with Spain-Side Reconciliation

Status: Accepted

## Context

Our financial review clients distribute across Latin America and Spain. Producing per-country variants (es-MX, es-AR, es-CO, es-ES…) multiplies translation, review, and audit cost linearly and fragments the editorial standard. Yet a single global Spanish risks Latin American phrasing that reads as foreign — or worse, *wrong* — to a Spain-based compliance reviewer, and vice versa. Financial register differences (e.g. lexical and numeric conventions) are real and consequential.

## Decision

The default target is **neutral Latin American Spanish (es-419)**: pan-regional vocabulary, no country-specific colloquialisms, regionally-neutral financial terminology curated as governed rules (ADR 0008). On top of the es-419 baseline we run a **Spain-side reconciliation review layer** — a distinct, optional pass that flags es-419 choices that are unidiomatic or non-compliant for a Spain (es-ES) audience and proposes localized substitutions, without forking the canonical document.

## Consequences

- One canonical Spanish artifact, one audit trail, instead of N variants.
- Reconciliation findings are reviewed by a Spain-side reviewer role (ADR 0006) and either accepted into an es-ES delivery overlay or rejected with rationale, all logged (ADR 0010).
- The neutralization vocabulary is itself governed and versioned (ADR 0008); reconciliation can promote recurring Spain-side fixes into proposed rules.
- es-419 must be enforced, not hoped for: deterministic checks flag known regionalisms.
