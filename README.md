# Bilingual Review Studio

A **governed neutral-Spanish financial review workflow**. Not an AI translator — a
review system that turns reviewer corrections (especially *regionalism
neutralization*) into **reusable, auditable institutional memory**. The machine
drafts; humans correct; every correction is logged, governed, and replayed on the
next document. The asset is the memory and the audit trail.

Next.js 16 · React 19 · TypeScript · Tailwind v4 · Postgres / Supabase /
local-file storage. Translator: Claude Sonnet 4.6 · Critic: GPT-5 (a
decorrelated family) · QE: a self-hosted model. The design contract lives in
`CLAUDE.md` and the ADRs in `docs/decisions/`.

---

## What actually works (verified end-to-end)

The full loop runs through the real API with real role separation (see
`npm test` + the e2e checks):

- **Paste English or upload** `.txt` / `.docx` → segmented document model. Paste a
  note, a memo, an email — anything; PDF deferred. A **"Train"** page also ingests
  a finished English+Spanish pair to seed memory directly.
- **Translate** to neutral es-419 (Claude when a key is set; deterministic
  fixtures otherwise so the demo always runs).
- **Cross-model critique** (a decorrelated model family) + a **gated refine loop**
  that fixes only objectively-failing segments and reverts on no gain.
- **Reference-free QE that is a real model, self-hosted in this container** — a
  cross-lingual embedding model (`Xenova/paraphrase-multilingual-MiniLM-L12-v2`,
  ONNX/CPU via `@huggingface/transformers`) scores adequacy by comparing the
  meaning of the English source and the Spanish translation. No external service,
  no GPU. Weights pre-cached to `.models/` at build (`npm run warm-qe`). A
  CometKiwi/xCOMET sidecar can drop in via `QE_SERVICE_URL` (same interface). QE
  is a routing signal only; validators + humans decide.
- **10 deterministic validators** — number integrity incl. the **billón trap**
  (English *billion* = 10⁹ = "mil millones", never "billón"), currency, date,
  ticker, ISIN check-digit, DNT, glossary, regionalism, disclaimer, English leakage.
- **The learning flywheel:** flag a regionalism → propose a neutralization rule →
  approver activates it → re-translate auto-neutralizes it everywhere → the
  "edits per 1,000 words" curve falls. Governed lifecycle: only **active/approved**
  rules are ever applied.
- **The process, shown on top** — a live pipeline: Translate → Checks → Governance
  → Rewrite → Marketing review → SM approval → Deploy to clients, with done/active
  state + counts.
- **Turn-based locking** — a document has ONE holder at a time. Only the holder
  (or Admin) can edit; everyone else is read-only with a "held by X" banner. The
  baton passes **Investment Strategy → Marketing → Supervisory Management →
  deploy**, and a major-change request loops it back. Append-only `edit_log` /
  `handoff_log`; exact-match disclaimers auto-locked from approved TM;
  optimistic-concurrency stale-write protection (no last-write-wins).
- **English-left / Spanish-right** text-editor experience with a format toolbar.
- **Real content:** the 5 latest J.P. Morgan "Top Market Takeaways" pieces ship as
  samples, translated to neutral es-419.
- **Export** a bilingual review record (and a reflowed target-only doc).

`npm test` → 87 unit/integration tests + a 31-case finance eval harness. A full
HTTP e2e exercises the flywheel, turn lock, hand-off chain, and quality gate.

---

## Roles & the short process

Everyone logs in and sees the same platform (read-only by default). Each document
has one holder; editing is turn-based.

| Role | Does | When it's their turn |
|---|---|---|
| **Investment Strategist** | drafts + neutralizes, hands off | document is `draft` / `changes_requested` |
| **Marketing** | reviews + neutralizes, deploys | after submit (`in_review`), and after SM approval (`approved`) |
| **Supervisory Management** | final sign-off / request changes | after Marketing hands off |
| **Admin / Viewer** | manage / read-only | — |

Flow: **Strategist → Marketing → Supervisory Management → deploy to clients.**
Major changes from SM send it back to the Strategist to repeat the steps.

In this build, login is a **mock seat switcher** (top-right) so one person can play
the whole chain; production swaps in OIDC/SAML → the same RBAC + turn logic.

## The 90-second demo (what to show senior management)

1. Seat = **Investment Strategist**. Open a J.P. Morgan sample
   (*"If the shock doesn't stick"*). It translates and opens with the **process
   pipeline on top** and English-left / Spanish-right.
2. One segment is flagged: the Peninsular word **"ordenador"**. The closing JPM
   disclaimer is **auto-locked** (sage tag) — it came from approved memory.
3. Click **Teach rule** → propose `ordenador → computadora`. Click **Hand off to
   Marketing**. Switch seat to **Marketing** — the doc is now *its turn*; as the
   Investment Strategist it's read-only.
4. As **Supervisory Management**, the Governance queue shows the proposed
   rule → **Approve**. (As the Reviewer the approve is blocked.)
5. Click **Re-translate with learnings** → the segment auto-neutralizes to
   "computadora", and the **edits/1k curve** ticks down. Open another piece using
   the same word — already neutral.
6. Open *"The U.S.–China relationship"* → the **billón trap** is caught in red
   ($414.7 billion mis-rendered as "billones").
7. Hand off to SM → **SM approval** → **Deploy to clients**. **Export** the record.

The headline isn't "it uses Claude and GPT." It's: *reviewer edits fell because the
system learned the team's neutralization decisions, with a governed, auditable
hand-off at every step.*

---

## Quick start

```bash
npm install
npm run dev          # http://localhost:3007
```

Runs with **zero configuration** — no API keys, local JSON storage, seeded
glossary + rules + disclaimers + 3 demo documents.

### Enable real translation (recommended for the demo)

Copy `.env.example` → `.env.local` and set keys; the app picks them up:

```
ANTHROPIC_API_KEY=...   # translator (Claude). Without it → fixtures.
OPENAI_API_KEY=...      # critic (a different model family, per spec §6). Without it → deterministic critic.
```

Models/prompts are config, not code — edit `config/models.yml`. QE is a routing
signal only; validators + humans are authoritative.

---

## Deploy (GitHub → Railway → Postgres)

GitOps: push to `main` and Railway auto-deploys (`railway.json` pins build/start).

1. **GitHub:** push the repo (already at `CuriosityAIAgent/bilingual-review-studio`).
2. **Railway:** New Project → Deploy from GitHub repo → branch `main`. Nixpacks
   builds it; the QE model is pre-cached at build. Pick an instance with **≥ 1 GB
   RAM** (the QE model needs it; no GPU).
3. **Access gate (set before sharing):** `ACCESS_CODE=<passphrase>`. Every page and
   API route is then locked behind `/gate` — no LLM call can fire un-gated.
4. **API keys:** `ANTHROPIC_API_KEY` (translator), `OPENAI_API_KEY` (GPT-5 critic).
5. **Storage — pick one (durable, shared):**
   - **Railway Postgres (recommended):** add the Postgres plugin, then on the app
     service set `STORAGE=postgres` and `DATABASE_URL=${{Postgres.DATABASE_URL}}`.
     The app self-migrates (creates its tables on boot) and auto-seeds memory — no
     manual SQL, no service-role key.
   - **Supabase:** run `supabase/schema.sql`, set `STORAGE=supabase`,
     `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Use when you want Supabase's
     auth/RLS/managed backups later.
   - **Local file store (default):** zero setup, but resets on redeploy.

Share the gated URL + the access code. People use the **seat switcher** (top-right)
to play Investment Strategist / Marketing / Supervisory Management and exercise the
full governed workflow. (Production swaps the mock seat for SSO; the RBAC stays.)

---

## Honest scope (what v1 does NOT do)

- **Layout fidelity:** v1 produces a bilingual review record and a clean *reflowed*
  document — not a pixel-faithful recreation of the original PDF. Layout + chart
  translation are later phases.
- **PDF/OCR:** Phase 3. Clean text-layer PDFs work after `npm i pdf-parse`;
  scanned-PDF OCR is deferred.
- **Auth:** the seat switcher is a **mock** for the demo (identity travels in the
  `x-brs-seat` header). Production must replace it with OIDC/SAML + server-verified
  sessions; the RBAC decision logic (`src/auth`) stays the same.
- **QE:** a real open-weight model runs **in-container** by default (no external
  service, no GPU); a heuristic is only the offline fallback. A CometKiwi/xCOMET
  sidecar can drop in via `QE_SERVICE_URL`. QE is a routing signal only, never an
  approval signal.

See `docs/decisions/` (ADRs) and `CLAUDE.md` for the full contract.
