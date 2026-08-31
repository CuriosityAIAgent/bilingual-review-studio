/**
 * Thin LLM client wrappers (spec §6). Lazy-initialised so a missing API key
 * never crashes import — the calling stage decides whether to fall back.
 *
 * Security note (spec §14): these wrappers pass a `system` instruction and a
 * `user` payload separately. The translate/evaluate modules place untrusted
 * source text inside a delimited data block in the `user` payload and instruct
 * the model to treat it as DATA, never instructions.
 */
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

let _anthropic: Anthropic | null = null;
let _openai: OpenAI | null = null;

export function anthropicAvailable(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}
export function openaiAvailable(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

// Provider HEALTH (not just key presence). A key with no credit / past a rate
// limit will fail every call, and we must not then claim the live model ran.
// This is global provider state, so caching it across requests is correct.
let _criticLive: { ok: boolean; ts: number } | null = null;
const CRITIC_PROBE_TTL_MS = 60_000;
// A mid-run live-call failure backs off for a SHORTER window than a clean probe
// result, so one transient blip (a single rate-limited document) doesn't black
// out the critic fleet-wide for a full minute — the next document re-probes
// quickly and self-heals once the provider recovers.
const CRITIC_DOWN_COOLDOWN_MS = 10_000;

/** True only if the OpenAI critic can ACTUALLY complete a call right now
 *  (key set AND has credit / isn't rate-limited). Cheap 1-token probe, cached. */
export async function criticProviderLive(model: string): Promise<boolean> {
  if (!openaiAvailable()) return false;
  const now = Date.now();
  if (_criticLive && now - _criticLive.ts < CRITIC_PROBE_TTL_MS) return _criticLive.ok;
  let ok = false;
  try {
    // Token headroom so a reasoning model (gpt-5/o-series) doesn't spend the whole
    // budget on reasoning and 400 ("max_tokens reached") — which would FALSELY mark
    // the critic dead and silently force the deterministic fallback. A non-reasoning
    // model (gpt-4o) returns content well within this. We only need a non-error reply.
    await openaiComplete({ model, system: "ok", user: "ok", maxTokens: 16 });
    ok = true;
  } catch (e) {
    ok = false;
    console.error(`[critic] OpenAI unavailable (model=${model}) — using deterministic critic. Reason: ${(e as Error).message}`);
  }
  _criticLive = { ok, ts: now };
  return ok;
}

/** Last probed critic health (sync), for honest provenance stamping. null = not
 *  probed yet this window → caller falls back to key-presence labelling. */
export function criticProviderLiveCached(): boolean | null {
  if (!openaiAvailable()) return false;
  return _criticLive ? _criticLive.ok : null;
}

/** Mark the critic provider down after a live call actually failed mid-run (e.g.
 *  rate-limited under concurrent load). This is the honest counterpart to the
 *  probe: once a real call fails we must NOT keep claiming the live model ran, so
 *  later segments skip the doomed call and provenance stamps the fallback. */
export function markCriticUnavailable(reason: string): void {
  // Back-date the timestamp so the cached-down state expires after the (shorter)
  // cooldown, not the full probe TTL — within this run the remaining segments
  // still skip the doomed live call, but a later document re-probes within
  // seconds instead of inheriting a 60s blackout from one transient failure.
  _criticLive = { ok: false, ts: Date.now() - (CRITIC_PROBE_TTL_MS - CRITIC_DOWN_COOLDOWN_MS) };
  console.error(`[critic] live call failed mid-run — degrading to deterministic critic. Reason: ${reason}`);
}

function anthropic(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropic;
}
function openai(): OpenAI {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

export interface CompleteOpts {
  system: string;
  user: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

export interface CompleteResult {
  text: string;
  /** Anthropic stop_reason. "max_tokens" means the reply was TRUNCATED — the
   *  caller must not treat the (incomplete) text as a valid response. */
  stopReason: string | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Transient provider states worth a retry: rate limits (429), overload (529),
// and 5xx. A 4xx like 400/401/403/404 (bad request, auth, unknown model) is
// permanent — fail fast so a misconfiguration surfaces immediately. An error
// with no HTTP status is a network/timeout blip → retry.
const RETRYABLE_STATUS = new Set([408, 409, 429, 500, 502, 503, 504, 529]);
function isRetryable(e: unknown): boolean {
  const status = (e as { status?: number } | null)?.status;
  return typeof status === "number" ? RETRYABLE_STATUS.has(status) : true;
}

/** Anthropic completion with transient-error retry and stop_reason exposed.
 *  Retries 429/5xx/529/network up to 3 attempts with exponential backoff;
 *  permanent errors fail fast. Exposing stop_reason lets the translator detect a
 *  max_tokens truncation instead of mis-reading a cut-off reply as "unreadable". */
export async function anthropicCompleteWithMeta(o: CompleteOpts): Promise<CompleteResult> {
  const maxAttempts = 3;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await anthropic().messages.create({
        model: o.model,
        max_tokens: o.maxTokens ?? 4096,
        temperature: o.temperature ?? 0.2,
        system: o.system,
        messages: [{ role: "user", content: o.user }],
      });
      const text = res.content
        .map((c) => (c.type === "text" ? c.text : ""))
        .join("")
        .trim();
      return { text, stopReason: res.stop_reason ?? null };
    } catch (e) {
      lastErr = e;
      if (attempt < maxAttempts && isRetryable(e)) {
        await sleep(400 * 2 ** (attempt - 1)); // 400ms, then 800ms
        continue;
      }
      throw e;
    }
  }
  throw lastErr; // unreachable, but keeps the type checker happy
}

export async function anthropicComplete(o: CompleteOpts): Promise<string> {
  return (await anthropicCompleteWithMeta(o)).text;
}

export async function openaiComplete(o: CompleteOpts): Promise<string> {
  // GPT-5 and the o-series reasoning models reject `max_tokens` and any
  // non-default `temperature` — they use `max_completion_tokens` and temperature 1.
  // Older chat models (gpt-4o, gpt-4.1) take the classic shape. Pick per model.
  const isReasoning = /^(gpt-5|o\d)/i.test(o.model);
  const res = await openai().chat.completions.create({
    model: o.model,
    messages: [
      { role: "system", content: o.system },
      { role: "user", content: o.user },
    ],
    ...(isReasoning
      ? { max_completion_tokens: o.maxTokens ?? 2048 }
      : { max_tokens: o.maxTokens ?? 2048, temperature: o.temperature ?? 0 }),
  });
  return (res.choices[0]?.message?.content ?? "").trim();
}

/**
 * Neutralize the data-block delimiters in untrusted text so a malicious document
 * cannot close the data block and inject instructions (spec §14). Used on all
 * source-derived text before it is embedded in a prompt.
 */
export function stripDelims(s: string): string {
  return s.replace(/<\/?\s*(?:SEGMENTS|SOURCE|TRANSLATION|DATA)\s*>/gi, " ");
}

// JSON forbids raw control characters (newline, tab, CR, …) INSIDE string values,
// but models routinely emit them — e.g. a Chinese translation that keeps its own
// paragraph line breaks — which makes JSON.parse throw even though the reply is
// otherwise complete and correct. Walk the text and \-escape control chars that
// sit inside a string literal (leaving structural whitespace between tokens alone),
// so a reply that is valid-except-for-raw-control-chars can be recovered.
function escapeControlCharsInStrings(s: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (escaped) {
      out += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      out += ch;
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      out += ch;
      continue;
    }
    if (inString) {
      if (ch === "\n") { out += "\\n"; continue; }
      if (ch === "\r") { out += "\\r"; continue; }
      if (ch === "\t") { out += "\\t"; continue; }
      const code = ch.charCodeAt(0);
      if (code < 0x20) { out += `\\u${code.toString(16).padStart(4, "0")}`; continue; }
    }
    out += ch;
  }
  return out;
}

/** Parse a JSON array/object from a model response, tolerating code fences and
 *  raw control characters inside string values. */
export function parseJsonLoose<T>(raw: string): T | null {
  let s = raw.trim();
  // strip ```json ... ``` fences
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  // grab the outermost array or object if there is surrounding prose
  const firstArr = s.indexOf("[");
  const firstObj = s.indexOf("{");
  const start =
    firstArr === -1 ? firstObj : firstObj === -1 ? firstArr : Math.min(firstArr, firstObj);
  if (start > 0) s = s.slice(start);
  const lastArr = s.lastIndexOf("]");
  const lastObj = s.lastIndexOf("}");
  const end = Math.max(lastArr, lastObj);
  if (end >= 0) s = s.slice(0, end + 1);
  try {
    return JSON.parse(s) as T;
  } catch {
    // Most common recoverable failure: raw control chars inside a string value.
    // Only attempt the repair on failure, so valid JSON is never touched.
    try {
      return JSON.parse(escapeControlCharsInStrings(s)) as T;
    } catch {
      return null;
    }
  }
}
