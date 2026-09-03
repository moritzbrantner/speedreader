export type ReadingDocument = Readonly<{
  version: number;
  text: string;
  pages: readonly ExtractedPage[];
  diagnostics: readonly CleanupDiagnostic[];
}>;

export type DocumentTextRole = "content" | "header" | "footer" | "pageNumber";

export type DocumentTextEvidence =
  | "topMargin"
  | "bottomMargin"
  | "repeatedAcrossPages"
  | "numericOnly"
  | "sequentialPageNumber";

export type DocumentTextRegion = Readonly<{
  sourceLineIndex: number;
  text: string;
  role: DocumentTextRole;
  confidence: number | null;
  evidence: readonly DocumentTextEvidence[];
  includeInReading: boolean;
}>;

export type ExtractedPage = Readonly<{
  pageNumber: number;
  text: string;
  provenance: unknown;
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
    typeof region.includeInReading === "boolean"
  );
}

function isDocumentTextRole(value: unknown): value is DocumentTextRole {
  return value === "content" || value === "header" || value === "footer" || value === "pageNumber";
}

function isDocumentTextEvidence(value: unknown): value is DocumentTextEvidence {
  return (
    value === "topMargin" ||
    value === "bottomMargin" ||
    value === "repeatedAcrossPages" ||
    value === "numericOnly" ||
    value === "sequentialPageNumber"
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
