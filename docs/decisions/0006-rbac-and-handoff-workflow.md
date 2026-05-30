# 6. RBAC and Explicit Handoff Workflow

Status: Accepted

## Context

A governed financial review is a regulated, multi-party process. Who translated, who critiqued, who reconciled for Spain (ADR 0004), and who signed off must be unambiguous and provable. An unstructured "anyone can edit" model makes accountability impossible and violates separation-of-duties expectations from bank compliance: the person who authors a translation should not be the sole approver of it.

## Decision

We enforce role-based access control with distinct roles: **Ingestor** (uploads sources, ADR 0007), **Translator-operator** (drives the Claude/critic loop, ADR 0003), **es-419 Reviewer**, **Spain reconciliation Reviewer** (ADR 0004), **Rule Steward** (governs the neutralization lexicon, ADR 0008), and **Approver/Signer**. Documents move between roles only via explicit **handoff** transitions, each recorded in an append-only `handoff_log` (ADR 0010) with actor, from-state, to-state, timestamp, and note. Separation of duties is enforced: a translator-operator cannot perform final approval on a document they edited.

## Consequences

- Every state transition is attributable; the workflow doubles as the compliance record.
- Roles are least-privilege — e.g. a reviewer can comment and request changes but cannot silently rewrite without it landing in the `edit_log` (ADR 0010).
- Adds process friction by design; emergency overrides require an elevated role and are themselves logged.
- The `handoff_log` is the canonical source of truth for "where is this document and who has it."
