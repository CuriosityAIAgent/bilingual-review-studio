import { describe, expect, it } from "vitest";
import { getLocale } from "@/src/lib/config";
import type { GlossaryEntry, NeutralizationRule } from "@/src/lib/doc-model";
import { extractEntities } from "@/src/prepare/entities";
import { currencyValidator } from "./currency";
import { dateValidator } from "./date";
import { disclaimerValidator } from "./disclaimer";
import { dntValidator } from "./dnt";
import { englishLeakageValidator } from "./english_leakage";
import { glossaryValidator } from "./glossary";
import { isValidIsin } from "./isin";
import { numberValidator } from "./number";
import { regionalismValidator } from "./regionalism";
import { tickerValidator } from "./ticker";
import type { ValidatorInput } from "./types";

const locale = getLocale("es-419");

function input(source: string, target: string, over: Partial<ValidatorInput> = {}): ValidatorInput {
  return {
    source,
    target,
    entities: extractEntities(source),
    locale,
    glossary: [],
    rules: [],
    dntTerms: [],
    blockType: "body",
    ...over,
  };
}

describe("number validator + billón trap", () => {
  it("PASSES when billion → mil millones and mantissa preserved", () => {
    const r = numberValidator(input("USD 1.2 billion in assets", "USD 1.2 mil millones en activos"));
    expect(r.status).toBe("pass");
  });
  it("FAILS the billón trap (billion → billones, plural)", () => {
    const r = numberValidator(input("USD 1.2 billion in assets", "USD 1.2 billones en activos"));
    expect(r.status).toBe("fail");
    expect(r.severity).toBe("critical");
    expect(r.issues.some((x) => x.expected === "mil millones")).toBe(true);
  });
  it("FAILS the billón trap (billion → billón, singular accented)", () => {
    const r = numberValidator(input("the firm manages 1 billion in assets", "la firma gestiona 1 billón en activos"));
    expect(r.status).toBe("fail");
    expect(r.severity).toBe("critical");
  });
  it("PASSES legitimate Spanish 'mil millones' for billion", () => {
    const r = numberValidator(input("USD 1 billion raised", "USD 1 mil millones recaudados"));
    expect(r.status).toBe("pass");
  });
  it("FLAGS trillón (trillion must be the house term billón)", () => {
    const r = numberValidator(input("3 trillion dollars", "3 trillones de dólares"));
    expect(r.status).toBe("fail");
  });
  it("FAILS a dropped negative sign", () => {
    const r = numberValidator(input("returns of -0.5% this quarter", "rendimientos de 0.5% este trimestre"));
    expect(r.status).toBe("fail");
  });
  it("FAILS a changed percentage", () => {
    const r = numberValidator(input("up 12.5% on the year", "subió 13.5% en el año"));
    expect(r.status).toBe("fail");
  });
  it("FAILS a dropped percent sign", () => {
    const r = numberValidator(input("up 12.5% on the year", "subió 12.5 en el año"));
    expect(r.status).toBe("fail");
  });
});

describe("currency validator", () => {
  it("FAILS when USD is dropped", () => {
    const r = currencyValidator(input("USD 1.2 billion", "1.2 mil millones"));
    expect(r.status).toBe("fail");
  });
});

describe("date validator", () => {
  it("FAILS a changed year", () => {
    const r = dateValidator(input("guidance for 2026", "guía para 2025"));
    expect(r.status).toBe("fail");
  });
  it("PASSES a preserved year with translated month", () => {
    const r = dateValidator(input("In March 2026", "En marzo de 2026"));
    expect(r.status).toBe("pass");
  });
});

describe("ticker validator", () => {
  it("FAILS when a ticker is dropped", () => {
    const r = tickerValidator(input("shares of Apple ($AAPL) rose", "las acciones de Apple subieron"));
    expect(r.status).toBe("fail");
  });
  it("PASSES when the ticker survives", () => {
    const r = tickerValidator(input("shares of Apple ($AAPL) rose", "las acciones de Apple ($AAPL) subieron"));
    expect(r.status).toBe("pass");
  });
});

describe("isin validator", () => {
  it("validates a real ISIN check digit", () => {
    expect(isValidIsin("US0378331005")).toBe(true); // Apple
    expect(isValidIsin("US0378331004")).toBe(false);
  });
});

describe("dnt validator", () => {
  it("FAILS when a DNT product name is translated away", () => {
    const r = dntValidator(
      input("powered by BlackRock Aladdin", "impulsado por Aladino de BlackRock", { dntTerms: ["BlackRock Aladdin"] }),
    );
    expect(r.status).toBe("fail");
  });
});

describe("glossary validator", () => {
  const glossary: GlossaryEntry[] = [{
    id: "g1", source: "yield curve", approved_target: "curva de rendimientos",
    forbidden_terms: ["curva de rendimiento"], locale: "es-419", state: "active",
  }];
  it("FAILS when a forbidden variant is used", () => {
    const r = glossaryValidator(input("the yield curve steepened", "la curva de rendimiento se empinó", { glossary }));
    expect(r.status).toBe("fail");
  });
  it("PASSES with the approved term", () => {
    const r = glossaryValidator(input("the yield curve steepened", "la curva de rendimientos se empinó", { glossary }));
    expect(r.status).toBe("pass");
  });
});

describe("regionalism validator", () => {
  it("FLAGS a Peninsular term (ordenador)", () => {
    const r = regionalismValidator(input("on the computer", "en el ordenador"));
    expect(r.status).toBe("fail");
  });
  it("flags a present regional term and suggests the neutral form from the active rule", () => {
    const rules: NeutralizationRule[] = [{
      id: "r1", regional_form: "ordenador", neutral_form: "computadora", reason: "neutral",
      locale: "es-419", state: "active", created_at: "", updated_at: "", hits: 0,
    }];
    const r = regionalismValidator(input("on the computer", "en el ordenador", { rules }));
    expect(r.status).toBe("fail");
    expect(r.issues.some((x) => x.expected === "computadora")).toBe(true);
  });
  it("does NOT flag a neutral term (post-pass already neutralized it)", () => {
    const r = regionalismValidator(input("on the computer", "en la computadora"));
    expect(r.status).toBe("pass");
  });
});

describe("disclaimer validator", () => {
  it("PASSES an exact TM match", () => {
    const r = disclaimerValidator(input("Past performance...", "El rendimiento pasado...", { blockType: "disclaimer", disclaimer: { status: "exact" } }));
    expect(r.status).toBe("pass");
  });
  it("FAILS a fuzzy match (route to Compliance)", () => {
    const r = disclaimerValidator(input("Past performance...", "El rendimiento pasado...", { blockType: "disclaimer", disclaimer: { status: "fuzzy" } }));
    expect(r.status).toBe("fail");
    expect(r.severity).toBe("major");
  });
  it("FAILS an unknown disclaimer (block publish)", () => {
    const r = disclaimerValidator(input("Some new legal text", "Texto legal nuevo", { blockType: "disclaimer", disclaimer: { status: "unknown" } }));
    expect(r.status).toBe("fail");
    expect(r.severity).toBe("critical");
  });
});

describe("english leakage validator", () => {
  it("FLAGS residual English", () => {
    const r = englishLeakageValidator(input("the growth market", "the growth mercado"));
    expect(r.status).toBe("fail");
  });
});

// ── Regression tests for the Codex review findings ────────────────────────────
describe("regression: scale + sign + governance", () => {
  it("[#1] FAILS billion downscaled to million (1 billion → 1 millón)", () => {
    const r = numberValidator(input("the firm manages 1 billion in assets", "la firma gestiona 1 millón en activos"));
    expect(r.status).toBe("fail"); // scale not preserved
  });
  it("[#2] FAILS a dropped sign on a scaled number (-5 million → 5 millones)", () => {
    const r = numberValidator(input("a loss of -5 million this year", "una pérdida de 5 millones este año"));
    expect(r.status).toBe("fail");
  });
  it("[#9] FAILS a wrong quarter ordinal (Q3 → primer trimestre)", () => {
    const r = dateValidator(input("results for Q3", "resultados del primer trimestre"));
    expect(r.status).toBe("fail");
  });
  it("[#9] PASSES the correct quarter ordinal (Q3 → tercer trimestre)", () => {
    const r = dateValidator(input("results for Q3", "resultados del tercer trimestre"));
    expect(r.status).toBe("pass");
  });
  it("[#10] a PROPOSED rule does NOT supply an auto-applicable suggestion", () => {
    const rules: NeutralizationRule[] = [{
      id: "p1", regional_form: "ordenador", neutral_form: "computadora", reason: "", locale: "es-419",
      state: "proposed", created_at: "", updated_at: "", hits: 0,
    }];
    const r = regionalismValidator(input("on the computer", "en el ordenador", { rules }));
    expect(r.status).toBe("fail");
    expect(r.issues[0]?.expected).toBeUndefined(); // no auto-suggest from ungoverned rule
  });
  it("[#5] a candidate-state glossary entry is NOT enforced", () => {
    const glossary: GlossaryEntry[] = [{
      id: "c1", source: "yield curve", approved_target: "curva de rendimientos",
      forbidden_terms: ["curva de rendimiento"], locale: "es-419", state: "candidate",
    }];
    const r = glossaryValidator(input("the yield curve", "la curva de rendimiento", { glossary }));
    expect(r.status).toBe("pass"); // candidate entries are not yet governed
  });
});
