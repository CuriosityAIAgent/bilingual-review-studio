# Bilingual Review Studio

A **governed neutral-Spanish financial review workflow**. Not an AI translator — a
review system that turns reviewer corrections (especially *regionalism
neutralization*) into **reusable, auditable institutional memory**. The machine
drafts; humans correct; every correction is logged, governed, and replayed on the
next document. The asset is the memory and the audit trail.

Built to the spec in `docs/` (Phases 0–3). Next.js 16 · React 19 · TypeScript ·
Tailwind v4 · Supabase-or-file storage.

---

## What actually works (verified end-to-end)

The full loop runs through the real API with real role separation (see
`npm test` + the e2e checks):

- **Upload** `.txt` / `.docx` (PDF is Phase 3, optional) → segmented document model.
- **Translate** to neutral es-419 (Claude when a key is set; deterministic
  fixtures otherwise so the demo always runs).
- **Cross-model critique** (a decorrelated model family) + a **gated refine loop**
  that fixes only objectively-failing segments and reverts on no gain.
- **10 deterministic validators** — number integrity incl. the **billón trap**
  (English *billion* = 10⁹ = "mil millones", never "billón"), currency, date,
  ticker, ISIN check-digit, DNT, glossary, regionalism, disclaimer, English leakage.
- **The learning flywheel:** flag a regionalism → propose a neutralization rule →
  approver activates it → re-translate auto-neutralizes it everywhere → the
  "edits per 1,000 words" curve falls. Governed lifecycle: only **active/approved**
  rules are ever applied.
- **RBAC + multi-team handoff** (Author → Reviewer → Approver), append-only
  `edit_log` / `handoff_log`, exact-match disclaimers auto-locked from approved TM,
  optimistic-concurrency stale-write protection (no last-write-wins).
- **Export** a bilingual review record (and a reflowed target-only doc).

`npm test` → 76 unit/integration tests + a 31-case finance eval harness.

---

## The 90-second demo (what to show senior management)

1. Open the app, seat = **Ana Reyes (Author)**. Click a bundled sample
   (*Global Markets Outlook*). It translates and opens in the review workspace.
2. One segment is flagged: a Peninsular word (**"ordenador"**) the validator
   wants neutralized. A disclaimer at the end is **auto-locked** (sage tag) —
   it came from approved memory, untouched.
3. Click **Teach rule** on the flag → propose `ordenador → computadora`.
4. Switch seat to **Carmen Ortiz (Approver)** → the Governance queue shows the
   proposed rule → **Approve**. (Try approving as the Reviewer first — it's blocked.)
5. Click **Re-translate with learnings**. The segment auto-neutralizes to
   "computadora". Upload another document that uses the same word — it's already
   neutral. The **edits/1k curve** in the right panel ticks down.
6. Open the *Fixed Income* sample → the **billón trap** is caught in red.
7. **Export** the bilingual review record.

The headline isn't "it uses Claude and GPT." It's: *reviewer edits fell because the
system learned the team's neutralization decisions.*

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

## Deploy (GitHub → Railway → Supabase)

1. **GitHub:** create a repo and push.
   ```bash
   gh repo create bilingual-review-studio --private --source=. --remote=origin --push
   ```
2. **Railway:** New Project → Deploy from GitHub repo. Nixpacks auto-detects
   `npm run build` / `npm start` (start binds `$PORT`). Set env vars:
   `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` (optional), and storage (below).
3. **Storage — pick one:**
   - **Supabase (recommended, shared across users & redeploys):** run
     `supabase/schema.sql` in the Supabase SQL editor, then set
     `STORAGE=supabase`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
   - **Railway volume (quickest):** attach a volume, set `DATA_DIR=/data`. Memory
     persists across redeploys and is shared by everyone hitting that instance.

Share the Railway URL. People use the **seat switcher** (top-right) to play
Author / Reviewer / Approver and exercise the full governed workflow.

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
- **QE:** a heuristic stub here; production runs an open-weight QE model on bank
  infrastructure. It is a routing signal only, never an approval signal.

See `docs/decisions/` (ADRs) and `CLAUDE.md` for the full contract.
