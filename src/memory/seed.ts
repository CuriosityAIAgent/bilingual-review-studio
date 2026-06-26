/**
 * Seed bootstrap. The canonical seed memory ships in committed files
 * (glossaries/, tm/); on first use we load them into the runtime store if it is
 * empty. This makes the app work out-of-the-box after a clone while keeping
 * runtime data (data/) separate from shipped seeds.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { GlossaryEntry, Locale, NeutralizationRule, TmEntry } from "@/src/lib/doc-model";
import type { Store } from "@/src/store";

// Seeding is per target locale: each locale's seed loads on first use of that
// locale, and is APPENDED (never replacing other locales' memory). Tracked per
// locale so adding a Chinese doc doesn't re-seed (or wipe) the Spanish memory.
const _seeded = new Set<string>();
// Serialize all seeding through one chain. Stores replace the whole collection on
// save, so without this two concurrent first-use calls for DIFFERENT locales could
// both read the empty store and the last write would drop the other's seed.
let _chain: Promise<void> = Promise.resolve();

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

export function ensureSeeded(store: Store, locale: Locale = "es-419"): Promise<void> {
  // Chain so reads+writes for different locales never interleave (see _chain note).
  const next = _chain.then(() => seedLocale(store, locale));
  _chain = next.catch(() => {}); // keep the chain alive even if one seed fails
  return next;
}

async function seedLocale(store: Store, locale: Locale): Promise<void> {
  if (_seeded.has(locale)) return;
  const [glossary, rules, tm] = await Promise.all([store.getGlossary(), store.getRules(), store.getTm()]);
  // Seed this locale only if it has no memory yet; append to (not overwrite) the
  // existing store so other locales are preserved.
  if (!glossary.some((g) => g.locale === locale)) {
    const seed = readSeed<GlossaryEntry>(`glossaries/neutral-${locale}.json`);
    if (seed.length) await store.saveGlossary([...glossary, ...seed]);
  }
  if (!rules.some((r) => r.locale === locale)) {
    const seed = readSeed<NeutralizationRule>(`glossaries/neutralization-rules-${locale}.json`);
    if (seed.length) await store.saveRules([...rules, ...seed]);
  }
  if (!tm.some((t) => t.locale === locale)) {
    const seed = readSeed<TmEntry>(`tm/${locale}.json`);
    if (seed.length) await store.saveTm([...tm, ...seed]);
  }
  // Mark done only after a successful write, so a failed seed can retry.
  _seeded.add(locale);
}

/** Test/dev helper to force a re-check. */
export function resetSeedGuard(): void {
  _seeded.clear();
  _chain = Promise.resolve();
}
