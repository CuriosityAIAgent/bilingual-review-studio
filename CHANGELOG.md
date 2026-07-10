# Changelog

All notable changes to Bilingual Review Studio. Format based on
[Keep a Changelog](https://keepachangelog.com/); this project uses
[Semantic Versioning](https://semver.org/). This is the first maintained
changelog — the complete history is in git (`git log`), and each entry links the
pull request that shipped it.

## [Unreleased]

### Added
- **Multi-target languages.** Target locale is now first-class: **neutral Spanish
  (es-419)**, **Traditional Chinese (zh-Hant)**, and **Simplified Chinese
  (zh-Hans)**, each with its own governed memory, locale config
  (`config/locales/`), and script-purity validator. (#26, #27, #28)
- **Locale-driven UI + per-language flywheel.** Create → review → export copy is
  locale-aware, and governance (glossary / rules / TM) is scoped and applied per
  target language. (#29, #30)
- **Train from finished work.** Import a bilingual two-column Word doc — or paste
  both sides — to seed translation memory directly, with paragraph or semantic
  sentence-level alignment. (#33, #34)
- **Retrieval-augmented translation.** New content reuses approved memory, with
  surgical TM cleanup for incident recovery. (#35)
- **Home queue: language filter + activity line.** "Current work" gets per-language
  filter pills (persisted per browser) so each team jumps straight to its target,
  and each card shows `edited by X · updated <time>`. (#36)
- **Engineer documentation.** `docs/ARCHITECTURE.md`, `docs/reference-api.md`,
  `docs/howto-local-development.md`, and a `docs/` index. (this release)

### Changed
- **Memory reads are locale-scoped.** `GET /api/memory?locale=` now filters rules
  + glossary + TM server-side instead of returning every language mixed. (#37)
- **Governance panels scoped by language.** The review sidebar shows only the
  active document's target-language memory; queues group by language. (#31)
- **Cleaner, uniform "Current work" cards.** (#32)

### Fixed
- **Active filter pill was unreadable** — it referenced an undefined CSS variable
  and rendered as a black blob with no label; now uses a defined theme token. (#38)
- **Role-aware review guidance** and a clearer "awaiting approver" state. (#25)

## [0.1.0]

Initial governed neutral-Spanish review workflow.

### Added
- **The governed review pipeline** — `ingest → prepare → translate → evaluate →
  refine → validate → gate → review → export` (`src/pipeline/run.ts`).
- **Cross-model translate + critique** — Claude translator, a decorrelated OpenAI
  critic, and a gated refine loop that fixes only objectively-failing segments and
  reverts on no gain.
- **Self-hosted, reference-free QE** — a cross-lingual embedding model in-container
  (no external service, no GPU); a routing signal only.
- **Deterministic validators** — number integrity incl. the billón trap, currency,
  date, ticker, ISIN check-digit, DNT, glossary, regionalism, disclaimer, and
  English-leakage checks.
- **Governed memory (the flywheel)** — propose → approve lifecycle for glossary,
  neutralization rules, and TM; only `active`/`approved` entries are applied.
- **Turn-based RBAC workflow** — one holder per document; the baton passes
  Strategist → Marketing → Supervisory Management → deploy; append-only
  `edit_log` / `handoff_log`; optimistic-concurrency stale-write protection.
- **Pluggable storage** — local JSON file, Postgres, or Supabase (`STORAGE` env).
- **Access gate** — `ACCESS_CODE` locks every page and API route behind `/gate`.

See [`docs/decisions/`](docs/decisions/) for the ADRs behind these choices.

[Unreleased]: https://github.com/CuriosityAIAgent/bilingual-review-studio/commits/main
[0.1.0]: https://github.com/CuriosityAIAgent/bilingual-review-studio/releases/tag/v0.1.0
