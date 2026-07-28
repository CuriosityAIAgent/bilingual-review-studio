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

  it("fails loud when a single segment is still unreadable", async () => {
    process.env.ANTHROPIC_API_KEY = "test";
    complete.mockResolvedValue({ text: "not json at all", stopReason: "max_tokens" });
    await expect(translateSegments([seg("a", "one")], ctx())).rejects.toThrow(/unreadable response/);
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
