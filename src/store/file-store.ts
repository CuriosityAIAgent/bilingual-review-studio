/**
 * Local JSON file store — the default backend (zero setup, runs immediately).
 * Documents live in data/documents/<doc_id>.json; memory in data/memory/*.json.
 *
 * Matches the existing Living Intelligence data/*.json convention. The append-only
 * audit semantics (spec §10/§14) are enforced at the application layer: the
 * workflow code only ever PUSHES to edit_log/handoff_log, never mutates/deletes.
 */
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  DocModel,
  GlossaryEntry,
  NeutralizationRule,
  TmEntry,
} from "@/src/lib/doc-model";
import { type DocSummary, type Store, summarize } from "./types";

// Resolved lazily so tests (and runtime env changes) can redirect storage.
const dataDir = () => process.env.DATA_DIR || join(process.cwd(), "data");
const docsDir = () => join(dataDir(), "documents");
const memDir = () => join(dataDir(), "memory");

async function ensureDirs() {
  await mkdir(docsDir(), { recursive: true });
  await mkdir(memDir(), { recursive: true });
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return fallback;
  }
}

/** Atomic-ish write: write to a temp file then rename. */
async function writeJson(path: string, data: unknown): Promise<void> {
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  const { rename } = await import("node:fs/promises");
  await rename(tmp, path);
}

export class FileStore implements Store {
  async saveDoc(doc: DocModel): Promise<void> {
    await ensureDirs();
    await writeJson(join(docsDir(), `${doc.doc_id}.json`), doc);
  }

  async getDoc(docId: string): Promise<DocModel | null> {
    return readJson<DocModel | null>(join(docsDir(), `${docId}.json`), null);
  }

  async listDocs(): Promise<DocSummary[]> {
    await ensureDirs();
    const files = (await readdir(docsDir())).filter((f) => f.endsWith(".json"));
    const docs = await Promise.all(
      files.map((f) => readJson<DocModel | null>(join(docsDir(), f), null)),
    );
    return docs
      .filter((d): d is DocModel => !!d)
      .map(summarize)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }

  async deleteDoc(docId: string): Promise<void> {
    await rm(join(docsDir(), `${docId}.json`), { force: true });
  }

  async getGlossary(): Promise<GlossaryEntry[]> {
    return readJson<GlossaryEntry[]>(join(memDir(), "glossary.json"), []);
  }
  async saveGlossary(entries: GlossaryEntry[]): Promise<void> {
    await ensureDirs();
    await writeJson(join(memDir(), "glossary.json"), entries);
  }

  async getRules(): Promise<NeutralizationRule[]> {
    return readJson<NeutralizationRule[]>(join(memDir(), "rules.json"), []);
  }
  async saveRules(rules: NeutralizationRule[]): Promise<void> {
    await ensureDirs();
    await writeJson(join(memDir(), "rules.json"), rules);
  }

  async getTm(): Promise<TmEntry[]> {
    return readJson<TmEntry[]>(join(memDir(), "tm.json"), []);
  }
  async saveTm(entries: TmEntry[]): Promise<void> {
    await ensureDirs();
    await writeJson(join(memDir(), "tm.json"), entries);
  }
}
