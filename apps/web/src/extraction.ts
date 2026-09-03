export type ReadingDocument = Readonly<{
  version: number;
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

export type ExtractionResult =
  | Readonly<{ ok: true; document: ReadingDocument }>
  | Readonly<{ ok: false; message: string }>;

type Fetch = (input: string, init: RequestInit) => Promise<Response>;

export async function extractPdfDocument(
  file: Blob,
  serviceUrl: string | undefined,
  fetchImplementation: Fetch = fetch,
): Promise<ExtractionResult> {
  if (serviceUrl === undefined || serviceUrl === "") {
    return { ok: false, message: "PDF extraction is not configured for this static deployment." };
  }

  let response: Response;
  try {
    response = await fetchImplementation(serviceUrl, {
      method: "POST",
      headers: { "content-type": "application/pdf" },
      body: file,
    });
  } catch {
    return { ok: false, message: "The extraction service could not be reached." };
  }

  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    return { ok: false, message: errorMessage(payload) ?? "PDF extraction failed." };
  }
  if (!isReadingDocument(payload)) {
    return { ok: false, message: "The extraction service returned an invalid reading document." };
  }
  return { ok: true, document: payload };
}

function errorMessage(value: unknown): string | undefined {
  return typeof value === "object" && value !== null && "message" in value && typeof value.message === "string"
    ? value.message
    : undefined;
}

export function isReadingDocument(value: unknown): value is ReadingDocument {
  if (typeof value !== "object" || value === null) return false;
  const document = value as Record<string, unknown>;
  return (
    typeof document.version === "number" &&
    typeof document.text === "string" &&
    Array.isArray(document.pages) &&
    document.pages.every(isExtractedPage) &&
    Array.isArray(document.diagnostics) &&
    document.diagnostics.every(isCleanupDiagnostic)
  );
}

function isExtractedPage(value: unknown): value is ExtractedPage {
  if (typeof value !== "object" || value === null) return false;
  const page = value as Record<string, unknown>;
  return (
    typeof page.pageNumber === "number" &&
    typeof page.text === "string" &&
    "provenance" in page &&
    (!("sourceImageSize" in page) || page.sourceImageSize === null || isDocumentPixelSize(page.sourceImageSize)) &&
    (!("layout" in page) || page.layout === null || isDocumentPageLayout(page.layout)) &&
    (!("regions" in page) || (Array.isArray(page.regions) && page.regions.every(isDocumentTextRegion)))
  );
}

function isDocumentTextRegion(value: unknown): value is DocumentTextRegion {
  if (typeof value !== "object" || value === null) return false;
  const region = value as Record<string, unknown>;
  return (
    Number.isInteger(region.sourceLineIndex) &&
    typeof region.text === "string" &&
    isDocumentTextRole(region.role) &&
    (region.confidence === null || Number.isInteger(region.confidence)) &&
    Array.isArray(region.evidence) &&
    region.evidence.every(isDocumentTextEvidence) &&
    (!("ocr" in region) || region.ocr === null || isOcrRegionEvidence(region.ocr)) &&
    (!("columnIndex" in region) ||
      region.columnIndex === null ||
      (Number.isInteger(region.columnIndex) && Number(region.columnIndex) >= 0)) &&
    typeof region.includeInReading === "boolean"
  );
}

function isDocumentPageLayout(value: unknown): value is DocumentPageLayout {
  if (typeof value !== "object" || value === null) return false;
  const layout = value as Record<string, unknown>;
  return Array.isArray(layout.columns) && layout.columns.every(isDocumentColumn);
}

function isDocumentColumn(value: unknown): value is DocumentColumn {
  if (typeof value !== "object" || value === null) return false;
  const column = value as Record<string, unknown>;
  return (
    Number.isInteger(column.index) &&
    Number(column.index) >= 0 &&
    isDocumentPixelRegion(column.bounds) &&
    Array.isArray(column.regionIndices) &&
    column.regionIndices.every((index) => Number.isInteger(index) && Number(index) >= 0)
  );
}

function isOcrRegionEvidence(value: unknown): value is OcrRegionEvidence {
  if (typeof value !== "object" || value === null) return false;
  const evidence = value as Record<string, unknown>;
  return (
    (evidence.blockKind === null || typeof evidence.blockKind === "string") &&
    (evidence.confidence === null || Number.isInteger(evidence.confidence)) &&
    (evidence.region === null || isDocumentPixelRegion(evidence.region))
  );
}

function isDocumentPixelSize(value: unknown): value is DocumentPixelSize {
  if (typeof value !== "object" || value === null) return false;
  const size = value as Record<string, unknown>;
  return Number.isInteger(size.width) && Number.isInteger(size.height);
}

function isDocumentPixelRegion(value: unknown): value is DocumentPixelRegion {
  if (typeof value !== "object" || value === null) return false;
  const region = value as Record<string, unknown>;
  return (
    Number.isInteger(region.x) &&
    Number.isInteger(region.y) &&
    Number.isInteger(region.width) &&
    Number.isInteger(region.height)
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
  if (typeof value !== "object" || value === null) return false;
  const diagnostic = value as Record<string, unknown>;
  return (
    typeof diagnostic.kind === "string" &&
    typeof diagnostic.text === "string" &&
    Array.isArray(diagnostic.pages) &&
    diagnostic.pages.every((page) => typeof page === "number")
  );
}
