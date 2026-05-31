/** POST /api/gate — exchange the shared access code for a gate cookie.
 *  Verified server-side against ACCESS_CODE; the cookie stores a derived
 *  SHA-256 token (never the code) and is httpOnly. See middleware.ts. */
import { NextResponse } from "next/server";
import { gateToken } from "@/app/lib/gate";

// Length-independent constant-time-ish compare (avoids early-exit timing leak).
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function POST(req: Request) {
  const code = process.env.ACCESS_CODE;
  if (!code) return NextResponse.json({ ok: true }); // gate disabled

  const body = (await req.json().catch(() => ({}))) as { code?: string };
  const submitted = typeof body.code === "string" ? body.code : "";
  if (!safeEqual(submitted, code)) {
    return NextResponse.json({ error: "Incorrect access code." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set("ts_gate", await gateToken(code), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return res;
}
