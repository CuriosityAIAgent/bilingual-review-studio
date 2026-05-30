/** GET /api/seats — the demo seats for the mock auth switcher (spec §11). */
import { DEMO_SEATS } from "@/src/auth";
import { ok } from "@/src/server/context";

export async function GET() {
  return ok({ seats: DEMO_SEATS });
}
