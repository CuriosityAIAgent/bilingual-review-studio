-- ════════════════════════════════════════════════════════════════════════════
-- Bilingual Review Studio — Supabase / Postgres schema
-- Apply in the Supabase SQL editor (or psql), then set STORAGE=supabase.
-- ════════════════════════════════════════════════════════════════════════════

-- ── v1 backend (what src/store/supabase-store.ts uses) ───────────────────────
-- The full DocModel is stored as jsonb (it already carries its own append-only
-- edit_log / handoff_log per spec §8). Indexed columns mirror the file store.

create table if not exists public.brs_documents (
  doc_id        text primary key,
  title         text not null default '',
  status        text not null default 'draft',
  target_locale text not null default 'es-419',
  owner_team    text not null default '',
  updated_at    timestamptz not null default now(),
  doc           jsonb not null
);
create index if not exists brs_documents_status_idx  on public.brs_documents (status);
create index if not exists brs_documents_updated_idx  on public.brs_documents (updated_at desc);

-- Shared memory (the flywheel, spec §13): glossary / rules / tm collections.
create table if not exists public.brs_memory (
  key        text primary key,            -- 'glossary' | 'rules' | 'tm'
  data       jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- ════════════════════════════════════════════════════════════════════════════
-- PRODUCTION HARDENING (target state, spec §10/§13/§14)
-- Normalized, append-only audit + governed memory. The v1 adapter does not yet
-- write here, but these tables encode the immutability contract: edit_log and
-- handoff_log are INSERT-only — UPDATE and DELETE are revoked, so corrections
-- must be represented as compensating events, never edits.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.edit_log (
  id          uuid primary key default gen_random_uuid(),
  doc_id      text not null,
  segment_id  text not null,
  actor_user  text not null,
  actor_team  text not null,
  actor_role  text not null,
  action      text not null check (action in ('edit','propose','accept','reject','neutralize','lock')),
  before_text text not null default '',
  after_text  text not null default '',
  char_edit_distance int not null default 0,
  hter        double precision not null default 0,
  error_categories text[] not null default '{}',
  ts          timestamptz not null default now()
);
create index if not exists edit_log_doc_idx on public.edit_log (doc_id, ts);

create table if not exists public.handoff_log (
  id          uuid primary key default gen_random_uuid(),
  doc_id      text not null,
  action      text not null check (action in ('handoff','submit','approve','publish','reopen')),
  from_user   text, from_team text,
  to_user     text, to_team   text,
  actor_user  text not null,
  actor_team  text not null,
  actor_role  text not null,
  note        text not null default '',
  status_from text, status_to text,
  ts          timestamptz not null default now()
);
create index if not exists handoff_log_doc_idx on public.handoff_log (doc_id, ts);

-- Governed neutralization rules: only ACTIVE/APPROVED rules are applied (§13).
create table if not exists public.neutralization_rules (
  id            uuid primary key default gen_random_uuid(),
  regional_form text not null,
  neutral_form  text not null,
  variant       text,
  reason        text not null default '',
  locale        text not null default 'es-419',
  state         text not null default 'proposed'
                check (state in ('candidate','proposed','approved','active','deprecated')),
  proposed_by   text, decided_by text, approved_by text,
  hits          int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.glossary (
  id              uuid primary key default gen_random_uuid(),
  source          text not null,
  approved_target text not null,
  forbidden_terms text[] not null default '{}',
  locale          text not null default 'es-419',
  domain          text,
  state           text not null default 'candidate'
                  check (state in ('candidate','proposed','approved','active','deprecated')),
  approved_by     text, approved_at timestamptz, notes text
);

-- TM incl. approved disclaimers; versioned, never deleted (§10).
create table if not exists public.tm (
  id            uuid primary key default gen_random_uuid(),
  source_text   text not null,
  target_text   text not null,
  locale        text not null default 'es-419',
  kind          text not null default 'segment'
                check (kind in ('disclaimer','boilerplate','segment')),
  version       int not null default 1,
  superseded_by uuid,
  approved_by   text, approved_at timestamptz,
  created_at    timestamptz not null default now()
);

-- ── Append-only enforcement ───────────────────────────────────────────────────
-- Revoke mutation on the audit tables for the anon/auth roles. The service role
-- (used by the server) inserts; nobody updates or deletes audit history.
revoke update, delete on public.edit_log    from anon, authenticated;
revoke update, delete on public.handoff_log from anon, authenticated;

-- ── Row-level security ────────────────────────────────────────────────────────
-- Enable RLS in production and add per-document / per-team policies mapped to the
-- RBAC matrix (spec Appendix C). Left permissive here for the prototype; the
-- server uses the service role key and enforces RBAC in src/auth + src/workflow.
-- alter table public.brs_documents enable row level security;
-- alter table public.brs_memory    enable row level security;
