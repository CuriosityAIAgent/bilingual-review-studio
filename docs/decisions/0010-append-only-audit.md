# 10. Append-Only Audit Trail

Status: Accepted

## Context

Every preceding decision generates accountability data: loop iterations and critic findings (ADR 0003), reconciliation accept/reject calls (ADR 0004), role handoffs (ADR 0006), structure-review flags (ADR 0007), rule lifecycle transitions (ADR 0008), and suspected injection events (ADR 0009). For a governed financial workflow, regulators and clients must be able to reconstruct exactly what happened to a document and who was responsible. If history can be edited or deleted, the audit is worthless — a mutable log proves nothing.

## Decision

All state-changing events are written to **append-only** logs — principally `edit_log` (per-block content changes, keyed by `data-block-id` from ADR 0002) and `handoff_log` (workflow transitions from ADR 0006). Records are immutable: no UPDATE, no DELETE. Corrections are expressed as new compensating entries that reference the prior record, never by mutation. Each entry carries actor, role, timestamp, document and block identity, before/after hashes, and the active rule-set version (ADR 0008). The logs are the system of record; derived views (current document state, dashboards) are projections rebuilt from them.

## Consequences

- Full, tamper-evident reconstruction of any document's history and any figure's provenance.
- "Undo" is a new appended event, preserving the original — storage grows monotonically, accepted as the cost of auditability.
- Reproducibility: replaying the log against a pinned rule-set regenerates the exact output.
- The append-only constraint is enforced at the storage layer, not by application convention.
