/**
 * Store selector. Defaults to the local file store so the app runs with zero
 * setup. Set STORAGE=postgres (+ DATABASE_URL, e.g. Railway's Postgres plugin)
 * for durable shared memory with no extra service, or STORAGE=supabase
 * (+ SUPABASE_* env) to use Supabase's PostgREST API.
 */
import { FileStore } from "./file-store";
import { PostgresStore } from "./postgres-store";
import { SupabaseStore } from "./supabase-store";
import type { Store } from "./types";

let _store: Store | null = null;

export function getStore(): Store {
  if (_store) return _store;
  const backend = (process.env.STORAGE || "file").toLowerCase();
  if (backend === "postgres") _store = new PostgresStore();
  else if (backend === "supabase") _store = new SupabaseStore();
  else _store = new FileStore();
  return _store;
}

export type { Store, DocSummary } from "./types";
export { summarize } from "./types";
