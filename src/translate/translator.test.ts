import { afterEach, describe, expect, it, vi } from "vitest";
import { getLocale } from "@/src/lib/config";
import type { TranslateContext, TranslateSegment } from "./translator";

// Keep the real module (parseJsonLoose, stripDelims, anthropicAvailable) but stub
// the network call so we can simulate truncation / recovery deterministically.
const complete = vi.fn();
vi.mock("@/src/providers/clients", async (importActual) => {
  const actual = await importActual<typeof import("@/src/providers/clients")>();
  return {
    ...actual,
    anthropicAvailable: () => true,
    anthropicCompleteWithMeta: (o: unknown) => complete(o),
  };
});

// Imported AFTER the mock is registered so translator binds the stub.
const { translateSegments, batchSegments } = await import("./translator");

const seg = (id: string, source_text: string): TranslateSegment => ({ id, source_text, dnt: false });
const ctx = (): TranslateContext => ({ glossary: [], rules: [], locale: getLocale("es-419"), tm: [] });

// Extract the segment ids the stub was asked to translate from a call's payload.
function idsInCall(payload: string): string[] {
  const m = payload.match(/<DATA>([\s\S]*)<\/DATA>/);
  if (!m) return [];
  return (JSON.parse(m[1]).segments as { id: string }[]).map((s) => s.id);
}
// The longest source segment (`en`) a call carries — proxies output size so a
// stub can simulate "this call's output would overflow max_tokens".
function maxSourceLen(payload: string): number {
  const m = payload.match(/<DATA>([\s\S]*)<\/DATA>/);
  if (!m) return 0;
  const segs = JSON.parse(m[1]).segments as { en: string }[];
  return segs.reduce((n, s) => Math.max(n, s.en.length), 0);
}
// A well-formed translator reply for whatever ids the call carried.
const reply = (o: { user: string }) => ({
  text: JSON.stringify(idsInCall(o.user).map((id) => ({ id, es: `T:${id}` }))),
  stopReason: "end_turn",
});

afterEach(() => {
  complete.mockReset();
  process.env.ANTHROPIC_API_KEY = "";
});

describe("batchSegments", () => {
  it("keeps a small document in a single batch", () => {
    const b = batchSegments([seg("a", "short"), seg("b", "also short")]);
    expect(b).toHaveLength(1);
    expect(b[0].map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("splits when the character budget is exceeded", () => {
    const big = "x".repeat(2500);
    const b = batchSegments([seg("a", big), seg("b", big), seg("c", "tail")]);
    expect(b.length).toBeGreaterThan(1);
    // Every original segment appears exactly once, order preserved.
    expect(b.flat().map((s) => s.id)).toEqual(["a", "b", "c"]);
  });

  it("caps a batch at the segment count", () => {
    const many = Array.from({ length: 45 }, (_, i) => seg(`s${i}`, "t"));
    const b = batchSegments(many);
    expect(b.length).toBeGreaterThanOrEqual(3);
    expect(b.every((batch) => batch.length <= 20)).toBe(true);
  });
});

describe("translateSegments (live path)", () => {
  it("translates every segment on a clean response", async () => {
    process.env.ANTHROPIC_API_KEY = "test";
    complete.mockImplementation(reply);
    const out = await translateSegments([seg("a", "one"), seg("b", "two")], ctx());
    expect(out).toEqual({ a: "T:a", b: "T:b" });
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("splits and recovers when a multi-segment call truncates", async () => {
    process.env.ANTHROPIC_API_KEY = "test";
    // Truncate any call carrying >1 segment; succeed once the split reaches singles.
    complete.mockImplementation((o: { user: string }) => {
      const ids = idsInCall(o.user);
      if (ids.length > 1) return { text: '[{"id":"a","es":"cut', stopReason: "max_tokens" };
      return reply(o);
    });
    const out = await translateSegments([seg("a", "one"), seg("b", "two"), seg("c", "three")], ctx());
    expect(out).toEqual({ a: "T:a", b: "T:b", c: "T:c" });
  });

  it("ignores ids the model returns that don't belong to the batch", async () => {
    process.env.ANTHROPIC_API_KEY = "test";
    complete.mockImplementation((o: { user: string }) => {
      const items = idsInCall(o.user).map((id) => ({ id, es: `T:${id}` }));
      items.push({ id: "ghost", es: "hallucinated" }); // stray id in no batch
      return { text: JSON.stringify(items), stopReason: "end_turn" };
    });
    const out = await translateSegments([seg("a", "one"), seg("b", "two")], ctx());
    expect(out).toEqual({ a: "T:a", b: "T:b" });
    expect(out).not.toHaveProperty("ghost");
  });

  it("sub-splits and stitches a single oversized segment that truncates", async () => {
    process.env.ANTHROPIC_API_KEY = "test";
    // The whole-segment call overflows the cap (source > 80 chars); once the source
    // is split down to individual sentences each call fits and succeeds.
    complete.mockImplementation((o: { user: string }) => {
      if (maxSourceLen(o.user) > 80) return { text: '[{"id":"a","es":"cut', stopReason: "max_tokens" };
      return reply(o);
    });
    const long =
      "The first clause explains the strategy in detail. The second clause outlines the risks and the mitigations. The third clause states the disclaimer and the effective date.";
    const out = await translateSegments([seg("a", long)], ctx());
    // Stitched under the ORIGINAL id; synthetic sub-segment ids never leak.
    expect(Object.keys(out)).toEqual(["a"]);
    expect(out.a).toBe("T:a::s0 T:a::s1 T:a::s2");
  });

  it("stitches CJK sub-segments without inserting ASCII spaces", async () => {
    process.env.ANTHROPIC_API_KEY = "test";
    complete.mockImplementation((o: { user: string }) => {
      if (maxSourceLen(o.user) > 80) return { text: '[{"id":"a","es":"cut', stopReason: "max_tokens" };
      return reply(o);
    });
    // zh-* targets don't separate sentences with ASCII spaces — stitch with no gap.
    const zhCtx = (): TranslateContext => ({ glossary: [], rules: [], locale: getLocale("zh-Hans"), tm: [] });
    const long =
      "The first clause explains the strategy in detail. The second clause outlines the risks and the mitigations. The third clause states the disclaimer and the effective date.";
    const out = await translateSegments([seg("a", long)], zhCtx());
    expect(Object.keys(out)).toEqual(["a"]);
    expect(out.a).toBe("T:a::s0T:a::s1T:a::s2");
    expect(out.a).not.toContain(" ");
  });

  it("fails loud when a single unsplittable segment is still unreadable", async () => {
    process.env.ANTHROPIC_API_KEY = "test";
    // One sentence with no boundary to sub-split on → still fails loud.
    complete.mockResolvedValue({ text: "not json at all", stopReason: "max_tokens" });
    await expect(translateSegments([seg("a", "one")], ctx())).rejects.toThrow(/unreadable response/);
  });

  it("retries a single unparseable segment once and recovers", async () => {
    process.env.ANTHROPIC_API_KEY = "test";
    let n = 0;
    complete.mockImplementation((o: { user: string }) => {
      n++;
      if (n === 1) return { text: "Sure, here is the translation (no json)", stopReason: "end_turn" };
      return reply(o); // second attempt returns valid JSON
    });
    const out = await translateSegments([seg("a", "one")], ctx());
    expect(out).toEqual({ a: "T:a" });
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it("does not crash on a bare-object reply; the guard routes it to a retry", async () => {
    process.env.ANTHROPIC_API_KEY = "test";
    // Object instead of the instructed array (not truncated). The Array.isArray guard
    // avoids the "not iterable" crash and routes to the structured retry, which recovers.
    let n = 0;
    complete.mockImplementation((o: { user: string }) => {
      n++;
      if (n === 1) return { text: '{"id":"a","es":"x"}', stopReason: "end_turn" };
      return reply(o);
    });
    const out = await translateSegments([seg("a", "one")], ctx());
    expect(out).toEqual({ a: "T:a" });
  });

  it("fails loud when the retry is also unparseable", async () => {
    process.env.ANTHROPIC_API_KEY = "test";
    complete.mockResolvedValue({ text: "not json at all", stopReason: "end_turn" });
    await expect(translateSegments([seg("a", "one")], ctx())).rejects.toThrow(/unreadable response/);
  });

  it("surfaces a provider error on the retry as temporarily unavailable, not unreadable", async () => {
    process.env.ANTHROPIC_API_KEY = "test";
    let n = 0;
    complete.mockImplementation((o: { user: string }) => {
      n++;
      if (n === 1) return { text: "not json", stopReason: "end_turn" }; // first attempt unparseable
      throw new Error("503 upstream"); // retry hits a real provider outage
    });
    await expect(translateSegments([seg("a", "one")], ctx())).rejects.toThrow(/temporarily unavailable/);
  });

  it("surfaces a provider error as temporarily unavailable", async () => {
    process.env.ANTHROPIC_API_KEY = "test";
    complete.mockRejectedValue(new Error("429 rate limited"));
    await expect(translateSegments([seg("a", "one")], ctx())).rejects.toThrow(/temporarily unavailable/);
  });

  it("never calls the provider for DNT-only input", async () => {
    process.env.ANTHROPIC_API_KEY = "test";
    const out = await translateSegments([{ id: "d", source_text: "JPMorgan", dnt: true }], ctx());
    expect(out).toEqual({ d: "JPMorgan" });
    expect(complete).not.toHaveBeenCalled();
  });
});
