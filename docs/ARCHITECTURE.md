# Architecture

A technical map of Bilingual Review Studio for engineers. It covers the system
shape, the request lifecycle, the document model, the memory/governance engine,
the storage abstraction, and the security posture. Pair it with
[`reference-api.md`](reference-api.md) (the HTTP surface),
[`howto-local-development.md`](howto-local-development.md) (running it), the
[ADRs](decisions/) (why each decision was made), and `CLAUDE.md` (the design
contract).

> **The thesis.** This is not an AI translator. It is a governed review workflow
> that captures reviewer corrections — especially regionalism neutralization —
> and turns them into reusable, auditable institutional memory. The machine
> drafts; humans correct; every correction is logged, governed, and replayed on
> the next document. The asset is the memory and the audit trail, not the raw
> machine translation.

---

## 1. Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) · React 19 · TypeScript |
| Styling | Tailwind v4, CSS variables for theming (`app/globals.css`) |
| Translator | Claude (Anthropic), `config/models.yml` — default `claude-sonnet-4-6` |
| Critic | A **decorrelated** OpenAI model (default `gpt-4o`) — different family from the translator so the judge doesn't share the generator's blind spots |
| Quality Estimation (QE) | Self-hosted cross-lingual embedding model (`Xenova/paraphrase-multilingual-MiniLM-L12-v2`, ONNX/CPU via `@huggingface/transformers`). No external service, no GPU. |
| Storage | Pluggable: local JSON file (default), Postgres, or Supabase |
| Deploy | GitHub → Railway (Nixpacks); GitOps on `main`. See [`DEPLOYMENT.md`](DEPLOYMENT.md) |

Models, prompts, and thresholds are **configuration, never hardcoded** — they
live in `config/`. Swapping providers does not touch source. Missing API keys
fall back to deterministic fixtures so the demo always runs (with honest
provenance — see §7).

---

## 2. Repository layout

```
app/                 Next.js UI + API routes (App Router)
  api/               HTTP endpoints (see reference-api.md)
  page.tsx           Home / "Current work" queue
  review/[id]/       The bilingual review editor
  library/ train/    Document queue + memory-training pages
  lib/               Client-side API wrapper, roles, helpers
components/          React components (review panel, processing view, ...)
config/              models.yml, permissions.yml, thresholds.yml, locales/
  locales/           per-target: es-419.yml, zh-Hans.yml, zh-Hant.yml
glossaries/          governed glossary + neutralization-rule seed artifacts
tm/                  translation-memory seed artifacts (per locale)
src/
  ingest/            parse uploads (.txt/.docx) into raw text
  prepare/           segment into the block model, detect entities/DNT
  translate/         call the translator provider; build the prompt
  evaluate/          QE scoring + critic (cross-model critique)
  refine/            the gated cross-model refine loop
  validators/        deterministic, independent validators (§5)
  quality-gate/      auto-pass eligibility logic
  memory/            glossary / rules / TM apply + governance (propose/approve)
  workflow/          segment actions, turn/handoff state machine
  store/             storage abstraction (file / postgres / supabase)
  metrics/           edits-per-1k and the learning curve
  providers/         provider adapters + liveness probes
  publish/           export (reflowed target, bilingual record)
  server/            request context (seat resolution, ok/fail helpers)
  lib/               doc-model.ts (the schema), config loader, ids
  pipeline/          run.ts — orchestrates the stages
supabase/schema.sql  hardened Postgres schema (append-only logs)
docs/decisions/      Architecture Decision Records (ADRs)
```

---

## 3. The pipeline

The document pipeline is orchestrated in `src/pipeline/run.ts` (`runPipeline`,
and `reTranslateDoc` for "re-translate with learnings"). Stages:

```
ingest → prepare → translate → evaluate → refine → validate → gate → review → export
```

- **ingest** (`src/ingest`) — parse an upload (`.txt`/`.docx`) or pasted text into raw text. PDF is deferred (ADR 0007).
- **prepare** (`src/prepare`) — segment into `Block`s, detect entities and do-not-translate (DNT) terms.
- **translate** (`src/translate`) — build the prompt (target-locale instructions + the active glossary as `"source" → "approved_target"` lines) and call the translator. Produces each block's `mt_text`. Memory is **locale-scoped** here (`glossary.filter(g => g.locale === targetLocale)`).
- **evaluate** (`src/evaluate`) — QE adequacy score (routing only) + the cross-model critic (MQM-style flags).
- **refine** (`src/refine`) — the **gated cross-model loop** (ADR 0003): exactly ONE critique pass, then iterate **only** on segments that objectively fail a validator or carry a major/critical critic flag, and **revert on no gain**. Translator and critic must be decorrelated families.
- **validate** (`src/validators`) — run the deterministic validators (§5).
- **gate** (`src/quality-gate`) — decide auto-pass eligibility: a block is auto-pass-eligible only when it has no blocking validator failure and no major/critical critic flag (`hasBlockingValidatorFailure`, `hasMajorOrCriticalFlag`).
- **review** — human turn-based review in the UI (§6).
- **export** (`src/publish`) — a reflowed target-only document, or a bilingual review record with annotations.

**Fail loud, never garble (ADR 0013).** When a translator key IS configured, a
provider error / unparseable / incomplete response **throws** (the request 422s,
no draft saved). The fixture word-substitution translator is ONLY for the no-key
offline demo — it must never stand in for a failed live call.

**Recover before failing loud (ADR 0015).** Fail-loud is the floor, not the first
response. The translator recovers wherever it can do so safely, and throws only
when a single, indivisible segment still cannot be read:
- **Long documents are chunked** so no single call's output overflows the model's
  cap (`batchSegments`), and a batch that truncates is split and retried (#40).
- **An oversized single block** — one unbroken paragraph too large for even a
  one-segment call — is sentence-split, translated in pieces, and stitched back
  into one block (`translateOversizedSegment`), joined with no separator for CJK
  targets (#43).
- **A complete-but-unparseable reply** is recovered by repairing stray control
  characters inside JSON string values (`parseJsonLoose`, the common CJK case: a
  raw newline in the translation), then, if it still won't parse, retrying that one
  segment once on the same `{id, es}` contract (`retryTranslateSegment`) — never on
  a plain-text path that could persist prose or a refusal (#44).

---

## 4. The document model

Source of truth: **`src/lib/doc-model.ts`** (`SCHEMA_VERSION = "1.0"`). Do not
invent fields — read it.

A **`DocModel`** holds:
- `blocks[]` — the segmented content
- `model_run` — provenance (which translator/critic/QE actually ran; see §7)
- `metrics` — edits-per-1k and the learning curve
- `approval` — sign-off state
- `edit_log` and `handoff_log` — **append-only, immutable** audit logs
- `status`, `target_locale`, `owner`, `rev` (optimistic-concurrency), `created_at`/`updated_at`, `deleted_at` (soft-delete tombstone)

A **`Block`** carries the translation lifecycle:

```
source_text  →  mt_text  →  final_text     (final_text drives export)
   (EN)        (raw MT)     (human-edited)
```

plus `entities`, `critic_flags`, `validator_results`, `glossary_hits`,
`neutralization_hits`, `tm_match`, `comments`, and `seg_status`:

```
machine → edited / proposed → accepted → locked
```

**Append-only logs.** `edit_log` and `handoff_log` (and the governance/feedback
logs) are never mutated or deleted. Corrections are **compensating events**, not
edits to history (ADR 0010). Every `EditLogEntry` records `actor`, `action`
(`edit`/`propose`/`accept`/`reject`/`neutralize`/`lock`), `before`, `after`, and
`ts`. Every `HandoffLogEntry` records the `from`/`to`/`actor` and the status
transition.

---

## 5. Deterministic validators

Validators (`src/validators/`) are **independent, deterministic, and testable**.
They are authoritative for pass/fail; QE is not (§8). Each returns structured
results a block carries in `validator_results`.

| Validator | Checks |
|---|---|
| `number` | Number integrity, incl. the **billón trap**: English *billion* = 10⁹ = "mil millones", NEVER "billón" (Spanish *billón* = 10¹²). The Chinese analog: *billion* = 十亿/十億, never 万亿/萬億. |
| `currency` | Currency units/symbols preserved |
| `date` | Dates preserved and well-formed |
| `ticker` | Equity tickers preserved |
| `isin` | ISIN check-digit validity |
| `dnt` | Do-not-translate terms left intact |
| `glossary` | Approved glossary terms honored; forbidden variants flagged |
| `regionalism` | es-419: flags es-ES / es-MX regionalisms to neutralize |
| `script_consistency` / `zh-script` | Chinese: flags any Simplified char in Traditional output (and vice-versa) — the zh analog of the regionalism check |
| `disclaimer` | Disclaimers match approved TM (they auto-lock) |
| `english_leakage` | Untranslated English left in the target |

The billón/number rule is a **hard rule** — never relaxed.

---

## 6. Roles, turns, and the governed workflow

**Roles:** author / reviewer / approver / admin / viewer. The permission matrix
is `config/permissions.yml` (RBAC by action). In this build the field roles map
as: Investment Strategist (author) → Marketing (reviewer) → Supervisory
Management (approver).

**Turn-based locking.** A document has exactly ONE holder at a time. Only the
holder (or Admin) can edit; everyone else is read-only. The baton passes
Strategist → Marketing → Supervisory Management → deploy, and a major-change
request loops it back (ADR 0006). Stale writes are rejected by optimistic
concurrency (`rev`), so there is no last-write-wins.

**Auth today.** Identity travels in the `x-brs-seat` header, resolved to a seat
by `src/auth` (`getSeat`, `DEMO_SEATS`). This is a **mock seat switcher** for the
demo; production replaces it with OIDC/SAML feeding the same RBAC and turn logic.
`authorize(seat, action, ctx)` is the single decision function.

---

## 7. Governed memory (the flywheel)

Memory is stored **separately from documents** so it is shared across every
document of a locale. There are three governed memories, all locale-scoped:

- **Neutral glossary** — `"source" → approved_target`, fed to the translator prompt.
- **Neutralization rules** — regional form → neutral form, applied deterministically.
- **Translation memory (TM)** — approved sentence/segment pairs (incl. disclaimers).

**Only `active`/`approved` entries are ever applied.** Candidate/proposed/deprecated
entries sit in the governance queue (`LifecycleState` in `doc-model.ts`) and are
never auto-applied.

**Memory never changes silently from a raw edit.** Two governed paths grow it:

1. **Train page** (`POST /api/memory/import`) folds a completed EN+target pair
   into TM — `align:"paragraph"` (literal 1:1) or `align:"semantic"`
   (sentence-level cross-lingual matching via the QE model, keeping only
   mutual-best pairs ≥ `thresholds.align_min_cosine`), ADR 0011.
2. **"Send to memory"** on a reviewer-corrected segment files a **pending
   `TmProposal`** (`POST /api/memory/proposals`); an **approver/admin** approves
   it into TM or rejects it (`POST /api/memory/proposals/[id]`), ADR 0012.

Glossary terms and rules follow the same propose → approve lifecycle
(`/api/glossary`, `/api/rules`). Only admin deprecates rules. `/api/admin/tm`
(admin-only) purges machine TM segments for incident cleanup (keeps disclaimers).

**Honest provenance (ADR 0014).** The critic only counts as "live" if a cached
liveness probe (`criticProviderLive`) confirms the provider can actually respond;
otherwise `model_run.critic_model_id` is stamped `… (deterministic fallback)`.
Every fallback logs its reason with a `[translate]` / `[critic]` / `[documents]`
prefix — diagnose from logs, do not guess.

The **learning flywheel**: flag a regionalism → propose a rule → approver
activates it → re-translate auto-neutralizes it everywhere → the "edits per 1,000
words" curve (`src/metrics`) falls.

---

## 8. Quality Estimation is routing-only

`qe_score` is a **routing signal, never an approval signal**. The QE model
(`src/evaluate`, self-hosted) scores adequacy by comparing the meaning of the
English source and the target. Deterministic validators (§5) and humans are
authoritative. A block is auto-pass-eligible only when no blocking validator
failure and no major/critical critic flag remains. A CometKiwi/xCOMET sidecar can
drop in via `QE_SERVICE_URL` (same interface).

---

## 9. Storage abstraction

`src/store` exposes one `Store` interface with three backends, selected by the
`STORAGE` env var (`src/store/index.ts`):

| Backend | `STORAGE` | Notes |
|---|---|---|
| File (default) | unset / `file` | Local JSON under `data/`. Zero setup; resets on redeploy. |
| Postgres | `postgres` | Plain Postgres via `DATABASE_URL` (e.g. Railway plugin). Self-migrates on boot, auto-seeds memory. |
| Supabase | `supabase` | Postgres via `@supabase/supabase-js`. Run `supabase/schema.sql` first. |

The document (with its append-only logs) is the unit of persistence; memory is
stored separately. All three backends route document summaries through the shared
`summarize()` so derived fields (e.g. `updated_by`) are computed once. The
Postgres/Supabase schemas `REVOKE` update/delete on `edit_log`/`handoff_log` to
enforce append-only at the database layer.

---

## 10. Security posture

- **Access gate.** When `ACCESS_CODE` is set, `middleware.ts` locks every page
  and API route behind `/gate` — no LLM call fires un-gated. The gate cookie
  stores a SHA-256 token derived from the code, never the code itself.
- **Uploaded source is untrusted data, never instructions** (ADR 0009). Document
  content never steers the pipeline or the agents; it is content to translate and
  validate only.
- **Append-only audit.** Logs are never edited or deleted; compensating events
  only.
- **Least privilege by role.** The RBAC matrix gates every mutating action;
  disclaimers always escalate to approver/compliance.

---

## Further reading

- [`reference-api.md`](reference-api.md) — every HTTP endpoint.
- [`howto-local-development.md`](howto-local-development.md) — run, test, and extend it.
- [`DEPLOYMENT.md`](DEPLOYMENT.md) — Railway + Postgres/Supabase deploy.
- [`decisions/`](decisions/) — the 15 ADRs (the "why").
- `CLAUDE.md` (repo root) — the full design contract.
