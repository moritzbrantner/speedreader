import type { ReadingDocument as SharedReadingDocument } from "@moritzbrantner/speed-reading/document";

export { isReadingDocument } from "@moritzbrantner/speed-reading/document";
export type {
  CleanupDiagnostic,
  DocumentColumn,
  DocumentPageLayout,
  DocumentPixelRegion,
  DocumentPixelSize,
  DocumentReadingOrder,
  DocumentReadingOrderStrategy,
  DocumentTextEvidence,
  DocumentTextRegion,
  DocumentTextRole,
  ExtractedPage,
  OcrRegionEvidence,
  ReadingDocument,
} from "@moritzbrantner/speed-reading/document";

export type PdfDocumentSource = Readonly<{
  name: string;
  uri: string;
}>;

export type PdfExtractionResult =
  | Readonly<{ status: "extracted"; document: SharedReadingDocument }>
  | Readonly<{ status: "error"; message: string }>;

export type PdfExtractionAdapter = Readonly<{
  extractPdf: (source: PdfDocumentSource) => Promise<PdfExtractionResult>;
}>;
