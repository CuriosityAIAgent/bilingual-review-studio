# Design Handoff — Bilingual Review Studio

A brief for **Claude Design**. Goal: take the working product from "clean editorial" to
**premium, sophisticated, financial-grade** — the feel of a tool a private bank's
investment-strategy desk would be proud to use in front of clients. This document is
self-contained; the live app is the reference implementation to push past.

---

## 1. What the product is

A **governed neutral-Spanish review workflow** for a private bank. An Investment
Strategist's English research (e.g. J.P. Morgan "Top Market Takeaways") is machine-
translated to neutral Latin-American Spanish, then reviewed and approved through a
short, auditable human process. The system **learns** the team's regionalism-
neutralization decisions and replays them, so reviewer edits fall over time.

The hero surface is the **bilingual review workspace**: English left, Spanish right, in a
proper text-editor reading experience, with the **process pipeline shown on top**.

## 2. The operating model (drives the IA)

Three roles, one short process (from the desk's own description):

1. **Investment Strategist** drafts and submits English + translated materials.
2. **Marketing** reviews the translations (neutralizes regional word choice).
3. **Supervisory Management (SM)** approves; substantial edits resubmit for SM approval.
4. Once ready, **deploy to clients**.

The visible pipeline is: **Translate → Checks → Governance → Rewrite → Marketing review →
SM approval → Deploy to clients.** First four are automated (run at ingest); last three
are the human short process. Each step shows state (done / active / pending) + a live
count (segments, validators flagged, rules neutralized, segments refined).

## 3. Screens to design (priority order)

1. **Review workspace (hero).** Sticky header = document title + actions + the process
   stepper. Below: optional left outline rail, the **two-pane document sheet** (English
   source left / editable Spanish target right), and a right "learning" panel (memory,
   governance queue, the edits-per-1k curve). Needs: a genuine *text-editor* feel —
   continuous reading column, refined measure (~66ch), a format toolbar, inline
   validator/critic flags that don't shout, and segment status expressed typographically
   (a colored left "ledger" rule + small tags), never big color fills.
2. **Process stepper.** This is the signature element. Make it feel like a precise
   instrument: the automated pipeline flows into the human short-process across a subtle
   divider; the active step has quiet motion; completed steps carry a count. It must read
   at a glance and stay legible when sticky over a scrolling document.
3. **Upload (front door).** Calm, confident, generous negative space; a dropzone that
   feels like placing a document on a desk; a strip of the 5 bundled JPM samples.
4. **Library / queue.** Documents with status, % approved, edits/1k, owner team.
5. **Export.** The bilingual review record as a finished artifact (print-to-PDF clean).

## 4. Aesthetic direction (keep + elevate)

"An editorial reading room for translation." The document is the hero; chrome recedes
into hairline-ruled "ledger" surfaces. **One accent (brass), reserved for active / learned
/ earned states only.** Two themes share one token system: **Paper** (warm off-white,
default) and **Ink** (deep navy-black). The background is layered atmosphere (two faint
radial gradients + 2–3% grain), never a flat fill.

References to push toward: fine financial print, luxury stationery, serious editorial
typography (think a premium broadsheet's markets section), the restraint of a Bloomberg
terminal but with warmth. Avoid: SaaS-template gradients, neon, heavy drop shadows,
generic dashboard cards, icon-soup.

### Tokens (current — extend, don't replace)
- Type: **Fraunces** (display/headings), **Newsreader** (document body — the hero),
  **Hanken Grotesk** (UI chrome), **IBM Plex Mono** (numbers/tickers/IDs/QE — sacred).
- Color (Paper): bg `#F2EEE4`, surface `#FFFFFF`, ink `#15233B`, line `#E3DCCC`,
  accent (brass) `#9A7A34`/`#C29B47`, edited `#B5751E`, memory (sage) `#4F6B52`,
  flag `#A23B2D`. Ink theme defined in `app/globals.css :root[data-theme="ink"]`.
- Radii 7/11/16/pill; spacing scale 2,4,6,8,12,16,20,28,40,64.

## 5. Principles (non-negotiable, from spec §16.2)

1. The text is the hero; chrome never competes with it.
2. Status is typographic (small tags + a colored left ledger rule), never large color fills.
3. One accent (brass), only for active / learned / earned (focus, the learning loop, approvals).
4. Every state is designed: upload, parsing, empty, error, in-review, approved, deployed.
5. Numbers are sacred — figures, %, dates, ISINs, tickers in mono for at-a-glance integrity.
6. Quiet motion that clarifies (where did this come from, what changed), never performs.
7. WCAG AA; visible brass focus ring; full keyboard flow; respect reduced-motion.

## 6. Specific asks — what to send back

1. A refined **review-workspace** comp (Paper + Ink) showing the sticky header + stepper +
   two-pane sheet + right panel, with the editor feel resolved (toolbar, measure, flag
   treatment, the "memory applied" brass underline moment).
2. A **process-stepper** exploration: 2–3 directions for the signature element (horizontal
   rail vs. segmented progress vs. timeline), with active/done/pending states.
3. **Segment-row** micro-design: the ledger rule, status tags, QE chip, inline flag with a
   one-tap "apply / teach rule", and the diff view (word-level removals/additions).
4. **Empty / parsing / error** states for upload, and the **deployed** success state.
5. A short **motion spec** (load stagger, re-translate cross-fade, stepper advance,
   brass underline on memory-applied).
6. Any **typography refinements** to the document column (scale, leading, measure) and the
   numeric treatment.

Deliver as annotated comps + a short rationale. Output is design back to implement in
`app/` (Next.js) against the tokens in `app/globals.css`. The current build is the floor;
take it up a level.
