/**
 * Shared access-code gate (front-door lock for shared deployments).
 *
 * When ACCESS_CODE is set, every request — pages AND API routes — must carry a
 * valid gate cookie, otherwise it's bounced to /gate (pages) or 401'd (API).
 * This stops casual/random visitors from reaching the app or firing any LLM
 * call (no Anthropic/OpenAI credit burn before the code is entered).
 *
 * It is intentionally lightweight — a lock for "showing it to a few people",
 * NOT the production SSO/RBAC (see docs/DEPLOYMENT.md §4). When ACCESS_CODE is
 * unset the gate is disabled, so local dev stays frictionless.
 *
 * The cookie holds a SHA-256 token derived from the code, never the code
 * itself, and is httpOnly so page scripts can't read it.
 */
import { NextResponse, type NextRequest } from "next/server";
import { GATE_COOKIE, gateToken } from "@/app/lib/gate";

export async function middleware(req: NextRequest) {
  const code = process.env.ACCESS_CODE;
  if (!code) return NextResponse.next(); // gate disabled (local dev / unset)

  const { pathname } = req.nextUrl;
  // Always reachable: the gate itself, its API, and Next internals/assets.
  if (
    pathname === "/gate" ||
    pathname === "/api/gate" ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt"
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get(GATE_COOKIE)?.value;
  if (token && token === (await gateToken(code))) return NextResponse.next();

  // API → hard 401 (don't redirect an XHR, and never let a call through).
  if (pathname.startsWith("/api")) {
    return NextResponse.json({ error: "Access code required" }, { status: 401 });
  }
  // Pages → send to the gate, remembering where they were headed.
  const url = req.nextUrl.clone();
  url.pathname = "/gate";
  url.search = pathname && pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";
  return NextResponse.redirect(url);
}

export const config = {
  // Run on everything except static assets (we re-check internals above too).
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
