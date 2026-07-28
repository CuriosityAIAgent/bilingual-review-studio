# Security

The security model of Bilingual Review Studio, its trust boundaries, and its
known limitations. Read this before deploying or sharing the app. For the system
design see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md); the "why" behind each
control is in the [ADRs](docs/decisions/).

## Reporting a vulnerability

Do not open a public issue for a security problem. Contact the maintainers
privately (repo owner) with a description and reproduction. We'll acknowledge and
triage before any public disclosure.

## Trust boundaries

| Boundary | Control |
|---|---|
| Internet → app | **Access gate** (`middleware.ts`): when `ACCESS_CODE` is set, every page and API route requires a valid `ts_gate` cookie, or it's bounced to `/gate` (pages) / `401` (API). No LLM call fires un-gated. |
| Gate cookie | SHA-256 token of the code (never the code itself), `httpOnly` + `secure` (prod) + `sameSite=lax`; the code check is a constant-time compare. |
| User → role/action | **RBAC** (`config/permissions.yml`) gates every mutating action; disclaimers always escalate to approver/compliance. |
| Uploaded document → pipeline | Source text is **untrusted data, never instructions**: delimiter-stripped (`stripDelims`) and placed in a `<DATA>` block the model is told to treat as data only (ADR 0009). |
| App → LLM providers | Outbound only (Anthropic, OpenAI). Keys are server-side env vars, never sent to the client. |
| App → database | Parameterized SQL (`$1/$2`); append-only audit logs enforced at the DB layer (`REVOKE update/delete` on `edit_log`/`handoff_log`). |

## Controls in place

- **No secrets in the repo.** `.env` is gitignored; `.env.example` holds placeholders only. Keys live in the deploy environment (Railway).
- **Prompt-injection hardening** on all source-derived text (ADR 0009).
- **Parameterized SQL** throughout the Postgres store — no string-interpolated queries.
- **Append-only audit** — `edit_log` / `handoff_log` are immutable; corrections are compensating events (ADR 0010).
- **Fail loud, never garble** (ADR 0013) and **honest provenance** (ADR 0014) — a provider failure errors out rather than persisting or mislabeling a bad draft.
- **XSS-safe by default** — React auto-escapes; the one `dangerouslySetInnerHTML` is a static theme-init script, not user data.
- **Supply chain** — lockfile tracked; no dependency install (`postinstall`) scripts.

## Known limitations (read before external exposure)

This build is designed for an **internal, trusted audience behind the access
gate**. Two limitations matter before wider or external use:

1. **Authentication is a mock seat switcher.** Identity travels in the
   client-set `x-brs-seat` header with no server verification (`src/server/context.ts`),
   so any user past the access gate can present any role — including `admin`. The
   effective trust boundary today is *"the shared access code = full access,
   including admin actions"* (memory purge, document deletion, proposal approval).
   This is intentional and documented (README "Honest scope", ADR 0006).
   **Before sharing with non-trusted users, replace the mock seat with
   server-verified sessions (OIDC/SAML) feeding the same RBAC** — the decision
   logic in `src/auth` stays the same.

2. **No rate limiting or spend cap.** The translate / re-translate endpoints each
   make live LLM calls, throttled only by the shared access gate. Treat the
   access code as sensitive (rotate it, limit distribution), and add a per-user /
   per-IP cap plus a provider-side budget alert before broad use.

## Operating guidance

- Always set `ACCESS_CODE` before sharing a deployment; rotate it periodically and never reuse it.
- Keep `.gstack/` (local security reports) out of the repo (already gitignored).
- Run `/cso` (the built-in security audit) before notable releases.

> This document reflects an AI-assisted review plus the codebase's documented
> design. It is not a substitute for a professional penetration test before
> handling sensitive production data.
