import {
  isReadingDocument,
  type PdfDocumentSource,
  type PdfExtractionAdapter,
} from "./document-extraction";

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;
type PdfLoader = (source: PdfDocumentSource) => Promise<Blob>;

type HttpPdfExtractionOptions = Readonly<{
  serviceUrl?: string;
  fetchImplementation?: Fetch;
  loadPdf?: PdfLoader;
}>;

export function createHttpPdfExtractionAdapter(
  options: HttpPdfExtractionOptions,
): PdfExtractionAdapter {
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const loadPdf = options.loadPdf ?? ((source) => loadPdfFromUri(source, fetchImplementation));

  return {
    async extractPdf(source) {
      if (options.serviceUrl === undefined || options.serviceUrl.trim() === "") {
        return {
          status: "error",
          message: "PDF extraction is not configured. Set EXPO_PUBLIC_EXTRACTION_URL for this build.",
        };
      }

      let pdf: Blob;
      try {
        pdf = await loadPdf(source);
      } catch {
        return { status: "error", message: "The selected PDF could not be read." };
      }

      let response: Response;
      try {
        response = await fetchImplementation(options.serviceUrl, {
          method: "POST",
          headers: { "content-type": "application/pdf" },
          body: pdf,
        });
      } catch {
        return { status: "error", message: "The PDF extraction service could not be reached." };
      }

      const responseText = await response.text().catch(() => "");
      const payload = parsePayload(responseText);
      if (!response.ok) {
        return {
          status: "error",
          message: errorMessage(payload, responseText) ?? "PDF extraction failed.",
        };
      }
      if (!isReadingDocument(payload)) {
        return {
          status: "error",
          message: "The PDF extraction service returned an invalid reading document.",
        };
      }
      return { status: "extracted", document: payload };
    },
  };
}

async function loadPdfFromUri(source: PdfDocumentSource, fetchImplementation: Fetch): Promise<Blob> {
  const response = await fetchImplementation(source.uri);
  if (!response.ok) throw new Error("Unable to read local PDF");
  return response.blob();
}

function parsePayload(text: string): unknown {
  if (text === "") return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function errorMessage(payload: unknown, responseText: string): string | undefined {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "message" in payload &&
    typeof payload.message === "string"
  ) {
    return payload.message;
  }
  const plainText = responseText.trim();
  return plainText === "" ? undefined : plainText;
}
