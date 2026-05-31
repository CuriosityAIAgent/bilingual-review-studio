/** Shared access-gate helpers, used by middleware.ts (edge) and the gate API
 *  (node). The cookie stores this derived token, never the raw code. */
export const GATE_COOKIE = "ts_gate";

export async function gateToken(code: string): Promise<string> {
  const data = new TextEncoder().encode(`translation-studio::${code}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
