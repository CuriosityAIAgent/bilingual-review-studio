/**
 * Number-integrity validator (spec §10) — BLOCKING. Includes the billón trap.
 *
 * Policy (matches the translator instruction in Appendix A): numeric mantissas
 * are PRESERVED EXACTLY; only the scale WORD is translated. So "1.2 billion" →
 * "1.2 mil millones" keeps the mantissa "1.2". The validator therefore checks
 * that every source mantissa survives, and that scale words are translated
 * correctly — catching dropped negatives, changed digits, and the billón trap.
 */
import type { ValidatorResult } from "@/src/lib/doc-model";
import type { ValidatorFn, ValidatorInput } from "./types";

/** First numeric mantissa in a string, comma-thousands stripped, sign kept. */
function mantissaOf(text: string): string | null {
  const m = text.match(/-?\d[\d,]*\.?\d*/);
  if (!m) return null;
  return m[0].replace(/,/g, "");
}

/** All numeric mantissas present anywhere in a string. */
function allMantissas(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(/-?\d[\d,]*\.?\d*/g)) out.add(m[0].replace(/,/g, ""));
  return out;
}

export const numberValidator: ValidatorFn = (i: ValidatorInput): ValidatorResult => {
  const issues: ValidatorResult["issues"] = [];
  let severity: ValidatorResult["severity"] = "minor";

  const targetMantissas = allMantissas(i.target);

  // 1) Every numeric/percent/currency mantissa in the source survives.
  for (const e of i.entities) {
    if (e.kind !== "number" && e.kind !== "percent" && e.kind !== "currency") continue;
    const mant = mantissaOf(e.text);
    if (!mant) continue;
    if (!targetMantissas.has(mant)) {
      issues.push({
        span: e.text,
        message: `Numeric value "${e.text}" (mantissa ${mant}) not preserved in translation`,
        expected: mant,
      });
      severity = "critical";
    }
  }

  // 2) Percent markers preserved (count of % must not drop).
  const srcPct = (i.source.match(/%/g) || []).length;
  const tgtPct = (i.target.match(/%/g) || []).length;
  if (tgtPct < srcPct) {
    issues.push({ span: "%", message: `Percent sign dropped (${srcPct} → ${tgtPct})`, expected: `${srcPct} '%'` });
    severity = "critical";
  }

  // 3) The billón trap (critical, configurable via locale scale_terms).
  const srcLow = i.source.toLowerCase();
  const hasBillion = /\bbillions?\b/.test(srcLow);
  const hasTrillion = /\btrillions?\b/.test(srcLow);
  // The "billón" family in Spanish (billón / billones / billon) all denote 10^12.
  // English "billion" (10^9) must NEVER be rendered with any of them.
  const trapForm = i.target.match(/\bbill[oó]n(?:es)?\b/gi)?.[0];
  if (hasBillion && trapForm) {
    issues.push({
      span: trapForm,
      message: `English "billion" (10^9) mistranslated as "${trapForm}" (10^12 in Spanish). Use "${i.locale.scale_terms.billion}".`,
      expected: i.locale.scale_terms.billion,
      found: trapForm,
    });
    severity = "critical";
  }
  // Unaccented singular "billon" is a spelling error (correct singular is "billón").
  const badForm = i.target.match(/\bbillon\b/gi)?.[0];
  if (badForm) {
    issues.push({ span: badForm, message: 'Unaccented "billon" is incorrect; the Spanish singular is "billón".', expected: "billón" });
    if (severity !== "critical") severity = "major";
  }
  // "trillón/trillones" is not standard Spanish; trillion → the house term.
  if (hasTrillion && /\btrill[oó]n(?:es)?\b/i.test(i.target)) {
    issues.push({
      span: "trillón",
      message: `English "trillion" should be the house term "${i.locale.scale_terms.trillion}", not "trillón".`,
      expected: i.locale.scale_terms.trillion,
      found: "trillón",
    });
    severity = "critical";
  }

  return {
    validator: "number",
    status: issues.length ? "fail" : "pass",
    severity: issues.length ? severity : undefined,
    blocking: true,
    issues,
  };
};
