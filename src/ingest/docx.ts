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
