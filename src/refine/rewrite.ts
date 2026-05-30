/**
 * Targeted rewrite step of the gated loop (spec §9). The critic returns
 * STRUCTURED error spans; the rewriter is given those spans and asked to fix
 * ONLY them — never a free-form "make it better". Live path = Claude; fixture
 * path deterministically applies each flag's suggested replacement, so the
 * refine step demonstrably improves flagged text even with no API key.
 */
import { getModels } from "@/src/lib/config";
import type { CriticFlag } from "@/src/lib/doc-model";
import { anthropicAvailable, anthropicComplete, parseJsonLoose, stripDelims } from "@/src/providers/clients";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Categories where a blind single-token swap is SAFE without a real model.
// number/accuracy/fluency need genuine re-translation, so the deterministic
// fixer leaves them for the live model OR routes them to a human (it must never
// e.g. turn "mil billones" into "mil mil millones").
const SAFE_DETERMINISTIC = new Set(["regionalism", "terminology", "locale"]);

/** Deterministic fixer: replace each safely-swappable flagged span with its suggestion. */
export function applySuggestions(current: string, flags: CriticFlag[]): string {
  let out = current;
  for (const f of flags) {
    if (!SAFE_DETERMINISTIC.has(f.category)) continue;
    const span = (f.span || "").trim();
    const sugg = (f.suggestion || "").trim();
    if (!span || !sugg || span === sugg) continue;
    // Only apply suggestions that look like a term (short, no sentence punctuation).
    if (sugg.length > 60 || /[.;:]/.test(sugg)) continue;
    out = out.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(span)}(?![\\p{L}\\p{N}])`, "giu"), sugg);
  }
  return out;
}

export async function rewriteSegment(
  current: string,
  source: string,
  flags: CriticFlag[],
): Promise<string> {
  if (flags.length === 0) return current;

  if (anthropicAvailable()) {
    try {
      const models = getModels();
      const flagList = flags
        .map((f) => `- [${f.category}/${f.severity}] span="${f.span}" → "${f.suggestion}"`)
        .join("\n");
      const system = [
        "You correct a neutral Latin-American Spanish (es-419) financial translation.",
        "Apply ONLY the listed corrections. Do not otherwise rewrite acceptable text.",
        "Preserve all numbers, %, dates, currencies and DNT tokens exactly.",
        'Return ONLY JSON: {"es":"<corrected translation>"}',
      ].join("\n");
      const user = `<SOURCE>${stripDelims(source)}</SOURCE>\n<TRANSLATION>${stripDelims(current)}</TRANSLATION>\nCORRECTIONS:\n${flagList}`;
      const raw = await anthropicComplete({
        model: models.translator.model,
        temperature: 0.1,
        maxTokens: models.translator.max_tokens,
        system,
        user,
      });
      const parsed = parseJsonLoose<{ es: string }>(raw);
      if (parsed?.es && parsed.es.trim()) return parsed.es.trim();
    } catch {
      /* fall through to deterministic */
    }
  }
  return applySuggestions(current, flags);
}
