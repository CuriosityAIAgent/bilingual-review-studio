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

export async function anthropicComplete(o: CompleteOpts): Promise<string> {
  const res = await anthropic().messages.create({
    model: o.model,
    max_tokens: o.maxTokens ?? 4096,
    temperature: o.temperature ?? 0.2,
    system: o.system,
    messages: [{ role: "user", content: o.user }],
  });
  return res.content
    .map((c) => (c.type === "text" ? c.text : ""))
    .join("")
    .trim();
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

/** Parse a JSON array/object from a model response, tolerating code fences. */
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
    return null;
  }
}
