import { describe, expect, it } from "vitest";
import { extractEntities, normalizeNumber } from "./entities";

describe("normalizeNumber", () => {
  it("expands scale words", () => {
    expect(normalizeNumber("1.2 billion")).toBe("1200000000");
    expect(normalizeNumber("3 trillion")).toBe("3000000000000");
    expect(normalizeNumber("250 million")).toBe("250000000");
  });
  it("strips thousands separators", () => {
    expect(normalizeNumber("1,234.56")).toBe("1234.56");
    expect(normalizeNumber("1,200")).toBe("1200");
  });
  it("keeps negatives", () => {
    expect(normalizeNumber("-0.5")).toBe("-0.5");
  });
});

describe("extractEntities", () => {
  it("finds percentages, numbers, years and currency", () => {
    const ents = extractEntities("In 2026 the fund returned 12.5% on USD 1.2 billion of assets.");
    const kinds = ents.map((e) => e.kind);
    expect(kinds).toContain("date"); // 2026
    expect(kinds).toContain("percent"); // 12.5%
    expect(kinds).toContain("currency"); // USD 1.2 billion
  });

  it("extracts an ISIN", () => {
    const ents = extractEntities("The note (US0378331005) matures in 2030.");
    expect(ents.some((e) => e.kind === "isin" && e.text === "US0378331005")).toBe(true);
  });

  it("does not double-count a year as a bare number", () => {
    const ents = extractEntities("2026");
    expect(ents).toHaveLength(1);
    expect(ents[0].kind).toBe("date");
  });
});
