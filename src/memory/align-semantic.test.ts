import { describe, expect, it, vi } from "vitest";

// Mock the embedding model with deterministic unit vectors keyed by content, so
// the aligner's matching logic is tested without loading the real ONNX model.
// "alpha"≈[1,0], "beta"≈[0,1], "gamma"≈45° (cosine 0.707 to either axis → below
// the 0.78 floor → unmatched).
vi.mock("@/src/evaluate/qe-model", () => ({
  embedMany: async (texts: string[]) =>
    texts.map((t) => {
      const s = t.toLowerCase();
      if (s.includes("alpha") || s.includes("alfa")) return [1, 0];
      if (s.includes("beta")) return [0, 1];
      return [0.7071, 0.7071]; // gamma / unrelated
    }),
}));

import { alignBilingualSemantic } from "./align";

describe("alignBilingualSemantic", () => {
  it("matches by meaning across reordering and drops low-confidence sentences", async () => {
    // EN order: alpha, beta, gamma. ES order: beta, alpha (reordered, gamma absent).
    const en = "Alpha leads the way. Beta follows behind. Gamma wanders off alone.";
    const es = "Beta viene después. Alfa encabeza todo.";
    const r = await alignBilingualSemantic(en, es);

    expect(r.method).toBe("semantic");
    expect(r.pairs).toHaveLength(2);
    // Presented in source order: alpha first, beta second — matched to the
    // correct ES sentence despite the reordering.
    expect(r.pairs[0].source.toLowerCase()).toContain("alpha");
    expect(r.pairs[0].target.toLowerCase()).toContain("alfa");
    expect(r.pairs[1].source.toLowerCase()).toContain("beta");
    expect(r.pairs[1].target.toLowerCase()).toContain("beta");
    expect(r.pairs[0].score).toBeGreaterThanOrEqual(0.78);
    // Gamma had no confident counterpart → surfaced, never paired.
    expect(r.sourceExtra.join(" ").toLowerCase()).toContain("gamma");
    expect(r.targetExtra).toEqual([]);
  });

  it("respects a stricter min_score override", async () => {
    const en = "Gamma one. Gamma two.";
    const es = "Gamma uno. Gamma dos.";
    // Even identical-topic gamma sentences sit at 1.0 to each other here (same
    // vector), so they DO match at default floor; raising the floor above 1
    // rejects everything.
    const r = await alignBilingualSemantic(en, es, 1.01);
    expect(r.pairs).toHaveLength(0);
    expect(r.sourceExtra.length).toBeGreaterThan(0);
  });
});
