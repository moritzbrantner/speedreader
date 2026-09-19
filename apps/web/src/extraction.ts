import {
  isReadingDocument as validateReadingDocument,
  type ReadingDocument as SharedReadingDocument,
} from "@moritzbrantner/speed-reading/document";

import { extractPdfInBrowser, type BrowserPdfExtractionProgress } from "./browser-pdf-extraction";

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

export type ExtractionResult =
  | Readonly<{ ok: true; document: SharedReadingDocument }>
  | Readonly<{ ok: false; message: string }>;

type Fetch = (input: string, init: RequestInit) => Promise<Response>;
type BrowserPdfExtractor = (
  file: Blob,
  onProgress?: (progress: BrowserPdfExtractionProgress) => void,
) => Promise<unknown>;

export async function extractPdfDocument(
  file: Blob,
  serviceUrl: string | undefined,
  fetchImplementation: Fetch = fetch,
  browserExtraction: BrowserPdfExtractor = extractPdfInBrowser,
  onProgress?: (progress: BrowserPdfExtractionProgress) => void,
): Promise<ExtractionResult> {
  if (serviceUrl === undefined || serviceUrl === "") {
    let payload: unknown;
    try {
      payload = await browserExtraction(file, onProgress);
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Local browser PDF extraction failed.",
      };
    }
    if (!validateReadingDocument(payload)) {
      return { ok: false, message: "Local browser PDF extraction returned an invalid reading document." };
    }
    return { ok: true, document: payload };
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
  if (!validateReadingDocument(payload)) {
    return { ok: false, message: "The extraction service returned an invalid reading document." };
  }
  return { ok: true, document: payload };
}

function errorMessage(value: unknown): string | undefined {
  return typeof value === "object" && value !== null && "message" in value && typeof value.message === "string"
    ? value.message
    : undefined;
}
