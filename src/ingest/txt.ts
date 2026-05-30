/**
 * Plain-text / markdown ingestion (MVP, spec §7). Blockify by blank-line
 * paragraphs; recognise markdown headings and list items. Each parsed unit
 * becomes a doc-model block with an inferred type.
 */
import { type BlockType, type Block, newBlock } from "@/src/lib/doc-model";

function blockId(n: number): string {
  return `b-${String(n).padStart(3, "0")}`;
}

const LIST_RE = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/;
const HEADING_RE = /^(#{1,6})\s+(.*)$/;

export function blockifyText(text: string): Block[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let n = 0;
  let para: string[] = [];

  const flush = () => {
    if (para.length === 0) return;
    const content = para.join(" ").trim();
    if (content) blocks.push(newBlock({ id: blockId(++n), type: "body", source_text: content }));
    para = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.trim() === "") {
      flush();
      continue;
    }
    const h = line.match(HEADING_RE);
    if (h) {
      flush();
      const level = h[1].length;
      const type: BlockType = level === 1 ? "title" : "subhead";
      blocks.push(newBlock({ id: blockId(++n), type, source_text: h[2].trim(), style: { level } }));
      continue;
    }
    const li = line.match(LIST_RE);
    if (li) {
      flush();
      blocks.push(newBlock({ id: blockId(++n), type: "list_item", source_text: li[1].trim() }));
      continue;
    }
    para.push(line.trim());
  }
  flush();
  return blocks;
}
