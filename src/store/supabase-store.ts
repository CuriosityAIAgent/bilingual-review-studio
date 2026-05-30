/**
 * Supabase Postgres backend. Activated with STORAGE=supabase (spec §14, App. E).
 *
 * v1 mirrors the file store using two jsonb-backed tables (see supabase/schema.sql):
 *   • brs_documents — the full DocModel as jsonb + indexed columns
 *   • brs_memory    — glossary / rules / tm collections keyed by name
 *
 * schema.sql also ships the PRODUCTION-TARGET normalized, append-only audit
 * tables (edit_log / handoff_log with REVOKE update/delete) for the hardened
 * deployment described in spec §10/§14.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  DocModel,
  GlossaryEntry,
  NeutralizationRule,
  TmEntry,
} from "@/src/lib/doc-model";
import { type DocSummary, type Store, summarize } from "./types";

function client(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "STORAGE=supabase requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. " +
        "Apply supabase/schema.sql first.",
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export class SupabaseStore implements Store {
  private db = client();

  async saveDoc(doc: DocModel): Promise<void> {
    const { error } = await this.db.from("brs_documents").upsert({
      doc_id: doc.doc_id,
      title: doc.title,
      status: doc.status,
      target_locale: doc.target_locale,
      owner_team: doc.owner.team_id,
      updated_at: doc.updated_at,
      doc,
    });
    if (error) throw new Error(`saveDoc: ${error.message}`);
  }

  async getDoc(docId: string): Promise<DocModel | null> {
    const { data, error } = await this.db
      .from("brs_documents")
      .select("doc")
      .eq("doc_id", docId)
      .maybeSingle();
    if (error) throw new Error(`getDoc: ${error.message}`);
    return (data?.doc as DocModel) ?? null;
  }

  async listDocs(): Promise<DocSummary[]> {
    const { data, error } = await this.db
      .from("brs_documents")
      .select("doc")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(`listDocs: ${error.message}`);
    return (data ?? []).map((r) => summarize(r.doc as DocModel));
  }

  async deleteDoc(docId: string): Promise<void> {
    const { error } = await this.db.from("brs_documents").delete().eq("doc_id", docId);
    if (error) throw new Error(`deleteDoc: ${error.message}`);
  }

  private async getMemory<T>(key: string, fallback: T): Promise<T> {
    const { data, error } = await this.db
      .from("brs_memory")
      .select("data")
      .eq("key", key)
      .maybeSingle();
    if (error) throw new Error(`getMemory(${key}): ${error.message}`);
    return (data?.data as T) ?? fallback;
  }

  private async setMemory(key: string, data: unknown): Promise<void> {
    const { error } = await this.db
      .from("brs_memory")
      .upsert({ key, data, updated_at: new Date().toISOString() });
    if (error) throw new Error(`setMemory(${key}): ${error.message}`);
  }

  getGlossary = () => this.getMemory<GlossaryEntry[]>("glossary", []);
  saveGlossary = (entries: GlossaryEntry[]) => this.setMemory("glossary", entries);
  getRules = () => this.getMemory<NeutralizationRule[]>("rules", []);
  saveRules = (rules: NeutralizationRule[]) => this.setMemory("rules", rules);
  getTm = () => this.getMemory<TmEntry[]>("tm", []);
  saveTm = (entries: TmEntry[]) => this.setMemory("tm", entries);
}
