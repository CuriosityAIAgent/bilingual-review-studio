/**
 * Postgres store — plain Postgres via DATABASE_URL (Railway's Postgres plugin,
 * or any Postgres). Unlike the Supabase store (which talks to PostgREST with a
 * service-role key), this connects directly with the `pg` driver, so there is
 * no extra service or god-mode key to manage.
 *
 * It self-migrates: the two tables it needs (brs_documents, brs_memory) are
 * created on first use, so a fresh Railway Postgres works with zero manual SQL.
 * Memory (glossary/rules/tm) is then auto-seeded by ensureSeeded() like any
 * other backend. Set STORAGE=postgres + DATABASE_URL to use it.
 */
import { Pool } from "pg";
import { type DocSummary, type Store, summarize } from "./types";
import type { DocModel, GlossaryEntry, NeutralizationRule, TmEntry } from "@/src/lib/doc-model";

let _pool: Pool | null = null;
let _ready: Promise<void> | null = null;

function pool(): Pool {
  if (!_pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("STORAGE=postgres requires DATABASE_URL (Railway injects it when you add the Postgres plugin).");
    }
    // Railway's in-project (private network) URL needs no SSL; the public proxy
    // URL does — opt in with sslmode=require in the connection string.
    const ssl = /sslmode=require/.test(connectionString) ? { rejectUnauthorized: false } : undefined;
    _pool = new Pool({ connectionString, ssl, max: 5 });
  }
  return _pool;
}

/** Create the two tables this store uses, once per process. Idempotent. */
function ready(): Promise<void> {
  if (!_ready) {
    _ready = (async () => {
      const p = pool();
      await p.query(`
        create table if not exists brs_documents (
          doc_id        text primary key,
          title         text not null default '',
          status        text not null default 'draft',
          target_locale text not null default 'es-419',
          owner_team    text not null default '',
          updated_at    timestamptz not null default now(),
          doc           jsonb not null
        )`);
      await p.query(`create index if not exists brs_documents_updated_idx on brs_documents (updated_at desc)`);
      await p.query(`
        create table if not exists brs_memory (
          key        text primary key,
          data       jsonb not null default '[]'::jsonb,
          updated_at timestamptz not null default now()
        )`);
    })().catch((e) => {
      _ready = null; // allow retry on a transient connection failure
      throw e;
    });
  }
  return _ready;
}

export class PostgresStore implements Store {
  async saveDoc(doc: DocModel): Promise<void> {
    await ready();
    const s = summarize(doc);
    await pool().query(
      `insert into brs_documents (doc_id, title, status, target_locale, owner_team, updated_at, doc)
       values ($1, $2, $3, $4, $5, now(), $6)
       on conflict (doc_id) do update set
         title = excluded.title, status = excluded.status, target_locale = excluded.target_locale,
         owner_team = excluded.owner_team, updated_at = now(), doc = excluded.doc`,
      [doc.doc_id, s.title, s.status, s.target_locale, s.owner_team, JSON.stringify(doc)],
    );
  }

  async getDoc(docId: string): Promise<DocModel | null> {
    await ready();
    const r = await pool().query<{ doc: DocModel }>(`select doc from brs_documents where doc_id = $1`, [docId]);
    return r.rows[0]?.doc ?? null;
  }

  async listDocs(): Promise<DocSummary[]> {
    await ready();
    const r = await pool().query<{ doc: DocModel }>(`select doc from brs_documents order by updated_at desc`);
    return r.rows.map((row) => summarize(row.doc));
  }

  async deleteDoc(docId: string): Promise<void> {
    await ready();
    await pool().query(`delete from brs_documents where doc_id = $1`, [docId]);
  }

  private async getMemory<T>(key: string, fallback: T): Promise<T> {
    await ready();
    const r = await pool().query<{ data: T }>(`select data from brs_memory where key = $1`, [key]);
    return r.rows[0]?.data ?? fallback;
  }

  private async setMemory(key: string, data: unknown): Promise<void> {
    await ready();
    await pool().query(
      `insert into brs_memory (key, data, updated_at) values ($1, $2, now())
       on conflict (key) do update set data = excluded.data, updated_at = now()`,
      [key, JSON.stringify(data)],
    );
  }

  getGlossary = () => this.getMemory<GlossaryEntry[]>("glossary", []);
  saveGlossary = (entries: GlossaryEntry[]) => this.setMemory("glossary", entries);
  getRules = () => this.getMemory<NeutralizationRule[]>("rules", []);
  saveRules = (rules: NeutralizationRule[]) => this.setMemory("rules", rules);
  getTm = () => this.getMemory<TmEntry[]>("tm", []);
  saveTm = (entries: TmEntry[]) => this.setMemory("tm", entries);
}
