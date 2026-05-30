# 8. Governed Neutralization-Rule Lifecycle

Status: Accepted

## Context

Neutral es-419 (ADR 0004) and our deterministic validators depend on a body of rules: term mappings (e.g. preferred neutral financial vocabulary), banned regionalisms, and hard checks like the **billón trap** — Spanish *billón* is 10¹² (a million millions), not the English "billion" (10⁹), so a naive translation silently inflates figures by three orders of magnitude. Such rules cannot be edited ad hoc: an unvetted rule change can corrupt every document processed afterward, and regulators expect to see *why* a rule exists and who approved it.

## Decision

Every neutralization rule moves through a governed lifecycle: **proposed → approved → active → deprecated**. Only **active** (and **approved**, staged for activation) rules are applied by the translator, validators, and reconciliation layer. *Proposed* rules are visible but inert; *deprecated* rules stop applying but are retained for historical replay. A Rule Steward role (ADR 0006) shepherds transitions; each transition is append-only logged (ADR 0010) with author, rationale, and effective version. Deterministic validators — billón trap, numeric/currency-token integrity, banned-regionalism scan — are themselves bound to a rule-set version.

## Consequences

- Document outputs are reproducible against the rule-set version active at processing time.
- No silent rule drift; promoting a Spain reconciliation pattern (ADR 0004) into an active rule requires explicit approval.
- The billón trap and similar hard checks block loop exit (ADR 0003) until satisfied.
- Deprecated-but-retained rules let us audit and re-run historical documents faithfully.
