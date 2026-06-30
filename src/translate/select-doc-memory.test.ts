import { describe, expect, it } from "vitest";
import type { TmEntry } from "@/src/lib/doc-model";
import { type TranslateSegment, selectDocMemory } from "./translator";

function tm(id: string, source: string, target: string): TmEntry {
  return { id, source_text: source, target_text: target, locale: "zh-Hans", kind: "segment", version: 1, created_at: "2026-06-01T00:00:00Z" } as TmEntry;
}

describe("selectDocMemory — per-document example budget", () => {
  it("awards the budget to the strongest matches regardless of document position", () => {
    // One approved entry. Segment b0 is FIRST but only a ~0.9 match; b1..b40 are
    // exact (1.0). With the 40-example budget, the weaker FIRST segment must be
    // starved while every exact match (even the LAST) is kept — i.e. match
    // quality wins the budget over document position.
    const exact = "alpha beta gamma delta epsilon zeta eta theta iota kappa";
    const entries = [tm("e1", exact, "STRONG")];
    const segs: TranslateSegment[] = [
      { id: "b0", source_text: "alpha beta gamma delta epsilon zeta eta theta iota OMEGA", dnt: false },
    ];
    for (let i = 1; i <= 40; i++) segs.push({ id: `b${i}`, source_text: exact, dnt: false });

    const m = selectDocMemory(segs, entries, "zh-Hans");
    const total = [...m.values()].reduce((n, a) => n + a.length, 0);
    expect(total).toBe(40); // budget respected
    expect(m.has("b0")).toBe(false); // weaker FIRST segment starved out
    expect(m.get("b40")?.[0].target).toBe("STRONG"); // exact LAST segment kept
  });

  it("returns nothing when there is no memory", () => {
    expect(selectDocMemory([{ id: "b1", source_text: "hello", dnt: false }], []).size).toBe(0);
  });

  it("skips DNT segments", () => {
    const entries = [tm("e1", "Net asset value", "资产净值")];
    const m = selectDocMemory([{ id: "b1", source_text: "Net asset value", dnt: true }], entries, "zh-Hans");
    expect(m.has("b1")).toBe(false);
  });
});
