export type ReadingDocument = Readonly<{
  version: 1;
  text: string;
  pages: readonly ExtractedPage[];
  diagnostics: readonly CleanupDiagnostic[];
}>;

export type DocumentTextRole =
  | "content"
  | "heading"
  | "caption"
  | "table"
  | "form"
  | "footnote"
  | "sidebar"
  | "header"
  | "footer"
  | "pageNumber";

export type DocumentTextEvidence =
  | "topMargin"
  | "bottomMargin"
  | "repeatedAcrossPages"
  | "numericOnly"
  | "sequentialPageNumber"
  | "ocrBlockHint"
  | "bottomPageBand"
  | "footnoteMarker"
  | "narrowLayoutColumn"
  | "pageEdge"
  | "parallelBodyColumn"
  | "secondaryColumnSupport";

export type DocumentPixelSize = Readonly<{
  width: number;
  height: number;
}>;

export type DocumentPixelRegion = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

export type DocumentColumn = Readonly<{
  index: number;
  bounds: DocumentPixelRegion;
  regionIndices: readonly number[];
}>;

export type DocumentPageLayout = Readonly<{
  columns: readonly DocumentColumn[];
}>;

export type OcrRegionEvidence = Readonly<{
  blockKind: string | null;
  confidence: number | null;
  region: DocumentPixelRegion | null;
}>;

export type DocumentTextRegion = Readonly<{
  sourceLineIndex: number;
  text: string;
  role: DocumentTextRole;
  confidence: number | null;
  evidence: readonly DocumentTextEvidence[];
  ocr?: OcrRegionEvidence | null;
  columnIndex?: number | null;
  includeInReading: boolean;
}>;

export type ExtractedPage = Readonly<{
  pageNumber: number;
  text: string;
  provenance: unknown;
  sourceImageSize?: DocumentPixelSize | null;
  layout?: DocumentPageLayout | null;
  regions?: readonly DocumentTextRegion[];
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
    "provenance" in value &&
    (!("sourceImageSize" in value) ||
      value.sourceImageSize === null ||
      isDocumentPixelSize(value.sourceImageSize)) &&
    (!("layout" in value) || value.layout === null || isDocumentPageLayout(value.layout)) &&
    (!("regions" in value) || (Array.isArray(value.regions) && value.regions.every(isDocumentTextRegion)))
  );
}

function isDocumentTextRegion(value: unknown): value is DocumentTextRegion {
  return (
    isRecord(value) &&
    Number.isInteger(value.sourceLineIndex) &&
    typeof value.text === "string" &&
    isDocumentTextRole(value.role) &&
    (value.confidence === null || Number.isInteger(value.confidence)) &&
    Array.isArray(value.evidence) &&
    value.evidence.every(isDocumentTextEvidence) &&
    (!("ocr" in value) || value.ocr === null || isOcrRegionEvidence(value.ocr)) &&
    (!("columnIndex" in value) ||
      value.columnIndex === null ||
      (Number.isInteger(value.columnIndex) && Number(value.columnIndex) >= 0)) &&
    typeof value.includeInReading === "boolean"
  );
}

function isDocumentPageLayout(value: unknown): value is DocumentPageLayout {
  return isRecord(value) && Array.isArray(value.columns) && value.columns.every(isDocumentColumn);
}

function isDocumentColumn(value: unknown): value is DocumentColumn {
  return (
    isRecord(value) &&
    Number.isInteger(value.index) &&
    Number(value.index) >= 0 &&
    isDocumentPixelRegion(value.bounds) &&
    Array.isArray(value.regionIndices) &&
    value.regionIndices.every((index) => Number.isInteger(index) && Number(index) >= 0)
  );
}

function isOcrRegionEvidence(value: unknown): value is OcrRegionEvidence {
  return (
    isRecord(value) &&
    (value.blockKind === null || typeof value.blockKind === "string") &&
    (value.confidence === null || Number.isInteger(value.confidence)) &&
    (value.region === null || isDocumentPixelRegion(value.region))
  );
}

function isDocumentPixelSize(value: unknown): value is DocumentPixelSize {
  return isRecord(value) && Number.isInteger(value.width) && Number.isInteger(value.height);
}

function isDocumentPixelRegion(value: unknown): value is DocumentPixelRegion {
  return (
    isRecord(value) &&
    Number.isInteger(value.x) &&
    Number.isInteger(value.y) &&
    Number.isInteger(value.width) &&
    Number.isInteger(value.height)
  );
}

function isDocumentTextRole(value: unknown): value is DocumentTextRole {
  return (
    value === "content" ||
    value === "heading" ||
    value === "caption" ||
    value === "table" ||
    value === "form" ||
    value === "footnote" ||
    value === "sidebar" ||
    value === "header" ||
    value === "footer" ||
    value === "pageNumber"
  );
}

function isDocumentTextEvidence(value: unknown): value is DocumentTextEvidence {
  return (
    value === "topMargin" ||
    value === "bottomMargin" ||
    value === "repeatedAcrossPages" ||
    value === "numericOnly" ||
    value === "sequentialPageNumber" ||
    value === "ocrBlockHint" ||
    value === "bottomPageBand" ||
    value === "footnoteMarker" ||
    value === "narrowLayoutColumn" ||
    value === "pageEdge" ||
    value === "parallelBodyColumn" ||
    value === "secondaryColumnSupport"
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
