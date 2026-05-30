/**
 * PDF ingestion (Phase 3, spec §7). Clean (text-layer) PDFs are extracted and
 * blockified by paragraph. Scanned PDFs require OCR — flagged honestly here as
 * reduced fidelity rather than silently producing garbage (spec §3 guarantee).
 *
 * Layout fidelity, tables, and figures are Phase 4 (spec §5). This produces a
 * REFLOWED reading order, not a layout-faithful reconstruction.
 */
import type { Block } from "@/src/lib/doc-model";
import { blockifyText } from "./txt";

export interface PdfIngestResult {
  blocks: Block[];
  pages: number;
  ocr_used: boolean;
}

export async function blockifyPdf(buffer: Buffer): Promise<PdfIngestResult> {
  let pdfParse: (b: Buffer) => Promise<{ text: string; numpages: number }>;
  try {
    // Variable specifier keeps this OPTIONAL (txt/docx-only deploys don't need
    // pdf-parse) and opaque to the bundler, so the core build stays clean.
    const pkg = ["pdf", "parse"].join("-");
    pdfParse = (await import(pkg)).default as typeof pdfParse;
  } catch {
    throw new Error(
      "PDF ingestion requires the optional dependency `pdf-parse` (Phase 3). Run `npm i pdf-parse`.",
    );
  }
  const { text, numpages } = await pdfParse(buffer);
  const trimmed = (text || "").trim();
  if (!trimmed) {
    // No extractable text layer → almost certainly a scanned PDF needing OCR.
    throw new Error(
      "No text layer found — this looks like a scanned PDF. OCR (PaddleOCR/Docling) is a later phase; " +
        "reduced-fidelity OCR ingestion is not enabled in this build.",
    );
  }
  // Reconstruct paragraphs: collapse single newlines, treat blank lines as breaks.
  const normalized = trimmed.replace(/([^\n])\n(?!\n)/g, "$1 ");
  return { blocks: blockifyText(normalized), pages: numpages, ocr_used: false };
}
