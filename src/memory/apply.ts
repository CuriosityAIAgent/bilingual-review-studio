/**
 * Deterministic application of governed memory to translated text (spec §13).
 *
 * ACTIVE/APPROVED neutralization rules and the neutral glossary are HARD
 * constraints, so we enforce them with a deterministic post-pass after
 * translation — independent of whether the translator was a live LLM or the
 * fixture. This is what makes a freshly-learned rule visibly take effect on the
 * next document (the flywheel), and it is belt-and-suspenders for the live model.
 *
 * Crucially: only rules in state `active` or `approved` are applied. Proposed /
 * candidate / deprecated rules are NEVER applied (a bad rule would contaminate
 * future output — spec §13 risk).
 */
import type {
  GlossaryEntry,
  GlossaryHit,
  NeutralizationHit,
  NeutralizationRule,
} from "@/src/lib/doc-model";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Match `from` as a whole word/phrase (Unicode-aware), case-insensitive, also
 * matching a Spanish plural suffix so "ordenador" catches "ordenadores". */
function termRegex(from: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])(${escapeRegExp(from)})(es|s)?(?![\\p{L}\\p{N}])`, "giu");
}

/** Spanish pluralization: vowel-final → +s, consonant-final → +es. */
function pluralize(word: string): string {
  return /[aeiouáéíóú]$/i.test(word) ? `${word}s` : `${word}es`;
}

/** Preserve the capitalisation pattern of the matched text on the replacement. */
function matchCase(matched: string, replacement: string): string {
  if (matched.length === 0) return replacement;
  const isUpper = matched === matched.toUpperCase() && matched !== matched.toLowerCase();
  const isTitle = matched[0] === matched[0].toUpperCase();
  if (isUpper) return replacement.toUpperCase();
  if (isTitle) return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  return replacement;
}

function replaceTerm(text: string, from: string, to: string): { text: string; count: number } {
  let count = 0;
  const out = text.replace(termRegex(from), (full: string, _base: string, suffix?: string) => {
    count += 1;
    // If the source matched a plural, pluralize the neutral replacement to agree.
    return matchCase(full, suffix ? pluralize(to) : to);
  });
  return { text: out, count };
}

export function isApplicable(rule: NeutralizationRule): boolean {
  return rule.state === "active" || rule.state === "approved";
}

/** Apply active neutralization rules; returns rewritten text + hit records. */
export function applyRules(
  text: string,
  rules: NeutralizationRule[],
): { text: string; hits: NeutralizationHit[] } {
  let out = text;
  const hits: NeutralizationHit[] = [];
  for (const rule of rules.filter(isApplicable)) {
    const { text: rewritten, count } = replaceTerm(out, rule.regional_form, rule.neutral_form);
    if (count > 0) {
      out = rewritten;
      hits.push({
        rule_id: rule.id,
        regional_form: rule.regional_form,
        neutral_form: rule.neutral_form,
        applied: true,
      });
    }
  }
  return { text: out, hits };
}

/** Enforce the neutral glossary: replace forbidden variants with approved terms. */
export function applyGlossary(
  text: string,
  glossary: GlossaryEntry[],
): { text: string; hits: GlossaryHit[] } {
  let out = text;
  const hits: GlossaryHit[] = [];
  for (const entry of glossary) {
    // Only governed (active/approved) glossary entries are applied (spec §13).
    if (entry.state !== "active" && entry.state !== "approved") continue;
    let applied = false;
    for (const forbidden of entry.forbidden_terms ?? []) {
      const { text: rewritten, count } = replaceTerm(out, forbidden, entry.approved_target);
      if (count > 0) {
        out = rewritten;
        applied = true;
      }
    }
    // Record a hit if the approved target is present in the segment at all.
    if (applied || termRegex(entry.approved_target).test(out)) {
      hits.push({ source: entry.source, approved_target: entry.approved_target, applied });
    }
  }
  return { text: out, hits };
}
