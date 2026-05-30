/**
 * Minimal type shim for the OPTIONAL Phase-3 dependency `pdf-parse`.
 * The core build (txt/docx) does not require the package to be installed;
 * src/ingest/pdf.ts dynamically imports it and fails gracefully if absent.
 * To enable PDF ingestion: `npm i pdf-parse`.
 */
declare module "pdf-parse" {
  interface PdfParseResult {
    text: string;
    numpages: number;
    info?: unknown;
    metadata?: unknown;
  }
  function pdfParse(dataBuffer: Buffer): Promise<PdfParseResult>;
  export default pdfParse;
}
