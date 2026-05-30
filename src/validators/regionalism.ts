/** Regionalism validator (spec §10) — BLOCKS AUTO-PASS. Flags any Peninsular-only
 * or Mexican-only term PRESENT in the translation and supplies the neutral
 * alternative (from a rule, when one exists). Per spec, a regionalism requires
 * the neutral alternative before auto-pass — so we flag whenever the regional
 * term is present, regardless of rule state. In the pipeline the active-rule
 * post-pass removes governed terms first, so a flag here means it is genuinely
 * unresolved (no rule yet, or a rule that was not applied). This is what routes
 * a fresh clash to a human, who can then teach the rule (the flywheel). */
import type { ValidatorResult } from "@/src/lib/doc-model";
import type { ValidatorFn, ValidatorInput } from "./types";

/** Clean a locale flag entry like "móvil (→ celular)" → "móvil". */
function cleanTerm(raw: string): string {
  return raw.split("(")[0].trim().toLowerCase();
}

function hasWord(text: string, term: string): boolean {
  return new RegExp(`(?<![\\p{L}\\p{N}])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "iu").test(text);
}

export const regionalismValidator: ValidatorFn = (i: ValidatorInput): ValidatorResult => {
  const issues: ValidatorResult["issues"] = [];
  const flags = [
    ...(i.locale.regional_flags?.peninsular ?? []).map((t) => ({ term: cleanTerm(t), variant: "Peninsular" })),
    ...(i.locale.regional_flags?.mexican ?? []).map((t) => ({ term: cleanTerm(t), variant: "Mexican" })),
  ];
  for (const { term, variant } of flags) {
    if (!term || term.length < 3) continue;
    if (hasWord(i.target, term)) {
      // Only ACTIVE/APPROVED rules may supply `expected` — it feeds the
      // deterministic rewrite, so a proposed/deprecated (ungoverned) rule must
      // never auto-apply through this path (spec §13). Unresolved → route to human.
      const rule = i.rules.find(
        (r) => r.regional_form.toLowerCase() === term && (r.state === "active" || r.state === "approved"),
      );
      issues.push({
        span: term,
        message: `${variant}-only term "${term}" — neutralize for cross-market distribution`,
        expected: rule ? rule.neutral_form : undefined,
      });
    }
  }

  return {
    validator: "regionalism",
    status: issues.length ? "fail" : "pass",
    severity: issues.length ? "major" : undefined,
    // Blocks AUTO-PASS (routes to human) but is not a hard publish-block like disclaimers.
    blocking: true,
    issues,
  };
};
