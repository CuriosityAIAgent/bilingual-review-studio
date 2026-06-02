import { describe, expect, it } from "vitest";
import { toSentences } from "./sentences";

describe("toSentences", () => {
  it("splits plain sentences", () => {
    expect(toSentences("The market rose. Investors cheered loudly.")).toEqual([
      "The market rose.",
      "Investors cheered loudly.",
    ]);
  });

  it("does not split inside decimals or thousands separators", () => {
    // 1.5 (EN decimal) and 3.800 (ES thousands) must stay intact.
    expect(toSentences("Demand reached 1.5 trillion units.")).toHaveLength(1);
    expect(toSentences("Exportó 3.800 millones de dólares el año pasado.")).toHaveLength(1);
  });

  it("does not split on initialisms or known abbreviations", () => {
    expect(toSentences("Spending in the U.S. exceeded forecasts.")).toHaveLength(1);
    expect(toSentences("El gasto en EE. UU. superó las previsiones.")).toHaveLength(1);
  });

  it("never crosses a paragraph (blank-line) break", () => {
    const out = toSentences("First para sentence.\n\nSecond para sentence.");
    expect(out).toEqual(["First para sentence.", "Second para sentence."]);
  });

  it("handles Spanish opening punctuation as a sentence start", () => {
    const out = toSentences("Es válido preguntar. ¿Está el mercado sobrevaluado hoy?");
    expect(out).toHaveLength(2);
    expect(out[1].startsWith("¿")).toBe(true);
  });
});
