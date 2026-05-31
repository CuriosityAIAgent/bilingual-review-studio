import { describe, expect, it } from "vitest";
import { alignBilingual } from "./align";

describe("alignBilingual", () => {
  it("aligns paragraph-for-paragraph when counts match", () => {
    const en = "# Title\n\nFirst paragraph.\n\nSecond paragraph.";
    const es = "# Título\n\nPrimer párrafo.\n\nSegundo párrafo.";
    const r = alignBilingual(en, es);
    expect(r.pairs).toHaveLength(3);
    expect(r.pairs[0]).toEqual({ source: "Title", target: "Título" });
    expect(r.pairs[2]).toEqual({ source: "Second paragraph.", target: "Segundo párrafo." });
    expect(r.sourceExtra).toEqual([]);
    expect(r.targetExtra).toEqual([]);
  });

  it("flags the unaligned tail when the source has more blocks", () => {
    const en = "One.\n\nTwo.\n\nThree.";
    const es = "Uno.\n\nDos.";
    const r = alignBilingual(en, es);
    expect(r.pairs).toHaveLength(2);
    expect(r.sourceBlocks).toBe(3);
    expect(r.targetBlocks).toBe(2);
    expect(r.sourceExtra).toEqual(["Three."]);
    expect(r.targetExtra).toEqual([]);
  });

  it("flags the unaligned tail when the target has more blocks", () => {
    const r = alignBilingual("One.", "Uno.\n\nDos.");
    expect(r.pairs).toHaveLength(1);
    expect(r.targetExtra).toEqual(["Dos."]);
  });

  it("joins wrapped lines into one segment via the shared block splitter", () => {
    const r = alignBilingual("A wrapped\nline.", "Una línea\nenvuelta.");
    expect(r.pairs[0].source).toBe("A wrapped line.");
    expect(r.pairs[0].target).toBe("Una línea envuelta.");
  });

  it("returns no pairs for empty input", () => {
    expect(alignBilingual("", "").pairs).toHaveLength(0);
    expect(alignBilingual("   \n\n  ", "x").pairs).toHaveLength(0);
  });
});
