# Email — Translation Studio (for CEO + Head of Investment)

> Draft to send. Plain-English first; a technical appendix follows for anyone who wants the detail.

---

**Subject: Translation Studio: a governed AI translation workflow that learns from our team**

Hi [CEO], [Head of Investment],

Following up on what I shared earlier: we've built it, and it's running live. **Translation Studio** turns our English research into neutral Latin-American Spanish, with a human review step and an audit trail a private bank can stand behind. Worth two minutes, because the idea goes well beyond Spanish.

## What it really is

Most AI translation hands you a draft and stops there. This keeps a person in charge and remembers what they fix. Every correction (a preferred term, a regionalism we want to avoid) becomes a governed rule and gets reused on the next document. What we're really building isn't the translation. It's the memory and the audit trail behind it.

## Why we built it this way

Three principles drove every decision:

1. **A human is always in control.** The AI never has the final say on wording. Deterministic checks and a human sign-off do. The AI's confidence score is used only to decide *where to focus effort*, never to approve anything.
2. **Two different AIs, not one.** A model can't reliably catch its own mistakes, so a *different* AI independently reviews the first one's work. That cross-checking is the quality engine.
3. **It compounds.** Corrections aren't one-offs. They become governed rules that improve every future translation, so the more we use it, the less editing it needs.

## How the workflow runs

You paste English (a research note, a memo, an email) and hit **Translate**. On screen you watch it move through the pipeline:

**Translate → Checks → Governance → Refine → (then the human short-process) → Marketing review → Supervisory Management approval → Deploy to clients**

- The first four steps are automated and happen in seconds.
- The last three are our people, each holding the document in turn and handing it down the chain (Investment Strategist → Marketing → Supervisory Management). It mirrors how the desk already works.

Along the way, every reused glossary term or learned rule is highlighted, every number is checked, and a side panel shows the "learning curve": edits per thousand words falling as the system absorbs our preferences.

## How the memory is invoked (the flywheel)

This is the part that makes it improve with use. Our team's approved terms, phrasings and "avoid this regionalism" rules aren't a clean-up at the end. They're **loaded first and drive the whole process**:

1. **Loaded up front.** Before anything is translated, the approved glossary, the active neutralization rules, and prior translations are loaded.
2. **They prime the first draft.** Those rules and terms go straight into the translator's instructions, so the very first draft already uses our preferred wording, not a generic draft we fix later.
3. **They're enforced the whole way through.** Re-applied as hard constraints on every rewrite, and the checks flag any segment that drifts from them.
4. **Corrections feed back in.** When a reviewer fixes something, that correction can be captured as a new governed rule, approved, and then **applied automatically to every future document**. The more we use it, the less editing it needs.

There's also a separate **Train** page. Paste in a document we've already translated (English on the left, the finished Spanish on the right) and it captures those pairings straight into the memory. So we can seed it from work the team has already done, not only from corrections made inside the tool.

## The cross-model cycle, step by step

When a segment isn't confident enough, this five-step cycle runs. It's the heart of the quality engine.

### 1. Draft (Sonnet writes)
Claude Sonnet 4.6 produces the first Spanish, already primed with our glossary and rules.

### 2. Score + critique (QE scores, GPT-5 critiques)
Our **Quality-Estimation (QE) model**, a small model running on our own server, scores the segment 0–1 to decide whether it needs work. QE is a routing signal only: it decides where to spend effort, it never approves wording. At the same time, **GPT-5, a different AI, independently reviews the segment** and returns the exact problems (not a vague "improve it").

### 3. Refine (Sonnet rewrites using GPT-5's notes)
Sonnet rewrites the spans GPT-5 flagged, and is told to leave the good text alone, with our learned rules re-applied as hard constraints.

### 4. Re-score + re-critique (QE re-scores, GPT-5 critiques again)
The rewrite is scored again by QE and **GPT-5 reviews it again**, to confirm the fix landed and introduced nothing new.

### 5. Keep the best
The rewrite is kept **only if it removes a serious (major or critical) problem, or scores higher without adding one**. Otherwise we revert to the previous version. The cycle repeats until the segment is clean (with a hard cap), and good text is left alone.

In short: **Sonnet writes → QE scores + GPT-5 critiques → Sonnet refines using GPT-5's notes → QE re-scores + GPT-5 critiques again → keep the best.** That QE-routed, cross-model back-and-forth is exactly what drives the quality up.

## What's deterministic vs. what's AI (this matters for trust)

- **AI (judgment):** the first-draft translation, the independent review, and the routing score.
- **Deterministic (rules, no AI):** number/currency checks (English "billion" must never become Spanish "billón"), glossary and regionalism enforcement, the governed rules, the rule that the AI can never approve, and a full **edit and hand-off log** where every change is appended as an event, not overwritten. The final Spanish is gated by these checks and a human, never by an AI's say-so.

## Where this goes if it works

If it proves out in Spanish, the same workflow carries over to other languages (new configuration and word lists, same engine), to other content like client letters and disclosures, and to a setup where people log in with their own roles and formally hand documents between each other (Author → Marketing → Compliance) with full audit. That last one is the natural next phase.

We built it configurable from day one, so expanding is mostly a settings change, not a rebuild.

It's deployed, access-controlled, and ready for you to try. Happy to walk you through it in ten minutes whenever suits. Paste any English in and watch it run.

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

Model choice and settings are **configuration, not code** — we can change the model or tune it by editing one file, no rebuild. (Switching provider *families*, say to a different translator vendor, is a code change today.)

**Key decisions and why:**
- **Decorrelated critic.** A model critiquing its own output misses its own errors; a different family catches them. This is the single biggest quality lever.
- **QE is routing-only, never approval.** Confidence scores are not quality guarantees. Deterministic validators + humans are authoritative.
- **Refine only weak segments, and revert on no gain.** On English→Spanish the first draft is often already good; *forcing* rewrites degrades good text. So we refine selectively and discard any rewrite that isn't measurably better.
- **Memory feeds forward, not just back.** Learned terms go into the translator's prompt *and* are enforced by validators throughout — so the flywheel improves the first draft, not only the final cleanup.
- **Human-in-the-loop, role-based handoff.** Auditable, compliance-aligned, and it mirrors the desk's existing process.
- **Append-only audit.** Corrections are recorded as events, never edits — nothing is silently overwritten.

**What's left for production scale (Phase 2):** real SSO so each person logs in with their own identity and role (the role logic already exists), and the per-language/per-content-type rollout described above.
