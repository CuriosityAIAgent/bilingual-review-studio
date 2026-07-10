# How to develop locally

Get the app running, run the tests, and make the common kinds of change. For the
system design read [`ARCHITECTURE.md`](ARCHITECTURE.md); for the HTTP surface read
[`reference-api.md`](reference-api.md).

## Prerequisites

- **Node 20** (`>=20 <21`; see `package.json` engines). Newer majors emit an
  engine warning and generally work, but 20 is the supported line.
- npm. No database or API keys required to start.

## Run it

```bash
npm install
npm run dev          # http://localhost:3007
```

Runs with **zero configuration**: no API keys, local JSON storage under `data/`,
and a seeded glossary + rules + disclaimers + demo documents. Open the URL, use
the **seat switcher** (top-right) to play each role, and open a sample from the
Home queue.

### Enable real translation

Copy the example env and set keys — the app picks them up:

```bash
cp .env.example .env.local
```

```
ANTHROPIC_API_KEY=...   # translator (Claude). Without it → deterministic fixtures.
OPENAI_API_KEY=...      # critic (a decorrelated family). Without it → deterministic critic.
```

Without keys the app still runs end-to-end using deterministic fixtures, and the
provenance stamp honestly says which engine actually ran (ADR 0014). Models and
prompts are configuration — edit `config/models.yml`, never source.

## Test it

```bash
npm test          # vitest: unit + integration + the finance eval harness
npm run typecheck # tsc --noEmit
npm run lint      # next lint
```

`npm test` runs the unit/integration suite plus a finance eval harness, and an
HTTP e2e that exercises the flywheel, turn lock, hand-off chain, and quality gate.
Validators are independent and deterministic — each has focused tests in
`src/validators/`.

> Note on this workspace: some Conductor checkouts ship without dev
> dependencies installed. If `tsc`/`vitest` are missing, run `npm install` (or
> `npm install --no-save typescript@5` for a quick typecheck-only setup).

## Storage backends

Selected by the `STORAGE` env var (`src/store/index.ts`):

| `STORAGE` | Backend | Setup |
|---|---|---|
| unset / `file` | Local JSON (`data/`) | none; resets on restart |
| `postgres` | Plain Postgres | set `DATABASE_URL`; self-migrates + auto-seeds on boot |
| `supabase` | Supabase Postgres | run `supabase/schema.sql`; set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |

For local dev the file store is easiest. To reproduce a production issue against
Postgres, point `DATABASE_URL` at a local or Railway Postgres and set
`STORAGE=postgres`.

## Common changes

### Add a target locale
1. Add `config/locales/<code>.yml` (copy an existing one; set `script`, number/scale terms, register, and the translator/critic prompt fragments).
2. Add the locale to the target list surfaced in the UI (`app/lib/roles.ts`, `TARGET_LOCALES`).
3. Seed its memory artifacts under `glossaries/` and `tm/` if you have any, or let it start empty and grow via the Train page.
4. If the script needs enforcing, wire a `script_consistency`-style validator (see `zh-script`).

### Add a validator
1. Create `src/validators/<name>.ts` exporting a deterministic check that returns structured results. Keep it independent — no shared mutable state.
2. Register it where the validator set is assembled and add it to the pipeline's validate stage.
3. Add `src/validators/<name>.test.ts` covering pass, fail, and edge cases.

### Add or activate governed memory
Do it through the governed API, not by editing seed files by hand at runtime:
- Glossary term: `POST /api/glossary` (`activate:true` as approver/admin).
- Neutralization rule: `POST /api/rules`, then `POST /api/rules/[id]` `{action:"approve"}`.
- TM from a finished pair: the Train page → `POST /api/memory/import`.
See [`reference-api.md`](reference-api.md) for payloads. Only `active`/`approved`
entries are ever applied.

### Change models, prompts, or thresholds
All in `config/`: `models.yml` (provider/model/prompt version per role),
`thresholds.yml` (QE floors, alignment cosine, human-review floor),
`permissions.yml` (RBAC matrix). No source change needed to swap a provider.

## Verify a change in the real app

For anything user-visible, run it and look — don't just trust the test. Start
`npm run dev`, reproduce the flow, and check the browser console for errors. The
review editor (`/review/[id]`) is where the pipeline output, validators, memory
panel, and turn logic all surface.

## Troubleshooting

- **A translation 422s with a key set** — that's ADR 0013 working: the provider
  errored or returned an incomplete/unparseable response, so no garbled draft is
  saved. Check server logs for the `[translate]` reason.
- **Critic shows "(deterministic fallback)"** — the OpenAI provider failed its
  liveness probe (no key/credit/reachability). Expected offline; the provenance
  is honest by design (ADR 0014).
- **Memory changes didn't appear** — a raw edit never updates memory. It must be
  approved (`/api/memory/proposals/[id]`) or imported via Train. Check the
  pending queue (`GET /api/memory/proposals?state=pending`).
- **QE model slow on first run** — weights download/cache to `.models/` on first
  use; `npm run warm-qe` pre-caches them (also run at build).
- **Node engine warning** — you're on a Node major above 20; usually fine, but 20
  is the supported line.
