# Translation Studio — End-to-End Deployment Guide

For: engineering + senior management. Scope: take Translation Studio from the
repo to a live, multi-user, persistent deployment. The app is a **single
Next.js application** — there is no separate backend service.

Three things to stand up, in order: **(1) Railway** (hosting), **(2) APIs**
(translation engine), **(3) Supabase** (shared, persistent memory). The app
runs end-to-end with *none* of them configured (it falls back to deterministic
fixtures + a local file store), so you can deploy in stages and harden as you go.

---

## 0. What the app is (one paragraph for management)

Translation Studio is a **governed neutral-Spanish review workflow**. A machine
produces a first-draft translation; humans (Investment Strategy → Marketing →
Supervisory Management) review and neutralize it; **every correction is captured
as reusable, auditable institutional memory** (glossary terms, neutralization
rules, translation memory) and replayed on future documents. The asset is the
memory and the audit trail. A real, open-weight quality-estimation model runs
inside the container to route attention — it is never an approval signal; the
deterministic validators and humans decide.

---

## 1. Railway (hosting)

**One service.** Connect the GitHub repo `CuriosityAIAgent/bilingual-review-studio`;
Railway's Nixpacks auto-detects Next.js.

| Setting | Value |
|---|---|
| Build command | `npm run build` (runs `next build`, then pre-caches the QE model into `.models/`) |
| Start command | `npm run start` (`next start -p ${PORT}`) |
| Node version | 20.x (repo pins via `.node-version`) |
| Port | Railway injects `PORT`; the start script already reads it |
| **Instance size** | **≥ 1 GB RAM.** The in-container QE model (`@huggingface/transformers`, ONNX/CPU) needs ~1 GB. A 0.5 GB instance will OOM on first inference. No GPU required. |
| Persistent disk | Optional. Only needed if you stay on the **file** store (see §3). With Supabase you don't need a Railway volume. |

**Deploy stages:**
1. **Stage 1 — demo (zero config):** deploy as-is. No env vars. Translation uses
   fixtures, storage is in-container file store. Fully clickable for a
   management walkthrough. (Note: file store is **ephemeral** on redeploy unless
   you attach a Railway volume.)
2. **Stage 2 — live engine:** add the API keys in §2.
3. **Stage 3 — shared + durable:** add Supabase in §3.

After connecting, set the env vars from §2/§3 in Railway → Variables, then
redeploy.

---

## 2. APIs (the translation engine)

The app reads **all** model/provider choices from `config/models.yml` — never
hardcoded. If a provider key is absent, that stage cleanly falls back to a
fixture/heuristic, so partial configuration is safe.

| Stage | Provider | Env var | Used for | If absent |
|---|---|---|---|---|
| **Translator** | Anthropic | `ANTHROPIC_API_KEY` | First-draft EN→neutral-ES (`claude-sonnet-4-6`) | Deterministic fixtures |
| **Critic** | OpenAI | `OPENAI_API_KEY` | Decorrelated quality critique (`gpt-4o`) — a *different* model family so it doesn't share the translator's blind spots | Validator-derived deterministic critic |
| **Quality Estimation (QE)** | **none — local, in-container** | *(none)* | Routing-only confidence score per segment | Heuristic |

**Notes for management:**
- **Only the Anthropic key is needed for live translation.** OpenAI is
  recommended (the two-model "decorrelation" is a quality guarantee in the
  design) but optional.
- **The QE model is self-hosted in the container** — no external AI service, no
  GPU, no per-call cost. It is pre-downloaded at build time (`scripts/warm-qe.mjs`).
- **Optional SOTA upgrade:** a CometKiwi/xCOMET QE model can be deployed as a
  Python sidecar later; set `QE_SERVICE_URL`. Not required for launch.
- **Cost:** scales with documents translated (Anthropic + optional OpenAI
  per-token). The QE model and the whole review/memory workflow are free to run.

To change models without code changes, edit `config/models.yml` (provider, model
id, temperature, prompt version) and redeploy.

---

## 3. Supabase (shared, persistent memory)

By default the app uses a **local file store** — fine for a demo, but it is
per-container and resets on redeploy. For a real deployment where the whole team
shares one governed memory and nothing is lost on deploy, switch to Supabase.

**Steps:**
1. Create a Supabase project (any region near your users).
2. Open the SQL editor and run **`supabase/schema.sql`** from the repo. It
   creates:
   - `brs_documents` — every document (the full review record as JSONB).
   - `brs_memory` — the shared flywheel: glossary, neutralization rules,
     translation memory.
   - Plus production-hardening audit tables (`edit_log`, `handoff_log`,
     `neutralization_rules`, `glossary`, `tm`) that encode the **append-only**
     contract (UPDATE/DELETE revoked — corrections are compensating events).
3. In Railway → Variables, set:

| Env var | Where to find it |
|---|---|
| `STORAGE` | set to `supabase` |
| `SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → API → service_role key (server-side only — never ship to the browser) |

4. Redeploy. The app now reads/writes Postgres; memory persists across deploys
   and is shared across all users.

> The `NEXT_PUBLIC_SUPABASE_*` vars in `.env.example` are reserved for a future
> browser-side auth integration; the current store uses the service-role key
> server-side only.

---

## 4. Authentication (current state + path to production)

- **Today:** mock seat switcher (`NEXT_PUBLIC_AUTH_MODE=mock`) — pick a role to
  enter. Identity is **role-based** (Investment Strategist / Marketing /
  Supervisory Management / Admin / Viewer); RBAC is enforced server-side via
  `config/permissions.yml`.
- **Production:** replace the mock seat with the bank's OIDC/SAML SSO and map
  identities to the existing roles. The authorization logic (`src/auth`,
  `permissions.yml`) does not change — only how the seat is resolved. This is the
  one integration to schedule with IT/security before a real rollout.

---

## 5. End-to-end checklist (for the rollout ticket)

- [ ] **Railway:** repo connected, build/start commands set, instance ≥ 1 GB RAM, first deploy green.
- [ ] **Smoke test (Stage 1):** open the URL, pick a role, open a JPM sample, see the bilingual review record + process stepper.
- [ ] **API (Stage 2):** set `ANTHROPIC_API_KEY` (and optionally `OPENAI_API_KEY`); re-translate a doc and confirm live (non-fixture) output.
- [ ] **Supabase (Stage 3):** project created, `schema.sql` applied, `STORAGE=supabase` + `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` set, memory persists across a redeploy.
- [ ] **Learn flow:** paste a finished EN/ES pair at `/learn`, confirm segments land in translation memory and are reused on the next document.
- [ ] **Auth (pre-GA):** schedule SSO/RBAC integration with IT/security.

---

## 6. What management is getting (summary)

| Concern | Answer |
|---|---|
| Hosting | One Railway service, Node/Next.js, ≥1 GB RAM, no GPU. |
| External AI cost | Anthropic (required) + OpenAI (optional), per-token on documents translated. QE + review workflow are free (self-hosted). |
| Data persistence | Supabase Postgres; shared team memory + full audit trail; survives redeploys. |
| Data governance | Append-only edit/handoff logs; only approved glossary/rules are applied; QE never approves — humans do. |
| Security to schedule | SSO/RBAC (OIDC/SAML) before general availability. |
| Can we demo now? | Yes — deploys and runs end-to-end with zero config (fixtures + file store). |
