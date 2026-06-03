---
name: PR discipline + workspace conventions
description: Founder's mandatory 7-step PR process + workspace conventions. Cross-project policy that originated in the living-intelligence project (after its May-7 2026 outage) and applies to Bilingual Review Studio from day one.
type: feedback
---

> **Cross-project founder policy.** These rules originated in the
> **living-intelligence** project and apply to every project the founder runs,
> including Bilingual Review Studio. The canonical copy lives in
> living-intelligence (`docs/claude-memory/feedback_pr_discipline.md`); this is
> the BRS-adapted copy. **Note:** the May-7 2026 outage referenced below
> happened in *living-intelligence*, not in BRS — it's the origin of the policy,
> not this project's history. BRS began in June 2026.

# PR discipline + workspace conventions

**Why the policy exists (origin — living-intelligence):** On 2026-05-07 the agent tried to fix a data-path bug without running `/plan-eng-review` first — pushed a `railway.toml` change, Railway deployed the wrong app, and the Studio went down ~1 hour, recoverable only by rollback. Founder's response (verbatim): *"All I want to say is we need to do this properly, and we need to do this by creating a proper PR... Why are we not being disciplined about going through the different PRs?"* The 7-step process is the result.

**Why it matters for Bilingual Review Studio:** BRS has had no outage, but it has already hit the same *class* of problem this policy guards against — a live-translator error silently fell back to a word-by-word fixture, emitting code-switched garbage, and a tester unknowingly saved three duplicate "glitched" drafts. Fixed via ADR 0013 (fail loud, never silent fixture). Discipline is how we catch that class of issue *before* it ships.

## Rules

### 1. Every non-trivial PR follows the 7-step process

```
1. PLAN          → /plan-eng-review (or shorter format for trivial)
2. CODE          → one focused commit per logical change
3. SELF-REVIEW   → /codex review on the cumulative diff
4. TEST          → unit + smoke + integration
5. SHIP          → /ship (atomic: tests + diff + version + push + PR)
6. LAND          → /land-and-deploy (wait CI + canary verify)
7. DOCUMENT      → /document-release (update memory + roadmap)
```

**No more "I'll just push this quick fix."**

**How to apply:** for any work touching deploy config, auth, schema, or production runtime — Step 1 is MANDATORY. Trivial doc-only changes can use a lighter "plan-in-the-commit-message" approach. Code changes always get codex review (step 3).

### 2. One workspace per branch — never `git checkout` between branches in the same Conductor workspace

**Why:** stale build artifacts (`.next` cache) and wrong/mismatched `node_modules` across branches caused real bugs in living-intelligence (a multi-app monorepo: portal vs intake-server).

**How to apply:** when starting work on a different branch, ASK the founder to open a new Conductor workspace pointing at that branch — the agent cannot open Conductor workspaces from inside a session (UI action). **BRS caveat:** BRS is a single Next.js app with one dependency tree, so the stale-artifact risk is much lower here; the founder has approved short-lived feature branches *within* this workspace for small PRs. Reserve separate workspaces for large parallel efforts.

### 3. "It was working" is real evidence — respect the founder's instinct on scope

**Why:** the agent has over-engineered fixes off an audit finding when the thing wasn't actually blocking anything.

**How to apply:** when the founder questions whether a fix is necessary, treat it as a real Bayesian update. Ask "what's the cost of leaving this broken?" before proposing more work. Audit findings are a starting point for prioritisation, not a mandate.

### 4. Deploy changes need an explicit rollback plan in the commit message

**Why:** the May-7 push had no documented rollback plan, so recovery was "figure out which Railway setting to revert" under pressure.

**How to apply:** any commit that changes Railway config, env vars, schema migrations, or auth must include a "Rollback:" section with concrete steps. If a rollback isn't possible (e.g., a destructive migration), say so explicitly.

### 5. /codex review on every implementation PR — not optional

**Why:** Codex repeatedly catches real bugs the agent misses (e.g., on BRS PR #1 it caught a keyboard-nav bug and a permission-flash bug). Each round was right.

**How to apply:** after pushing the feature branch but before merging, run `/codex review` on the cumulative diff. Address all P0/P1 findings; P2/P3 either addressed or explicitly noted in the PR description.

### 6. Agent/routine prompts must start with the operative directive

**Why:** given an ambiguous prompt, an agent can drift into "let me help you set this up" mode instead of executing.

**How to apply:** a routine/agent prompt MUST start with the operative directive ("You ARE X. Do Y.") and contain no meta-commentary about how to use the prompt. Documentation about a prompt belongs in a separate file.

## What this looks like in practice (BRS example)

**The QE-scoring fix** (QE rated a garbled, half-English draft 1.0, because the cross-lingual embedding model scores a copy-of-the-source as a near-perfect match):

1. **Plan:** `/plan-eng-review` — it touches production scoring runtime, so Step 1 is mandatory. Lock the approach (combine the embedding adequacy score with a "did it actually translate to Spanish" signal so a copy-of-source can't score high). Note the rollback.
2. **Code:** one focused commit.
3. **Review:** `/codex review` the diff; address findings.
4. **Test:** add a QE regression test (copy-of-source / heavy English-leak must score low) + run the existing suite.
5. **Ship:** `/ship` to push + open PR; CI runs `tsc + vitest + next build`.
6. **Land:** `/land-and-deploy` — merge, wait for CI, verify the deployed Railway container is healthy.
7. **Document:** `/document-release` — note the QE change + update memory.

**Infrastructure note (2026-06-03):** CI runs on every PR (`.github/workflows/ci.yml`). A *hard* merge gate (branch protection / rulesets) requires GitHub Pro on a private repo, so enforcement is currently CI-signal + discipline: never merge a red PR.

## Companion files (in the living-intelligence project)

- `feedback_session_flow.md` — the broader "how to work with this founder" memory
- `feedback_working_style.md` — communication preferences
- `MEMORY.md` — session-by-session log including the 2026-05-07 outage
