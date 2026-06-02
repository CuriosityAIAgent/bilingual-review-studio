# Training run: JPM LatAm bilingual pairs

What I fed the live system, what it stored, and what that buys the next translation.
Run against `translations.tigerai.tech` (gated), seat `ana`, via the Train page
(`POST /api/memory/import`, commit mode). Numbers below are read back from the live
`/api/memory` endpoint, not estimated.

## What went in

Two J.P. Morgan Private Bank LatAm insight pieces, each as an English+Spanish pair.
Both are faithful 1:1 translations published by the bank, so the paragraphs line up
one for one once the chart-label lines are stripped.

| Piece | EN paras | ES paras | Stored |
|---|---|---|---|
| Globalization / fragmentation (geopolitics, trade, energy) | 17 | 17 | 17 |
| The Cybersecurity Imperative (LatAm risk, vendors, spend) | 27 | 27 | 27 |

A third piece, *Global Race for Critical Minerals*, I **excluded on purpose**. Its
English version is an editorial condensation, not a literal translation: 17 English
paragraphs against 22 Spanish, the analyst quote (María Fernanda Ballesteros) dropped
entirely from the English, and Panama/Peru merged on one side but split on the other.
The Train flow aligns by paragraph position, so importing that pair would have
glued the English "graphite" paragraph to the Spanish "lithium" paragraph and
poisoned the memory. Worth saying plainly: not every published bilingual page is
translation-faithful, and the bad ones have to be caught before they go in.

## What the memory holds now

| Store | Before | After | Change |
|---|---|---|---|
| Translation memory (TM) | 6 | 50 | +44 |
| Glossary | 22 | 22 | 0 |
| Neutralization rules | 9 | 9 | 0 |

The 44 new entries are all `kind=segment`, locale `es-419`, version 1, each carrying
who approved it and when. The 6 pre-existing entries are protected disclaimers
(`kind=disclaimer`) and were left alone.

Glossary and rules did not move, and that is expected, not a bug. **The Train flow
stores sentence pairs only.** It does not yet mine those pairs for glossary terms or
neutralization rules. That extraction is a separate layer we have not built.

## What the stored pairs actually teach

The pairs are real es-419 from the bank's own desk, so they encode the house style we
want the model to imitate. Spot-checks read back from the live store:

**The billón trap, handled correctly in every case:**
- `$1.5 trillion` → `1,5 billones de dólares` (trillion = billón, 10¹²)
- `$1 trillion` → `un billón de dólares`
- `$873 billion` → `873 mil millones de dólares` (billion = mil millones, never billón)
- `$3.8 billion` → `3.800 millones de dólares`
- `$213 billion` → `213.000 millones de dólares`

This is the single rule the firm's reviewers care about most, and the stored memory
now demonstrates it both ways across seven money figures.

**Neutral, region-agnostic vocabulary** (counts across the 44 pairs):
- `cadenas de suministro` (supply chains) — 7
- `inversionistas` (investors, neutral; not the Iberian "inversores") — 3
- `PIB` (GDP) — 2
- `aranceles` (tariffs) — 2
- `tasa de crecimiento anual compuesta` (CAGR, spelled out) — 1
- `confianza cero` (zero-trust) — 1

Plus consistent renderings of `Internet de las Cosas` (IoT), `computación en la nube`
(cloud computing), and decimal commas / thousands points in the LatAm convention
(`12,4%`, `4.000 millones`).

## What this buys the next translation, and what it doesn't

Honest version, because the two work differently:

- **TM reuse works now.** When an incoming sentence is an exact or near match to one
  of these 44, the system serves the approved Spanish back instead of re-translating.
  Disclaimers and boilerplate are where this pays off immediately.
- **First-draft priming does NOT happen from this yet.** The translator's prompt is
  primed by the *glossary and active rules*, not by raw TM. Since the Train flow
  didn't add glossary terms or rules, a brand-new sentence about, say, tariffs will
  not automatically come back as `aranceles` on the first pass. It still has to be
  caught in review.

So the 44 pairs raise the floor on repeated content, but the bigger lift, getting the
*first* draft right, needs the recurring terminology promoted into the governed
glossary.

## Recommended next step: promote terms to the glossary

From these two pieces, the terms that recur and that we'd want enforced on every
future draft (candidate glossary entries, each still needing approver sign-off):

| English | Neutral es-419 | Why |
|---|---|---|
| billion | mil millones | the billón trap (already a validator; mirror in glossary) |
| trillion | billón | same |
| investors | inversionistas | avoid Iberian "inversores" |
| supply chains | cadenas de suministro | house standard |
| GDP | PIB | expand, don't borrow "GDP" |
| tariffs | aranceles | recurs in trade pieces |
| zero-trust | confianza cero | recurs in security pieces |
| CAGR | tasa de crecimiento anual compuesta | spell out on first use |
| IoT | Internet de las Cosas | spell out |
| computer | computadora | avoid Iberian "ordenador" |

If we want the system to keep learning from finished work at scale, the real upgrade
is a glossary/rule extractor on the Train flow: take an approved pair, propose the
terminology it implies, route those proposals through the same governance queue the
in-tool corrections already use. That closes the loop, finished documents would teach
the first draft, not just the fuzzy-match cache.

## How to scale this

Each faithful pair takes a fetch, a paragraph-count check, and one merge fix where the
two languages split a paragraph differently. Going from 2 pairs to 10 is mechanical
but needs the faithfulness screen on every one (see the minerals exclusion). The JPM
LatAm insights index has roughly 50 published pieces; most appear to be literal
translations and would import cleanly.
