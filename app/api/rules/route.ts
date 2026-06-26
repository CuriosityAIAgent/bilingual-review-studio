/** GET /api/rules — all neutralization rules. POST — propose a new rule
 *  (the flywheel: a reviewer teaches a neutralization from a resolved clash). */
import { authorize } from "@/src/auth";
import type { Locale } from "@/src/lib/doc-model";
import { proposeRule } from "@/src/memory";
import { ensureSeeded } from "@/src/memory/seed";
import { fail, ok, seatFrom } from "@/src/server/context";
import { getStore } from "@/src/store";

export async function GET() {
  const store = getStore();
  await ensureSeeded(store);
  return ok({ rules: await store.getRules() });
}

export async function POST(req: Request) {
  const seat = seatFrom(req);
  const authz = authorize(seat, "propose_change_or_rule");
  if (!authz.allowed) return fail(`Not permitted: ${authz.reason}`, 403);
  const body = (await req.json()) as {
    regional_form: string;
    neutral_form: string;
    reason?: string;
    variant?: "es-ES" | "es-MX" | "other";
    locale?: Locale;
  };
  if (!body.regional_form || !body.neutral_form) return fail("regional_form and neutral_form are required");
  // Seed the target locale FIRST, so a first-ever rule for it doesn't block that
  // locale's shipped seed memory from loading (seedLocale treats "any row exists"
  // as seeded).
  await ensureSeeded(getStore(), body.locale);
  const rule = await proposeRule({
    regional_form: body.regional_form,
    neutral_form: body.neutral_form,
    reason: body.reason ?? "",
    variant: body.variant,
    // The rule belongs to the document's target language — so it only applies to
    // that locale's drafts (a Chinese rule never touches a Spanish doc).
    locale: body.locale,
    proposed_by: { user_id: seat.user_id, team_id: seat.team_id },
  });
  return ok({ rule });
}
