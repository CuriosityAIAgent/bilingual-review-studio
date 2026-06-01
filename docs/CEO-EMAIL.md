# Email — Translation Studio (for CEO + Head of Investment)

> Draft to send. Plain-English first; a technical appendix follows for anyone who wants the detail.

---

**Subject: Translation Studio — a governed AI translation workflow that learns from our team**

Hi [CEO], [Head of Investment],

I want to share something we've built and have running live: **Translation Studio** — a system that turns our English investment research into polished, neutral Latin-American Spanish, with a human review process and an audit trail a private bank can stand behind.

It's worth two minutes because the idea generalises well beyond Spanish.

## The one-line version

It is **not** "an AI translator." It's a **governed review workflow that gets smarter every time our team uses it.** A machine produces a first draft; our people review and correct it; and every correction — the right term, the preferred phrasing, the regionalism we want to avoid — is captured as **reusable, auditable institutional memory** and automatically applied to the next document. The asset we're building isn't the raw translation; it's the *memory and the audit trail.*

## Why we built it this way

Three principles drove every decision:

1. **A human is always in control.** The AI never has the final say on wording. Deterministic checks and a human sign-off do. The AI's confidence score is used only to decide *where to focus effort*, never to approve anything.
2. **Two different AIs, not one.** A model can't reliably catch its own mistakes, so a *different* AI independently reviews the first one's work. That cross-checking is the quality engine.
3. **It compounds.** Corrections aren't one-offs — they become governed rules that improve every future translation. The more we use it, the less editing it needs.

## How the workflow runs (the part to picture)

You paste English text — a research note, a memo, even an email — and hit **Translate**. On screen you literally watch it move through the pipeline:

**Translate → Checks → Governance → Refine → (then the human short-process) → Marketing review → Supervisory Management approval → Deploy to clients**

- The first four steps are automated and happen in seconds.
- The last three are our people, each holding the document in turn and handing it down the chain — Investment Strategist → Marketing → Supervisory Management — exactly mirroring how the desk already works.

Along the way, every reused glossary term or learned rule is highlighted, every number is checked, and a side panel shows the "learning curve" — edits per thousand words falling over time as the system absorbs our preferences.

## How the memory is invoked (the flywheel)

This is the part that makes it improve with use. Our team's approved terms, phrasings and "avoid this regionalism" rules aren't applied as a clean-up at the end — they are **loaded first and drive the whole process**:

1. **Loaded up front.** Before anything is translated, the approved glossary, the active neutralization rules, and prior translations are loaded.
2. **They prime the first draft.** Those rules and terms are fed straight into the translator's instructions, so the very first draft already uses our preferred wording — not a generic draft we fix later.
3. **They're enforced the whole way through.** They're re-applied as hard constraints on every rewrite, and the checks flag any segment that drifts from them.
4. **Corrections feed back in.** When a reviewer fixes something, that correction can be captured as a new governed rule, approved, and then **automatically applied to every future document.** The more we use it, the less editing it needs.

## The cross-model cycle, step by step

When a segment isn't confident enough, this five-step cycle runs — the heart of the quality engine:

### 1. Draft — *Sonnet writes*
Claude Sonnet 4.6 produces the first Spanish, already primed with our glossary and rules.

### 2. Score + critique — *QE scores, GPT-5 critiques*
Our **Quality-Estimation (QE) model** — a small model running on our own server — scores the segment 0–1 to decide whether it needs work. (QE is a *routing* signal only — it decides where to spend effort, it never approves wording.) At the same time, **GPT-5 — a different AI — independently reviews the segment** and returns the exact problems (not a vague "improve it").

### 3. Refine — *Sonnet rewrites using GPT-5's notes*
Sonnet rewrites **only the spans GPT-5 flagged**, with our learned rules re-applied as hard constraints.

### 4. Re-score + re-critique — *QE re-scores, GPT-5 critiques again*
The rewrite is scored again by QE and **GPT-5 reviews it again**, to confirm the fix actually landed and introduced nothing new.

### 5. Keep the best
The rewrite is kept **only if QE and the critic agree it's measurably better**; otherwise we revert to the previous version. The cycle repeats until the segment is clean (with a hard cap), and good text is left untouched.

In short: **Sonnet writes → QE scores + GPT-5 critiques → Sonnet refines using GPT-5's notes → QE re-scores + GPT-5 critiques again → keep the best.** That QE-routed, cross-model back-and-forth is exactly what drives the quality up.

## What's deterministic vs. what's AI (this matters for trust)

- **AI (judgment):** the first-draft translation, the independent review, and the routing score.
- **Deterministic (rules — no AI):** number/currency checks (e.g. English "billion" must never become Spanish "billón"), glossary and regionalism enforcement, the governed rules, the rule that the AI can never approve, and an **append-only audit log** of who changed what. The final Spanish is gated by these checks plus a human — never by an AI's say-so.

## Where this goes if it works

This is the real point. If the framework proves out in Spanish, the **same workflow** applies to:
- **Other languages** — swap the configuration, keep the engine.
- **Other content types** — client letters, disclosures, marketing.
- **Real multi-user roles** — people logging in with their own roles, formally handing documents between each other (Author → Marketing → Compliance) with full audit, which is the natural next phase.

We've built it to be configurable from day one, so expanding is changing settings, not rebuilding.

It's deployed, access-controlled, and ready for you to try. Happy to give you a 10-minute walkthrough whenever suits — paste any English in and watch it work.

Best,
[Your name]

---
---

## Technical appendix (for those who want the detail)

**Stack.** A single Next.js application (one service on Railway, GitOps — every push auto-deploys). Postgres for durable, shared memory. Access-gated for the private preview.

**The pipeline**, per segment (paragraph): `ingest → prepare → translate → evaluate → refine → validate → gate → review → export`.

**The components ("agents") we built:**
| Component | What it does | Deterministic? |
|---|---|---|
| **Translator** | First Spanish draft. Its prompt is primed with the approved glossary + active rules, so the draft is right the first time. | No (LLM) |
| **Critic** | Independently reviews the draft and returns *structured* error spans (not "make it better"). | No (LLM, different family) |
| **Quality Estimation (QE)** | Scores each segment 0–1 to route effort. Never approves. | No (small model, self-hosted) |
| **Validators** | Numbers/currency (the "billón" trap), dates, glossary adherence, regionalism, do-not-translate tokens. | **Yes** |
| **Governed memory** | Translation memory, approved glossary, neutralization rules — with a lifecycle (proposed → approved → active). | **Yes** |
| **The gated cross-model loop** | If a segment scores low or has a major flag: the critic flags it → the translator rewrites only those spans → re-score + re-critique → **keep only if objectively better, else revert.** Hard iteration cap. | Mixed |
| **The "Train" flow** | Paste a finished English+Spanish pair; it aligns them and folds the wording into memory. | Yes |

**The LLMs called:**
- **Translator:** Claude Sonnet 4.6 — chosen for register/tone consistency over long financial prose. Also performs the targeted rewrites.
- **Critic:** GPT-5 — deliberately a *different model family* from the translator (decorrelation), so it doesn't share the translator's blind spots.
- **QE:** a small open-weight model running *inside our own container* — no external service, no GPU, no per-call cost. (Routing signal only.)

All three are **configuration, not code** — we can swap providers/models by editing one file, no rebuild.

**Key decisions and why:**
- **Decorrelated critic.** A model critiquing its own output misses its own errors; a different family catches them. This is the single biggest quality lever.
- **QE is routing-only, never approval.** Confidence scores are not quality guarantees. Deterministic validators + humans are authoritative.
- **Refine only weak segments, and revert on no gain.** On English→Spanish the first draft is often already good; *forcing* rewrites degrades good text. So we refine selectively and discard any rewrite that isn't measurably better.
- **Memory feeds forward, not just back.** Learned terms go into the translator's prompt *and* are enforced by validators throughout — so the flywheel improves the first draft, not only the final cleanup.
- **Human-in-the-loop, role-based handoff.** Auditable, compliance-aligned, and it mirrors the desk's existing process.
- **Append-only audit.** Corrections are recorded as events, never edits — nothing is silently overwritten.

**What's left for production scale (Phase 2):** real SSO so each person logs in with their own identity and role (the role logic already exists), and the per-language/per-content-type rollout described above.
