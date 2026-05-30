# 7. Split Ingestion Path, DOCX-First

Status: Accepted

## Context

Structure extraction (ADR 0001) is only as good as the source format allows. DOCX carries an explicit, machine-readable structure: styles map to headings, real table grids, footnote relationships, and list semantics. PDF, by contrast, is a presentation format — structure must be *inferred* from layout heuristics, and scanned PDFs require OCR, which we refuse to run on numeric financial content (ADR 0001). Treating both formats through one generic pipeline forces the reliable path down to the unreliable path's quality.

## Decision

We split ingestion into two paths and prioritize DOCX. **DOCX path:** parse the OOXML directly, mapping styles and relationships to the canonical HTML block tree (ADR 0002) with high confidence and no OCR. **PDF path:** structure-recovery with explicit confidence scoring per block; born-digital PDFs with a real text layer proceed, while scanned/image PDFs are rejected at intake with guidance to supply DOCX or a text-layer PDF. Low-confidence blocks from either path are flagged for mandatory human structure review before translation.

## Consequences

- We can promise high fidelity for DOCX and set honest expectations for PDF.
- Clients are nudged toward DOCX, which improves end-to-end quality.
- The PDF confidence scorer becomes a maintained component; its thresholds are tunable and audited.
- No silent OCR corruption of figures; rejected sources fail loudly at intake, not downstream.
