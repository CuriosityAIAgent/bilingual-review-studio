/** GET /api/memory — the three governed memories (spec §13) for the feedback
 *  panel: neutralization rules, neutral glossary, translation memory.
 *
 *  Optional `?locale=` scopes all three to one target language (memory is
 *  isolated per locale — a zh-Hans doc must never see es-419 rules/glossary/TM).
 *  Without it, every locale is returned (back-compat). Filtering server-side
 *  mirrors GET /api/metrics and keeps the payload small on large TMs. */
import type { Locale } from "@/src/lib/doc-model";
import { ensureSeeded } from "@/src/memory/seed";
import { ok } from "@/src/server/context";
import { getStore } from "@/src/store";

export async function GET(req: Request) {
  const store = getStore();
  const locale = new URL(req.url).searchParams.get("locale") as Locale | null;
  // Seed the requested locale on demand (so a first-ever zh-Hant view isn't empty).
  await ensureSeeded(store, locale ?? undefined);
  const [rules, glossary, tm] = await Promise.all([store.getRules(), store.getGlossary(), store.getTm()]);
  const scope = <T extends { locale?: string }>(xs: T[]) => (locale ? xs.filter((x) => x.locale === locale) : xs);
  return ok({ rules: scope(rules), glossary: scope(glossary), tm: scope(tm) });
}
