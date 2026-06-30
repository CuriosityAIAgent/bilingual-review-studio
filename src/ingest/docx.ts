/**
 * Clean Word (.docx) ingestion (MVP, spec §7). mammoth → HTML → blockify.
 * We extract block-level elements (headings, paragraphs, list items, table
 * cells) with a lightweight HTML scan — sufficient for clean, well-structured
 * documents. Complex tables / layout fidelity are deferred (spec §3, §5).
 */
import { type BlockType, type Block, newBlock } from "@/src/lib/doc-model";

function blockId(n: number): string {
  return `b-${String(n).padStart(3, "0")}`;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

const BLOCK_TAG_RE = /<(h[1-6]|p|li|td|th)\b[^>]*>([\s\S]*?)<\/\1>/gi;

export function blockifyHtml(html: string): Block[] {
  const blocks: Block[] = [];
  let n = 0;
  for (const m of html.matchAll(BLOCK_TAG_RE)) {
    const tag = m[1].toLowerCase();
    const text = stripTags(m[2]);
    if (!text) continue;
    let type: BlockType = "body";
    if (tag === "h1") type = "title";
    else if (/^h[2-6]$/.test(tag)) type = "subhead";
    else if (tag === "li") type = "list_item";
    else if (tag === "td" || tag === "th") type = "table_cell";
    const level = tag.startsWith("h") ? Number(tag[1]) : undefined;
    blocks.push(newBlock({ id: blockId(++n), type, source_text: text, style: level ? { level } : undefined }));
  }
  return blocks;
}

export async function blockifyDocx(buffer: Buffer): Promise<Block[]> {
  const mammoth = (await import("mammoth")).default;
  const { value: html } = await mammoth.convertToHtml({ buffer });
  return blockifyHtml(html);
}

/**
 * Bilingual TABLE import for the Train flow (spec §13). An SME supplies a Word
 * document whose two columns are English ↔ the translation, one segment pair per
 * row. The table rows ARE the alignment — the human paired them deliberately —
 * so we read them straight through rather than re-aligning two text blobs, which
 * preserves the SME's intended pairing exactly. Source text is data, never
 * instructions: it is only read into pairs and handed to the governed TM import.
 *
 * Robustness rules (each closes a way TM could be silently corrupted):
 *  - Tables are processed INDIVIDUALLY. A header row is detected per table, and
 *    column orientation is decided per table from its DATA rows only.
 *  - Orientation counts non-ASCII LETTERS (CJK ideographs, accented Latin), not
 *    punctuation — so Word smart quotes / en-dashes / NBSP on the English side
 *    can't flip the columns.
 *  - For a Chinese target (`expectCjk`), only tables that actually contain CJK
 *    are imported — so a fund document's returns / fee / layout tables don't get
 *    folded in as bogus "translation" pairs.
 */
export interface DocxTableImport {
  /** English → translation, in document order (the SME's row pairing). */
  pairs: { source: string; target: string }[];
  /** Tables seen in the document. */
  tables: number;
  /** Tables ignored because they carried no translation script (Chinese target). */
  skippedTables: number;
  rowsSeen: number;
  /** A header row ("English | Chinese") was detected and skipped in some table. */
  headerSkipped: boolean;
  /** Rows we couldn't use (a single column, or one side empty). */
  droppedRows: number;
  /** Some imported table had the translation in its LEFT column (order is detected). */
  columnSwapped: boolean;
  /** Any CJK ideographs present at all — drives the wrong-file/wrong-language warning. */
  cjkDetected: boolean;
  /** True only if every imported table's column order was distinguishable by
   *  script. False when a table looked like the same script on both sides (e.g.
   *  an accent-free Latin↔Latin table), where order is a fall-back guess. */
  columnConfident: boolean;
  /** Pairs were capped at MAX_PAIRS; the rest of the document was not imported. */
  truncated: boolean;
}

/** Hard cap so a malicious or runaway document can't build an unbounded pair
 *  list (paired with the route's upload-size cap). 5k glossary pairs is ample. */
const MAX_PAIRS = 5000;

const TABLE_RE = /<table\b[^>]*>([\s\S]*?)<\/table>/gi;
const ROW_RE = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
const CELL_RE = /<(td|th)\b[^>]*>([\s\S]*?)<\/\1>/gi;
// Han script — Simplified and Traditional share it, across every CJK block and
// extension. The Unicode property is unambiguous (a literal range risks matching
// look-alike code points like Hangul); it deliberately excludes Hangul / kana.
const HAN_RE = /\p{Script=Han}/u;
// Column-header labels. A row is treated as a header only when BOTH cells match
// (so a real first row like "Term → 术语" or "ETF → ETF", where only one side is
// a label word, is never dropped as a header).
const HEADER_TERMS = /^(english|source(\s*(text|term))?|term|en|spanish|espa[ñn]ol|chinese|simplified|traditional|translation|target|zh|zh-?hans|zh-?hant|中文|简体|简体中文|繁體|繁体|繁體中文|英文|译文|翻译|源文|目标|对照)$/i;

function hanCount(s: string): number {
  let n = 0;
  for (const ch of s) if (HAN_RE.test(ch)) n++;
  return n;
}

function asciiLetters(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122)) n++;
  }
  return n;
}

/** Count of non-ASCII LETTERS — the translation-script "weight" of a cell, used
 *  to orient a Latin-target (Spanish) table by accents. Punctuation, digits,
 *  NBSP and Word smart quotes are NOT letters, so typography can't flip columns. */
function foreignLetters(s: string): number {
  let n = 0;
  for (const ch of s) {
    if (/\p{L}/u.test(ch) && (ch.codePointAt(0) ?? 0) > 127) n++;
  }
  return n;
}

/** A table cell's text — paragraph/line breaks within the cell are preserved as
 *  newlines so a multi-line cell stays one segment with its structure intact. */
function cellText(html: string): string {
  const withBreaks = html.replace(/<\/(p|div|li)>/gi, "\n").replace(/<br\s*\/?>/gi, "\n");
  return decodeEntities(withBreaks.replace(/<[^>]+>/g, ""))
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function isHeaderRow(a: string, b: string): boolean {
  return HEADER_TERMS.test(a.trim()) && HEADER_TERMS.test(b.trim());
}

interface TableResult {
  pairs: { source: string; target: string }[];
  headerSkipped: boolean;
  droppedRows: number;
  swapped: boolean;
  confident: boolean;
  /** Han characters anywhere in the table (header included) — for the wrong-file warning. */
  han: number;
  /** Whether this table is a usable bilingual pair-source for the target. */
  included: boolean;
}

/** Turn one table's [left, right] cell rows into oriented pairs. For a Chinese
 *  target we require a clear English↔Han column split (one column mostly ASCII
 *  letters, the other mostly Han) — so a fund document's returns / fee / holdings
 *  tables (digits, or Chinese in both columns) are excluded rather than folded in
 *  as bogus pairs. For a Latin target we orient by accents and include the table,
 *  leaning on the confidence flag + commit-gating for ambiguous cases. */
function processTable(rows: [string, string][], expectCjk: boolean): TableResult {
  let headerSkipped = false;
  let droppedRows = 0;
  const hanAll = rows.reduce((n, [a, b]) => n + hanCount(a) + hanCount(b), 0);
  // A header, if present, is the table's first row and must not influence
  // orientation — strip it before measuring the columns.
  let data = rows;
  if (rows.length > 0 && isHeaderRow(rows[0][0], rows[0][1])) {
    headerSkipped = true;
    data = rows.slice(1);
  }

  let latinL = 0, latinR = 0, hanL = 0, hanR = 0, foreignL = 0, foreignR = 0;
  for (const [a, b] of data) {
    latinL += asciiLetters(a); latinR += asciiLetters(b);
    hanL += hanCount(a); hanR += hanCount(b);
    foreignL += foreignLetters(a); foreignR += foreignLetters(b);
  }

  let swapped = false;
  let confident = true;
  let included = true;
  if (expectCjk) {
    const leftChinese = hanL > latinL && hanL > 0;
    const rightChinese = hanR > latinR && hanR > 0;
    const leftEnglish = latinL > hanL && latinL > 0;
    const rightEnglish = latinR > hanR && latinR > 0;
    if (leftChinese && rightEnglish) { swapped = true; }       // translation on the left
    else if (rightChinese && leftEnglish) { swapped = false; } // translation on the right
    else { included = false; }                                  // not a bilingual EN↔ZH table
  } else {
    swapped = foreignL > foreignR;
    confident = foreignL !== foreignR;
  }

  const pairs: { source: string; target: string }[] = [];
  if (included) {
    for (const [a, b] of data) {
      const source = swapped ? b : a;
      const target = swapped ? a : b;
      if (!source.trim() || !target.trim()) { droppedRows++; continue; }
      pairs.push({ source, target });
    }
  }
  return { pairs, headerSkipped, droppedRows, swapped, confident, han: hanAll, included };
}

export function tablePairsFromHtml(html: string, opts: { expectCjk?: boolean } = {}): DocxTableImport {
  const expectCjk = opts.expectCjk ?? false;
  let tables = 0;
  let skippedTables = 0;
  let rowsSeen = 0;
  let droppedRows = 0;
  let headerSkipped = false;
  let columnSwapped = false;
  let columnConfident = true;
  let cjkDetected = false;
  const pairs: { source: string; target: string }[] = [];

  for (const table of html.matchAll(TABLE_RE)) {
    tables++;
    const rows: [string, string][] = [];
    for (const row of table[1].matchAll(ROW_RE)) {
      rowsSeen++;
      const cells = [...row[1].matchAll(CELL_RE)].map((c) => cellText(c[2])).filter(Boolean);
      if (cells.length < 2) { droppedRows++; continue; }
      rows.push([cells[0], cells[1]]);
    }
    if (rows.length === 0) continue;

    const r = processTable(rows, expectCjk);
    if (r.han > 0) cjkDetected = true;
    // For a Chinese target, a table without a clear English↔Han column split is
    // not a bilingual glossary (it's a returns / fee / holdings / layout table) —
    // skip it rather than fold its first two columns in as bogus pairs.
    if (!r.included) {
      skippedTables++;
      continue;
    }
    headerSkipped = headerSkipped || r.headerSkipped;
    droppedRows += r.droppedRows;
    columnSwapped = columnSwapped || r.swapped;
    if (!r.confident) columnConfident = false;
    pairs.push(...r.pairs);
  }

  const truncated = pairs.length > MAX_PAIRS;
  return {
    pairs: truncated ? pairs.slice(0, MAX_PAIRS) : pairs,
    tables,
    skippedTables,
    rowsSeen,
    headerSkipped,
    droppedRows,
    columnSwapped,
    cjkDetected,
    columnConfident,
    truncated,
  };
}

export async function tablePairsFromDocx(buffer: Buffer, opts: { expectCjk?: boolean } = {}): Promise<DocxTableImport> {
  const mammoth = (await import("mammoth")).default;
  const { value: html } = await mammoth.convertToHtml({ buffer });
  return tablePairsFromHtml(html, opts);
}
