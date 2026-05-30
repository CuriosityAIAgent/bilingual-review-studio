import { describe, expect, it } from "vitest";
import type { GlossaryEntry, NeutralizationRule } from "@/src/lib/doc-model";
import { applyGlossary, applyRules } from "./apply";

const rule = (over: Partial<NeutralizationRule>): NeutralizationRule => ({
  id: "r", regional_form: "ordenador", neutral_form: "computadora", reason: "", locale: "es-419",
  state: "active", created_at: "", updated_at: "", hits: 0, ...over,
});

describe("applyRules", () => {
  it("applies an active rule (singular)", () => {
    const { text, hits } = applyRules("en el ordenador", [rule({})]);
    expect(text).toBe("en el computadora");
    expect(hits).toHaveLength(1);
  });
  it("[plural] matches a plural and pluralizes the neutral form", () => {
    const { text } = applyRules("acciones de ordenadores", [rule({})]);
    expect(text).toBe("acciones de computadoras"); // ordenador→computadora, plural agreed
  });
  it("does NOT apply a proposed rule", () => {
    const { text, hits } = applyRules("en el ordenador", [rule({ state: "proposed" })]);
    expect(text).toBe("en el ordenador");
    expect(hits).toHaveLength(0);
  });
  it("consonant-final neutral form pluralizes with -es", () => {
    const { text } = applyRules("los móviles", [rule({ regional_form: "móvil", neutral_form: "celular" })]);
    expect(text).toBe("los celulares");
  });
});

describe("applyGlossary", () => {
  const g: GlossaryEntry[] = [{
    id: "g", source: "yield curve", approved_target: "curva de rendimientos",
    forbidden_terms: ["curva de rendimiento"], locale: "es-419", state: "active",
  }];
  it("replaces a forbidden variant with the approved term", () => {
    const { text } = applyGlossary("la curva de rendimiento", g);
    expect(text).toBe("la curva de rendimientos");
  });
  it("ignores a candidate-state entry", () => {
    const { text } = applyGlossary("la curva de rendimiento", [{ ...g[0], state: "candidate" }]);
    expect(text).toBe("la curva de rendimiento");
  });
});
