/** Validator registry + runner (spec §10). Runs all deterministic validators
 * over a block and returns their results. The quality gate (spec §15) reads
 * these; `blocking` failures prevent auto-pass. Validators are authoritative —
 * unlike QE, which is a routing signal only. */
import type { ValidatorResult } from "@/src/lib/doc-model";
import { currencyValidator } from "./currency";
import { dateValidator } from "./date";
import { disclaimerValidator } from "./disclaimer";
import { dntValidator } from "./dnt";
import { englishLeakageValidator } from "./english_leakage";
import { glossaryValidator } from "./glossary";
import { isinValidator } from "./isin";
import { numberValidator } from "./number";
import { regionalismValidator } from "./regionalism";
import { scriptConsistencyValidator } from "./script_consistency";
import { tickerValidator } from "./ticker";
import type { ValidatorFn, ValidatorInput } from "./types";

export const VALIDATORS: ValidatorFn[] = [
  numberValidator,
  currencyValidator,
  dateValidator,
  tickerValidator,
  isinValidator,
  dntValidator,
  glossaryValidator,
  regionalismValidator,
  disclaimerValidator,
  englishLeakageValidator,
  scriptConsistencyValidator, // self-gates: only acts on Chinese targets (script field)
];

export function runValidators(input: ValidatorInput): ValidatorResult[] {
  return VALIDATORS.map((v) => v(input));
}

export function anyBlockingFailure(results: ValidatorResult[]): boolean {
  return results.some((r) => r.status === "fail" && r.blocking);
}

export * from "./types";
