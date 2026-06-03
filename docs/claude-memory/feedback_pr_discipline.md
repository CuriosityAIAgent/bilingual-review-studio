---
name: PR discipline + workspace conventions (2026-05-08)
description: Founder-stated workflow rules after the May-7 Studio outage caused by skipping plan-eng-review on a deploy change. Every PR follows the 7-step process; one workspace per branch.
type: feedback
---

> Imported into Bilingual Review Studio from the living-intelligence project
> (`docs/claude-memory/feedback_pr_discipline.md`) on 2026-06-03 — this is
> founder policy that applies across all projects, including this one.

# PR discipline + workspace conventions

**Why:** On 2026-05-07 the agent attempted to fix the data path bug (D1) without running /plan-eng-review first. Pushed a railway.toml change + told user to clear Railway Root Directory. Railway then deployed the wrong app (portal Next.js instead of intake-server). proud-reflection went down for ~1 hour. The fix-forward attempt also failed because root railway.toml locks the Custom Start Command field in the Railway UI. Studio recovered only via rollback to Root Directory = intake-server.

Founder's response (verbatim): *"All I want to say is we need to do this properly, and we need to do this by creating a proper PR... How can this come into our book of work? Why are we not being disciplined about going through the different PRs?"*

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

**Why:** stale build artifacts (`.next` cache), wrong `node_modules` for the branch, dependency mismatches across portal vs intake-server. Caused real bugs during the security hot-fix sprint.

**How to apply:** when starting work on a different branch, ASK the founder to open a new Conductor workspace pointing at that branch. Don't switch in-place. The agent cannot open Conductor workspaces from inside a session — that's a UI action.

### 3. "It was working" is real evidence — respect founder's instinct on scope

**Why:** During the D1 investigation, the agent over-engineered the fix because the codex audit had flagged the underlying issue. The founder pushed back: *"I'm not able to 100% understand why we are doing all this when it was working fine earlier."* The agent should have heard that signal. The pipeline was producing 1-2 briefs/day from Layer 1 alone — Layer 2 being silently dead was not blocking revenue.

**How to apply:** when the founder questions whether a fix is necessary, treat it as a real Bayesian update. Ask "what's the cost of leaving this broken?" before proposing more work. Audit findings are a starting point for prioritisation, not a mandate.

### 4. Deploy changes need an explicit rollback plan in the commit message

**Why:** the May-7 push had no documented rollback plan. When Studio went down, recovery was "try to figure out which Railway setting to revert" rather than "follow these steps to undo." Cost: ~1 hour of stress + Studio downtime.

**How to apply:** any commit that changes Railway config, env vars, schema migrations, or auth must have a "Rollback:" section in the commit message with concrete steps. If a rollback isn't possible (e.g., destructive migration), the commit message must say so explicitly.

### 5. /codex review on every implementation PR — not optional

**Why:** Codex caught real bugs in PR1, PR1.5, PR2, PR3 that the agent missed. Multiple rounds in some cases. Each round was right.

**How to apply:** after pushing the feature branch but before merging, run `/codex review` on the cumulative diff. Address all P0/P1 findings. P2/P3 findings either addressed or explicitly noted in the PR description.

### 6. The agent's "subagent" output isn't useful in a routine context

**Why:** The Trigger 2 prompt-meta-bug surfaced that Claude Code routines, when given an ambiguous prompt, can drift into "let me help you set up this thing" mode instead of executing. The fix was tightening the prompt, not the routine config.

**How to apply:** when designing prompts for Claude Code routines (or any agent that takes a prompt and acts), the prompt MUST start with the operative directive ("You ARE X. Do Y.") and contain NO meta-commentary about how to use the prompt. Documentation about a prompt belongs in a separate file, not the prompt itself.

## What this looks like in practice

**Example: today's "data path bug" if I'd done it right:**

1. **Plan:** Open /plan-eng-review for D1. List Railway constraints (Root Directory locking, root railway.toml authority, /data volume + STATE_DIR setup, publisher.js clone-and-push). Sketch 3 options. Identify rollback cost for each. Founder picks one.
2. **Code:** Implement the chosen option in one commit with clear rollback steps in commit message.
3. **Review:** /codex review the diff. Address findings.
4. **Test:** Smoke test against staging if possible; if not, document the test plan.
5. **Ship:** /ship to push + open PR.
6. **Land:** /land-and-deploy after merge — watch deploy, verify health endpoint, check pipeline-status.json on next run.
7. **Document:** Update synthesis.md with D1 status; update memory with learnings.

**What I actually did:** went straight from "diagnosis" to "push fix" with no plan, no rollback story, no canary check. Result: Studio down.

## Companion files (in the living-intelligence project)

- `feedback_session_flow.md` — the broader "how to work with this founder" memory
- `feedback_working_style.md` — communication preferences
- `MEMORY.md` — session-by-session log including the 2026-05-07 outage
