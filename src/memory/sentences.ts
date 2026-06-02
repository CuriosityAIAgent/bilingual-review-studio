/**
 * Sentence segmentation for the semantic Train aligner.
 *
 * Paragraph-level alignment breaks on published EN/ES that are editorial
 * adaptations (reordered, merged, condensed). Matching at the SENTENCE level by
 * meaning needs sentences first. This splitter is deliberately conservative: it
 * biases AGAINST over-splitting, because an over-split fragment produces a bad
 * cross-lingual match. It never splits inside decimals ("1.5", "3.800"),
 * initialisms ("U.S.", "S.A."), or known abbreviations ("EE. UU.", "e.g.").
 *
 * It is not a linguistic parser and does not need to be — the high cosine floor
 * and the human preview downstream absorb the occasional imperfect boundary.
 */

// Tokens that, when they end a fragment, mean the period is NOT a sentence end.
const ABBREV = new Set([
  "ee", "uu", "ee.uu", "us", "uk", "eu", "etc", "vs", "no", "núm", "nro", "art",
  "p.ej", "ej", "fig", "pág", "aprox", "av", "avda", "depto", "tel",
  "sr", "sra", "srta", "dr", "dra", "mr", "mrs", "ms", "jr", "st",
  "inc", "ltd", "ltda", "corp", "co", "s.a", "s.a.s", "llc", "plc",
  "i.e", "e.g", "cf", "al", // "et al"
]);

function isAbbrevEnding(fragment: string): boolean {
  const m = fragment.match(/(\S+)\.\s*$/);
  if (!m) return false;
  const tok = m[1].toLowerCase().replace(/[(),;:"'»«]+$/, "");
  if (ABBREV.has(tok)) return true;
  // Single initial ("J.", "A.") or dotted initialisms without trailing dot here
  // ("U.S" captured before the final period, "EE", "S.A").
  if (/^[a-záéíóúñ]$/.test(tok)) return true; // single letter
  if (/^[a-z](\.[a-z])+$/i.test(tok)) return true; // U.S , S.A , p.ej
  if (/^[a-z]{1,2}$/i.test(tok) && /^[A-ZÁÉÍÓÚÑ]/.test(m[1])) return true; // EE, UU
  return false;
}

/** Split one chunk (already rejoined to a single line) into sentences. */
function splitChunk(chunk: string): string[] {
  // Candidate breaks: end punctuation, optional closing quote/paren, whitespace,
  // then a capital / opening ¿¡ / quote / digit (start of the next sentence).
  const parts = chunk.split(/(?<=[.!?])["'»)\]]?\s+(?=[A-ZÁÉÍÓÚÑ0-9¿¡"'(])/);
  const out: string[] = [];
  for (const raw of parts) {
    const piece = raw.trim();
    if (!piece) continue;
    // Merge into the previous sentence if that one ended on an abbreviation or
    // initialism (the split was a false positive), or was too short to stand
    // alone as a sentence.
    if (out.length && (isAbbrevEnding(out[out.length - 1]) || out[out.length - 1].length < 12)) {
      out[out.length - 1] = `${out[out.length - 1]} ${piece}`;
    } else {
      out.push(piece);
    }
  }
  return out;
}

/** Segment text into sentences, never crossing a paragraph (blank-line) break.
 *  Hard-wrapped lines WITHIN a paragraph are rejoined first (a newline mid-
 *  paragraph is wrapping, not a sentence end), matching the ingester's block
 *  splitter — otherwise wrapped paste would yield mid-sentence fragments. */
export function toSentences(text: string): string[] {
  return text
    .split(/\n[ \t]*\n+/) // blank line = paragraph boundary
    .map((para) => para.replace(/\s*\n\s*/g, " ").trim()) // rejoin wrapped lines
    .filter(Boolean)
    .flatMap(splitChunk)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
