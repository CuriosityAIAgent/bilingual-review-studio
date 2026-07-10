# API Reference

The complete HTTP surface of Bilingual Review Studio. All routes live under
`app/api/` (Next.js App Router). This is reference material — for how the pieces
fit together, read [`ARCHITECTURE.md`](ARCHITECTURE.md).

## Conventions

- **Base URL** — same origin as the app (e.g. `http://localhost:3007` in dev).
- **Auth (identity)** — every request carries a seat in the `x-brs-seat` header
  (mock auth; production swaps in OIDC/SAML). Valid seat IDs come from
  `GET /api/seats` (`ana`, `diego`, `carmen`, `ops`, `sam`). Missing/unknown →
  defaults to the first demo seat. The server enforces RBAC per action via
  `config/permissions.yml`; a disallowed action returns `403`.
- **Access gate** — when `ACCESS_CODE` is set, `middleware.ts` requires a valid
  `ts_gate` cookie on every route except `/gate` and `/api/gate`. API calls
  without it get `401 {"error":"Access code required"}`. Obtain the cookie via
  `POST /api/gate`.
- **Responses** — JSON. Success is `200` with the payload; errors are
  `{ "error": "<message>" }` with a `4xx` status (`fail()`/`ok()` in
  `src/server/context.ts`).
- **Locale** — a target-language code: `es-419`, `zh-Hans`, or `zh-Hant`.

---

## Access gate

### `POST /api/gate`
Exchange the shared access code for the `ts_gate` cookie (httpOnly, 30-day).
No-op when `ACCESS_CODE` is unset.

- Body: `{ "code": "<access code>" }`
- `200 { "ok": true }` (sets cookie) · `401` on wrong code.

---

## Documents

### `GET /api/documents`
List active (non-deleted) documents as summaries.
- `200 { "documents": DocSummary[] }` — each summary includes `doc_id`, `title`, `target_locale`, `status`, `edits_per_1k`, `updated_at`, `updated_by`, counts.

### `POST /api/documents`
Create + translate a document. Two shapes:
- **Paste**: `{ "filename": "note.md", "text": "...", "locale": "es-419" }`
- **Upload**: `multipart/form-data` with a `file` (`.txt`/`.docx`) and `locale`.
- Runs the pipeline; `200 { "doc_id": "..." }`. If a translator key is set and the provider fails/returns garbage, the request **422s and saves nothing** (ADR 0013).
- Permission: `upload_translate` (author/admin).

### `GET /api/documents/[id]`
Fetch the full `DocModel`. `200 { "document": DocModel }` · `404` if unknown.

### `DELETE /api/documents/[id]`
Soft-delete (tombstone) — recoverable via restore. Permission: author/admin.

### `POST /api/documents/[id]/restore`
Clear the soft-delete tombstone, returning the doc to the active queue.

### `POST /api/documents/[id]/action`
The single mutation endpoint for segment edits and workflow transitions. Body is
`{ "kind": <action>, ...payload }`. Recognized `kind`s:

| kind | Purpose | Notes |
|---|---|---|
| `edit` | Edit a segment's `final_text` | text change; logs `edit` |
| `propose` | Lower-permission edit pending accept/reject | logs `propose` |
| `accept` / `reject` | Resolve a proposed/flagged segment | status only |
| `lock` | Lock a segment (approver/admin) | |
| `retranslate` | Re-run translation with current learnings | "Re-translate with learnings" |
| `submit` / `handoff` | Pass the turn to the next role | writes `handoff_log` |
| `approve` / `publish` | Sign-off / deploy transition | approver/admin |
| `request_changes` | Send back to the strategist | loops the workflow |

All actions are RBAC- and turn-gated, append to the audit logs, and are rejected
by optimistic concurrency if the client's `rev` is stale.

### `GET /api/documents/[id]/export`
Export the finished document.
- `?format=reflowed` — target-only continuous text (read / copy-paste).
- `?format=record` (default) — bilingual side-by-side record; add `&annotations=1` for review annotations.

---

## Memory: read

### `GET /api/memory`
The three governed memories for a locale. **`?locale=` filters all three**
(rules + glossary + TM); omit it to get every locale.
- `200 { "rules": [...], "glossary": [...], "tm": [...] }`

### `GET /api/metrics`
Learning-curve + totals for a locale. `?locale=<code>`.

---

## Memory: glossary & rules (propose → approve)

Only `active`/`approved` entries are applied. Proposing needs
`propose_change_or_rule`; activating needs `approve_rule` (approver/admin).

### `GET /api/glossary` · `POST /api/glossary`
- POST body: `{ "source", "approved_target", "locale", "forbidden_terms?": [], "domain?", "notes?", "activate?": bool }`.
- `activate: true` (approver/admin only) approves it in the same call; otherwise it lands as a candidate in the governance queue.

### `GET /api/rules` · `POST /api/rules`
- POST body: `{ "regional_form", "neutral_form", "locale", "reason?", "variant?": "es-ES"|"es-MX"|"other" }`.
- Files a proposed neutralization rule (the flywheel).

### `POST /api/rules/[id]`
Approve or deprecate a rule. Body `{ "action": "approve" | "deprecate" }`.
Approve → approver/admin; deprecate → **admin only**.

---

## Memory: translation memory (TM)

### `POST /api/memory/import`
Fold a completed EN+target pair into TM (the **Train** page).
- Body: `{ "source_text", "target_text", "mode": "preview"|"commit", "align": "paragraph"|"semantic", "locale" }`.
- `preview` returns the alignment without committing; `commit` writes it.
- `semantic` uses the QE model for sentence-level cross-lingual matching, keeping mutual-best pairs ≥ `thresholds.align_min_cosine` (ADR 0011).

### `POST /api/memory/import-docx`
Same, from a bilingual two-column `.docx` (`multipart/form-data`).

### `GET /api/memory/proposals` · `POST /api/memory/proposals`
Reviewer-edit → TM proposals (ADR 0012).
- `GET ?state=pending|approved|rejected` — list proposals.
- `POST` files a **pending** proposal from a corrected segment: `{ "source_text", "target_text", "doc_id", "doc_title", "segment_id" }`. The proposal inherits the source document's target locale. Needs `propose_change_or_rule`.

### `POST /api/memory/proposals/[id]`
Approve/reject a pending proposal. Body `{ "action": "approve" | "reject" }`.
**Approver/admin only** — approve folds the pair into TM; reject discards it.

---

## Admin

### `POST /api/admin/tm`
Purge machine-origin TM segments for incident cleanup (keeps approved
disclaimers). **Admin only.**

---

## Utility

### `GET /api/seats`
The demo seats for the mock auth switcher.
- `200 { "seats": [{ user_id, display_name, role, team_id, team_name }] }`
- Roles: `author` (Ana), `reviewer` (Diego), `approver` (Carmen), `admin` (Platform Admin / `ops`), `viewer` (Sam).

### `GET /api/fixtures`
The bundled sample documents (J.P. Morgan "Top Market Takeaways") available to
translate. `200 { "samples": [{ name, title, words }] }`.

---

## Quick examples

```bash
# Unlock the gate (only if ACCESS_CODE is set), keeping the cookie
curl -c cookies.txt -H "Content-Type: application/json" \
  -d '{"code":"<access code>"}' https://<host>/api/gate

# List documents as admin
curl -b cookies.txt -H "x-brs-seat: ops" https://<host>/api/documents

# Read Simplified-Chinese memory only
curl -b cookies.txt -H "x-brs-seat: ops" "https://<host>/api/memory?locale=zh-Hans"

# Propose + activate a glossary term (admin)
curl -b cookies.txt -H "x-brs-seat: ops" -H "Content-Type: application/json" \
  -d '{"source":"Nasdaq","approved_target":"纳斯达克指数","locale":"zh-Hans","activate":true}' \
  https://<host>/api/glossary
```
