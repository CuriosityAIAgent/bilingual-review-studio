#!/usr/bin/env node
/**
 * export-documents.mjs — export processed documents (brs_documents) into per-doc
 * JSON bundles for handoff. Each bundle is a full DocModel verbatim: source_text →
 * mt_text → final_text (the previous translations that drive export), plus blocks,
 * entities, validator_results, glossary/neutralization hits, tm_match, comments,
 * seg_status, metrics, model_run provenance, approval, and the append-only
 * edit_log / handoff_log. Full fidelity — nothing is dropped or reshaped.
 *
 * Backend-agnostic: reads the same store the app uses, chosen by STORAGE
 * (default "file"). Run it wherever the corpus actually lives:
 *
 *   file      node scripts/export-documents.mjs
 *             (reads data/documents/*.json; honors DATA_DIR)
 *   postgres  STORAGE=postgres DATABASE_URL=... node scripts/export-documents.mjs
 *   supabase  STORAGE=supabase SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *               node scripts/export-documents.mjs
 *
 * Output: exports/documents/<doc_id>.json + exports/documents/index.json (manifest
 * with counts + content hashes). Includes soft-deleted docs, flagged in the index.
 * Reads only; never writes to the store. Uses deps already in package.json
 * (@supabase/supabase-js, pg) via dynamic import so an unused backend needs nothing.
 */
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const ROOT = process.cwd();
const OUT_DIR = join(ROOT, "exports", "documents");
const backend = (process.env.STORAGE || "file").toLowerCase();

async function loadFromFile() {
  const dir = process.env.DATA_DIR ? join(process.env.DATA_DIR, "documents") : join(ROOT, "data", "documents");
  let files;
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
  } catch (e) {
    if (e.code === "ENOENT") return { docs: [], note: `no directory ${dir} (file store is empty here)` };
    throw e;
  }
  const docs = [];
  for (const f of files) docs.push(JSON.parse(await readFile(join(dir, f), "utf8")));
  return { docs, note: `read ${docs.length} doc file(s) from ${dir}` };
}

async function loadFromSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("STORAGE=supabase requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  const { createClient } = await import("@supabase/supabase-js");
  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await db.from("brs_documents").select("doc").order("updated_at", { ascending: false });
  if (error) throw new Error(`supabase select brs_documents: ${error.message}`);
  return { docs: (data ?? []).map((r) => r.doc), note: `read ${data?.length ?? 0} row(s) from supabase brs_documents` };
}

async function loadFromPostgres() {
  const cs = process.env.DATABASE_URL;
  if (!cs) throw new Error("STORAGE=postgres requires DATABASE_URL");
  const pg = (await import("pg")).default;
  const pool = new pg.Pool({ connectionString: cs });
  try {
    const r = await pool.query("select doc from brs_documents order by updated_at desc");
    return { docs: r.rows.map((row) => row.doc), note: `read ${r.rowCount} row(s) from postgres brs_documents` };
  } finally {
    await pool.end();
  }
}

const loaders = { file: loadFromFile, postgres: loadFromPostgres, supabase: loadFromSupabase };
if (!loaders[backend]) {
  console.error(`[export-documents] unknown STORAGE="${backend}" (expected file | postgres | supabase)`);
  process.exit(1);
}

const { docs, note } = await loaders[backend]();
console.log(`[export-documents] backend=${backend}: ${note}`);

await mkdir(OUT_DIR, { recursive: true });
const generatedAt = new Date().toISOString();
const index = {
  generated_at: generatedAt,
  backend,
  source_repo: "CuriosityAIAgent/bilingual-review-studio",
  doc_model_schema_version: "1.0",
  doc_count: 0,
  active_count: 0,
  deleted_count: 0,
  documents: [],
};

for (const doc of docs) {
  if (!doc || !doc.doc_id) {
    console.warn("[export-documents] skipping a row with no doc_id");
    continue;
  }
  const file = `${doc.doc_id}.json`;
  await writeFile(join(OUT_DIR, file), JSON.stringify(doc, null, 2) + "\n");
  const deleted = !!doc.deleted_at;
  index.doc_count += 1;
  index[deleted ? "deleted_count" : "active_count"] += 1;
  index.documents.push({
    doc_id: doc.doc_id,
    title: doc.title,
    filename: doc.source?.filename ?? null,
    target_locale: doc.target_locale,
    status: doc.status,
    block_count: Array.isArray(doc.blocks) ? doc.blocks.length : 0,
    edit_log_len: Array.isArray(doc.edit_log) ? doc.edit_log.length : 0,
    handoff_log_len: Array.isArray(doc.handoff_log) ? doc.handoff_log.length : 0,
    deleted,
    updated_at: doc.updated_at,
    file,
    content_hash: createHash("sha256").update(JSON.stringify(doc)).digest("hex").slice(0, 16),
  });
}

await writeFile(join(OUT_DIR, "index.json"), JSON.stringify(index, null, 2) + "\n");
console.log(
  `[export-documents] wrote ${index.doc_count} bundle(s) (${index.active_count} active, ${index.deleted_count} deleted) + index.json to exports/documents/`,
);
if (index.doc_count === 0) {
  console.log(
    "[export-documents] NOTE: 0 documents found. This store holds no processed documents. " +
      "Point STORAGE + DATA_DIR / DATABASE_URL / SUPABASE_* at the environment that has the corpus.",
  );
}
