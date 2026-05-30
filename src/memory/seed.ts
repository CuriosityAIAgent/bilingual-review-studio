/**
 * Seed bootstrap. The canonical seed memory ships in committed files
 * (glossaries/, tm/); on first use we load them into the runtime store if it is
 * empty. This makes the app work out-of-the-box after a clone while keeping
 * runtime data (data/) separate from shipped seeds.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { GlossaryEntry, NeutralizationRule, TmEntry } from "@/src/lib/doc-model";
import type { Store } from "@/src/store";

let _checked = false;

function readSeed<T>(rel: string): T[] {
  const path = join(process.cwd(), rel);
  if (!existsSync(path)) return [];
  try {
    const data = JSON.parse(readFileSync(path, "utf8"));
    return Array.isArray(data) ? (data as T[]) : [];
  } catch {
    return [];
  }
}

export async function ensureSeeded(store: Store): Promise<void> {
  if (_checked) return;
  _checked = true;
  const [glossary, rules, tm] = await Promise.all([store.getGlossary(), store.getRules(), store.getTm()]);
  if (glossary.length === 0) {
    const seed = readSeed<GlossaryEntry>("glossaries/neutral-es.json");
    if (seed.length) await store.saveGlossary(seed);
  }
  if (rules.length === 0) {
    const seed = readSeed<NeutralizationRule>("glossaries/neutralization-rules.json");
    if (seed.length) await store.saveRules(seed);
  }
  if (tm.length === 0) {
    const seed = readSeed<TmEntry>("tm/es-419.json");
    if (seed.length) await store.saveTm(seed);
  }
}

/** Test/dev helper to force a re-check. */
export function resetSeedGuard(): void {
  _checked = false;
}
