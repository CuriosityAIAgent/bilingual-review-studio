/**
 * Store selector. Defaults to the local file store so the app runs with zero
 * setup; set STORAGE=supabase (plus SUPABASE_* env) to use Postgres.
 */
import { FileStore } from "./file-store";
import { SupabaseStore } from "./supabase-store";
import type { Store } from "./types";

let _store: Store | null = null;

export function getStore(): Store {
  if (_store) return _store;
  const backend = (process.env.STORAGE || "file").toLowerCase();
  _store = backend === "supabase" ? new SupabaseStore() : new FileStore();
  return _store;
}

export type { Store, DocSummary } from "./types";
export { summarize } from "./types";
