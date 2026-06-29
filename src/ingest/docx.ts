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
 */
export interface DocxTableImport {
  /** English → translation, in document order (the SME's row pairing). */
  pairs: { source: string; target: string }[];
  tables: number;
  rowsSeen: number;
  /** A header row ("English | Chinese") was detected and skipped. */
  headerSkipped: boolean;
  /** Rows we couldn't use (a single column, or one side empty). */
  droppedRows: number;
  /** The translation column was the LEFT one (column order is detected, not assumed). */
  columnSwapped: boolean;
  /** Any CJK ideographs present at all — false means the wrong file/target language. */
  cjkDetected: boolean;
  /** Whether column order was distinguishable by script. False when both columns
   *  look like the same script (e.g. an accent-free Latin↔Latin table), where we
   *  fall back to the English-left convention and the caller should warn. */
  columnConfident: boolean;
}

const TABLE_RE = /<table\b[^>]*>([\s\S]*?)<\/table>/gi;
const ROW_RE = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
const CELL_RE = /<(td|th)\b[^>]*>([\s\S]*?)<\/\1>/gi;
// CJK unified ideographs (+ extension-A and compatibility) — shared by Simplified
// and Traditional, so it tells "Chinese column" from "English column" without
// caring which script. Used only to orient columns and spot a header row.
const CJK_RE = /[㐀-鿿豈-﫿]/g;

function cjkCount(s: string): number {
  return (s.match(CJK_RE) || []).length;
}

// Column-header labels skipped only when they sit in the FIRST row. Matched
// against a whole trimmed cell (case-insensitive) so real data like "ETF",
// "USD", or "S&P 500" — never header labels — is never dropped as a header.
const HEADER_TERMS = /^(english|source(\s*text)?|term|en|spanish|espa[ñn]ol|chinese|simplified|traditional|translation|target|zh|zh-?hans|zh-?hant|中文|简体|简体中文|繁體|繁体|繁體中文|英文|译文|目标)$/i;

/** Non-ASCII character count — the "foreignness" of a cell. English source is
 *  ~pure ASCII; a translation carries non-ASCII script (CJK ideographs for
 *  Chinese, accented letters for Spanish), so this orients columns for every
 *  target locale, not only Chinese. */
function nonAsciiCount(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) > 127) n++;
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

export function tablePairsFromHtml(html: string): DocxTableImport {
  // Gather every row's first two non-empty cells across all tables. Extra columns
  // (a notes or id column) are ignored; a row with fewer than two cells is dropped.
  const rows: [string, string][] = [];
  let tables = 0;
  let rowsSeen = 0;
  let droppedRows = 0;
  for (const table of html.matchAll(TABLE_RE)) {
    tables++;
    for (const row of table[1].matchAll(ROW_RE)) {
      rowsSeen++;
      const cells = [...row[1].matchAll(CELL_RE)].map((c) => cellText(c[2])).filter(Boolean);
      if (cells.length < 2) { droppedRows++; continue; }
      rows.push([cells[0], cells[1]]);
    }
  }
  if (rows.length === 0) {
    return { pairs: [], tables, rowsSeen, headerSkipped: false, droppedRows, columnSwapped: false, cjkDetected: false, columnConfident: true };
  }

  // Which column is the translation? The SOURCE is always English (~pure ASCII);
  // the translation carries non-ASCII script — CJK for Chinese, accented letters
  // for Spanish. Sum that "foreignness" per column across all rows and let the
  // column with more of it be the target, so order isn't assumed and detection
  // works for every target locale. On a tie (an accent-free Latin table) fall
  // back to the natural English-left convention.
  let leftForeign = 0;
  let rightForeign = 0;
  let cjk = 0;
  for (const [a, b] of rows) {
    leftForeign += nonAsciiCount(a);
    rightForeign += nonAsciiCount(b);
    cjk += cjkCount(a) + cjkCount(b);
  }
  const columnSwapped = leftForeign > rightForeign; // translation sits on the left
  const cjkDetected = cjk > 0;
  // Both columns the same script (typically accent-free Latin↔Latin): we can't
  // tell which side is the translation, so columnSwapped is a fall-back guess
  // (English-left), not a detection. The caller warns so nothing is saved blind.
  const columnConfident = leftForeign !== rightForeign;

  // Only the FIRST row is eligible to be a header, and only if a cell is an
  // explicit column label ("English" / "中文" / "Translation"). A no-CJK
  // heuristic would wrongly drop a real first row like "ETF → ETF" or
  // "S&P 500", so match header WORDS instead.
  const pairs: { source: string; target: string }[] = [];
  let headerSkipped = false;
  rows.forEach(([a, b], i) => {
    const source = columnSwapped ? b : a;
    const target = columnSwapped ? a : b;
    if (i === 0 && (HEADER_TERMS.test(source.trim()) || HEADER_TERMS.test(target.trim()))) { headerSkipped = true; return; }
    if (!source.trim() || !target.trim()) { droppedRows++; return; }
    pairs.push({ source, target });
  });

  return { pairs, tables, rowsSeen, headerSkipped, droppedRows, columnSwapped, cjkDetected, columnConfident };
}

export async function tablePairsFromDocx(buffer: Buffer): Promise<DocxTableImport> {
  const mammoth = (await import("mammoth")).default;
  const { value: html } = await mammoth.convertToHtml({ buffer });
  return tablePairsFromHtml(html);
}
