import type { PdfExtractionAdapter } from "./document-extraction";

export const supportedDocumentMimeTypes = [
  "text/plain",
  "text/markdown",
  "application/pdf",
] as const;

export type PickedDocument = Readonly<{
  name: string;
  uri: string;
  mimeType?: string;
}>;

export type DocumentPickerResult =
  | Readonly<{ status: "cancelled" }>
  | Readonly<{ status: "picked"; document: PickedDocument }>;

export type DocumentImportResult =
  | Readonly<{ status: "cancelled" }>
  | Readonly<{
      status: "imported";
      fileName: string;
      text: string;
      source: "plain-text" | "pdf";
      pageCount?: number;
    }>
  | Readonly<{ status: "error"; message: string }>;

export type DocumentImportAdapter = Readonly<{
  importDocument: () => Promise<DocumentImportResult>;
}>;

type DocumentPicker = Readonly<{
  pickDocument: () => Promise<DocumentPickerResult>;
}>;

type PlainTextReader = (source: PickedDocument) => Promise<string>;

type DocumentImportDependencies = Readonly<{
  picker: DocumentPicker;
  plainTextReader: PlainTextReader;
  pdfExtraction: PdfExtractionAdapter;
}>;

export function createDocumentImportAdapter(
  dependencies: DocumentImportDependencies,
): DocumentImportAdapter {
  return {
    async importDocument() {
      let picked: DocumentPickerResult;
      try {
        picked = await dependencies.picker.pickDocument();
      } catch {
        return { status: "error", message: "The document picker could not be opened." };
      }

      if (picked.status === "cancelled") return picked;

      const sourceKind = sourceKindFor(picked.document);
      if (sourceKind === "unsupported") {
        return {
          status: "error",
          message: "Choose a plain-text, Markdown, or PDF document.",
        };
      }

      if (sourceKind === "pdf") {
        const extraction = await dependencies.pdfExtraction.extractPdf(picked.document);
        if (extraction.status === "error") return extraction;
        return {
          status: "imported",
          fileName: picked.document.name,
          text: extraction.document.text,
          source: "pdf",
          pageCount: extraction.document.pages.length,
        };
      }

      try {
        const text = await dependencies.plainTextReader(picked.document);
        if (text.trim() === "") {
          return { status: "error", message: "The selected document contains no readable text." };
        }
        return {
          status: "imported",
          fileName: picked.document.name,
          text,
          source: "plain-text",
        };
      } catch {
        return { status: "error", message: "The selected text document could not be read." };
      }
    },
  };
}

function sourceKindFor(document: PickedDocument): "plain-text" | "pdf" | "unsupported" {
  const mimeType = document.mimeType?.split(";", 1)[0]?.trim().toLowerCase();
  const extension = document.name.toLowerCase().split(".").pop();

  if (mimeType === "application/pdf" || extension === "pdf") return "pdf";
  if (
    mimeType === "text/plain" ||
    mimeType === "text/markdown" ||
    extension === "txt" ||
    extension === "text" ||
    extension === "md" ||
    extension === "markdown"
  ) {
    return "plain-text";
  }
  return "unsupported";
}
