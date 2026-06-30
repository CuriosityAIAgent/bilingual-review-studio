import { describe, expect, it } from "vitest";
import type { TmEntry } from "@/src/lib/doc-model";
import { retrieveTmExamples } from "./retrieval";

function tm(over: Partial<TmEntry> & Pick<TmEntry, "source_text" | "target_text">): TmEntry {
  return {
    id: over.id ?? "tm_" + over.source_text.slice(0, 6),
    locale: over.locale ?? "zh-Hans",
    kind: over.kind ?? "segment",
    version: 1,
    created_at: "2026-06-01T00:00:00Z",
    ...over,
  } as TmEntry;
}

describe("retrieveTmExamples", () => {
  const mem: TmEntry[] = [
    tm({ source_text: "Past performance is not a guarantee of future results", target_text: "过往业绩并不保证未来表现" }),
    tm({ source_text: "Net asset value", target_text: "资产净值" }),
    tm({ source_text: "The fund's net asset value declined", target_text: "该基金的资产净值下降" }),
    tm({ source_text: "Completely unrelated sentence about weather", target_text: "天气" }),
  ];

  it("returns the most similar approved pairs, best first", () => {
    const out = retrieveTmExamples("Past performance is not a guarantee of future returns", mem, { topK: 2, floor: 0 });
    expect(out.length).toBe(2);
    expect(out[0].en).toBe("Past performance is not a guarantee of future results");
    expect(out[0].score).toBeGreaterThan(out[1].score);
    expect(out[0].score).toBeGreaterThan(0.9); // near-identical English
  });

  it("drops pairs below the similarity floor", () => {
    const out = retrieveTmExamples("Net asset value", mem, { floor: 0.9, topK: 5 });
    // Only the exact/near-exact "Net asset value" clears a 0.9 floor.
    expect(out.every((e) => e.score >= 0.9)).toBe(true);
    expect(out[0].en).toBe("Net asset value");
  });

  it("never returns disclaimers or superseded entries", () => {
    const withNoise: TmEntry[] = [
      ...mem,
      tm({ source_text: "Net asset value", target_text: "X", kind: "disclaimer", id: "d1" }),
      tm({ source_text: "Net asset value", target_text: "Y", superseded_by: "z", id: "s1" }),
    ];
    const out = retrieveTmExamples("Net asset value", withNoise, { floor: 0.99, topK: 5 });
    expect(out.map((e) => e.target)).toContain("资产净值");
    expect(out.map((e) => e.target)).not.toContain("X"); // disclaimer excluded
    expect(out.map((e) => e.target)).not.toContain("Y"); // superseded excluded
  });

  it("only considers the requested locale", () => {
    const mixed: TmEntry[] = [
      tm({ source_text: "Net asset value", target_text: "资产净值", locale: "zh-Hans" }),
      tm({ source_text: "Net asset value", target_text: "Valor liquidativo", locale: "es-419", id: "es1" }),
    ];
    const out = retrieveTmExamples("Net asset value", mixed, { locale: "zh-Hans", floor: 0.9 });
    expect(out.map((e) => e.target)).toEqual(["资产净值"]);
  });

  it("returns nothing when no pair clears the floor", () => {
    expect(retrieveTmExamples("xyzzy nothing alike", mem, { floor: 0.6 })).toEqual([]);
    expect(retrieveTmExamples("", mem)).toEqual([]);
  });
});
