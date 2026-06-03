# 12. Reviewer Edits Enter Memory Only Through a Governed Proposal

Status: Accepted

## Context

A reviewer's in-document correction is saved to that document (its `final_text` and the append-only `edit_log`, ADR 0010), but it did **not** flow into the shared memory, so the same correction had to be re-made on the next document. The obvious shortcut — auto-add every edit to translation memory — is unacceptable: it would let an unvetted, possibly wrong correction propagate to every future document with no approval, violating the governed-memory guarantee (ADR 0008) and the "memory only changes through an approved step" rule. Disclaimers are especially sensitive (approver/compliance-only).

## Decision

A **"Send to memory"** action on a corrected segment files a **`TmProposal`** (`pending`) carrying the English source + the corrected Spanish, the document/segment, and who proposed it (`/api/memory/proposals`, role `propose_change_or_rule`). It does not touch TM. An **approver/admin** reviews the queue and approves it into TM or rejects it (`/api/memory/proposals/[id]`). Approval is an explicit approver/admin check (not the policy-configurable `approve_rule`), the decision is persisted **before** the TM write (so a concurrent/duplicate approval no-ops), and disclaimers are never folded in via this path. Proposals dedupe by source+target so a re-send doesn't queue twice.

## Consequences

- The flywheel finally closes from in-tool edits, not only from the Train page — but still through one approved, audited step.
- Memory cannot be silently mutated by a single reviewer; compliance retains the gate.
- Storage gains a `tm_proposals` collection across all three backends (file / postgres / supabase), mirroring glossary/rules.
