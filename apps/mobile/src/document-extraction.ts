export type ReadingDocument = Readonly<{
  version: 1;
  text: string;
  pages: readonly ExtractedPage[];
  diagnostics: readonly CleanupDiagnostic[];
}>;

export type ExtractedPage = Readonly<{
  pageNumber: number;
  text: string;
  provenance: unknown;
}>;

export type CleanupDiagnostic = Readonly<{
  kind: string;
  text: string;
  pages: readonly number[];
}>;

export type PdfDocumentSource = Readonly<{
  name: string;
  uri: string;
}>;

export type PdfExtractionResult =
  | Readonly<{ status: "extracted"; document: ReadingDocument }>
  | Readonly<{ status: "error"; message: string }>;

export type PdfExtractionAdapter = Readonly<{
  extractPdf: (source: PdfDocumentSource) => Promise<PdfExtractionResult>;
}>;

export function isReadingDocument(value: unknown): value is ReadingDocument {
  if (!isRecord(value) || value.version !== 1 || typeof value.text !== "string") return false;

  return (
    Array.isArray(value.pages) &&
    value.pages.every(isExtractedPage) &&
    Array.isArray(value.diagnostics) &&
    value.diagnostics.every(isCleanupDiagnostic)
  );
}

function isExtractedPage(value: unknown): value is ExtractedPage {
  return (
    isRecord(value) &&
    Number.isInteger(value.pageNumber) &&
    typeof value.text === "string" &&
    "provenance" in value
  );
}

function isCleanupDiagnostic(value: unknown): value is CleanupDiagnostic {
  return (
    isRecord(value) &&
    typeof value.kind === "string" &&
    typeof value.text === "string" &&
    Array.isArray(value.pages) &&
    value.pages.every((page) => Number.isInteger(page))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
