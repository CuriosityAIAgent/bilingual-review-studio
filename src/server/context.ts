/**
 * Server-side request helpers. The mock auth seat travels in the `x-brs-seat`
 * header (set by the client seat switcher). Production replaces this with the
 * OIDC/SAML session → RBAC (spec §11); the authorize() logic is unchanged.
 */
import { type Seat, getSeat } from "@/src/auth";

export function seatFrom(req: Request): Seat {
  const id = req.headers.get("x-brs-seat") || "ana";
  return getSeat(id);
}

export function ok<T>(data: T, status = 200): Response {
  return Response.json(data as unknown as Record<string, unknown>, { status });
}

export function fail(message: string, status = 400): Response {
  return Response.json({ error: message }, { status });
}
