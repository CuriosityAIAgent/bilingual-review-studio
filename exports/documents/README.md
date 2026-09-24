# Document export bundles (`brs_documents`)

Full processed documents — the **previous translations** — exported for a build
team. Each `<doc_id>.json` is a complete `DocModel` verbatim: `source_text →
mt_text → final_text` per block (final_text is the approved translation that
drives export), plus `entities`, `validator_results`, `glossary_hits`,
`neutralization_hits`, `tm_match`, `comments`, `seg_status`, `metrics`,
`model_run` provenance, `approval`, and the append-only `edit_log` / `handoff_log`.

Produced by [`scripts/export-documents.mjs`](../../scripts/export-documents.mjs).

> This directory ships with only this README because the corpus lives in the
> running store, not in the repo. Run the exporter against the environment that
> holds the data (below) to populate `<doc_id>.json` + `index.json` here.

## How to export

The exporter reads whichever backend the app uses, chosen by `STORAGE`
(matches `src/store/`):

```bash
# Local file store (default) — reads data/documents/*.json (honors DATA_DIR)
node scripts/export-documents.mjs

# Postgres (e.g. Railway)
STORAGE=postgres DATABASE_URL=postgres://... node scripts/export-documents.mjs

# Supabase
STORAGE=supabase \
  SUPABASE_URL=https://<project>.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
  node scripts/export-documents.mjs
```

Output: `exports/documents/<doc_id>.json` (one per document, incl. soft-deleted,
flagged in the index) and `exports/documents/index.json` (manifest: counts, per-doc
`status` / `target_locale` / `block_count` / `edit_log_len` / `deleted` / content
hash). The script is read-only — it never writes to the store.

## Notes for the build team

- **Provenance is intact.** `model_run` records the translator/critic/QE model ids
  (with honest fallback labels) and the `config_hash`; `edit_log` / `handoff_log`
  are the append-only audit trail.
- **`final_text` is authoritative** for export, not `mt_text` (raw MT). Use
  `final_text` as the reference translation.
- **Cross-reference with the memory bundles** in `../memory/` — `glossary_hits`,
  `neutralization_hits`, and `tm_match` on each block point back to the governed
  memory entries that shaped the translation.
