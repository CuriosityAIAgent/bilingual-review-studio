/**
 * Ingestion router (spec §7): upload → detect type → parse → blocks.
 * MVP supports txt/md and docx; pdf is Phase 3 (text-layer only).
 *
 * Security (spec §14): the returned text is UNTRUSTED DATA. Downstream prompts
 * isolate it in delimited data blocks; production additionally malware-scans
 * uploads before this stage.
 */
import type { Block } from "@/src/lib/doc-model";
import { blockifyDocx } from "./docx";
import { blockifyPdf } from "./pdf";
import { blockifyText } from "./txt";

export type SourceType = "txt" | "docx" | "pdf";

export interface IngestResult {
  blocks: Block[];
  type: SourceType;
  pages?: number;
  ocr_used: boolean;
}

export function detectType(filename: string): SourceType {
  const ext = filename.toLowerCase().split(".").pop();
  if (ext === "docx") return "docx";
  if (ext === "pdf") return "pdf";
  return "txt"; // txt, md, and unknown → plain text
}

export async function ingest(filename: string, buffer: Buffer): Promise<IngestResult> {
  const type = detectType(filename);
  if (type === "docx") {
    return { blocks: await blockifyDocx(buffer), type, ocr_used: false };
  }
  if (type === "pdf") {
    const { blocks, pages, ocr_used } = await blockifyPdf(buffer);
    return { blocks, type, pages, ocr_used };
  }
  return { blocks: blockifyText(buffer.toString("utf8")), type, ocr_used: false };
}

export { blockifyText } from "./txt";
export { blockifyHtml } from "./docx";
