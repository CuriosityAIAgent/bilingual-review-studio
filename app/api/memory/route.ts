/** GET /api/memory — the three governed memories (spec §13) for the feedback
 *  panel: neutralization rules, neutral glossary, translation memory. */
import { ensureSeeded } from "@/src/memory/seed";
import { ok } from "@/src/server/context";
import { getStore } from "@/src/store";

export async function GET() {
  const store = getStore();
  await ensureSeeded(store);
  const [rules, glossary, tm] = await Promise.all([store.getRules(), store.getGlossary(), store.getTm()]);
  return ok({ rules, glossary, tm });
}
