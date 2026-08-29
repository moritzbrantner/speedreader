import { describe, expect, test } from "bun:test";

import type { PdfExtractionAdapter } from "./document-extraction";
import { createDocumentImportAdapter, type PickedDocument } from "./document-import";

const unusedPdfExtraction: PdfExtractionAdapter = {
  async extractPdf() {
    throw new Error("PDF extraction should not be used");
  },
};

describe("document import", () => {
  test("reads a picked plain-text document without using PDF extraction", async () => {
    const source: PickedDocument = {
      name: "notes.md",
      uri: "file:///notes.md",
      mimeType: "text/markdown",
    };
    const adapter = createDocumentImportAdapter({
      picker: { async pickDocument() { return { status: "picked", document: source }; } },
      plainTextReader: async (picked) => {
        expect(picked).toEqual(source);
        return "Local words stay offline";
      },
      pdfExtraction: unusedPdfExtraction,
    });

    await expect(adapter.importDocument()).resolves.toEqual({
      status: "imported",
      fileName: "notes.md",
      text: "Local words stay offline",
      source: "plain-text",
    });
  });

  test("routes PDFs through the extraction seam and returns only reader-facing text", async () => {
    const adapter = createDocumentImportAdapter({
      picker: {
        async pickDocument() {
          return {
            status: "picked",
            document: { name: "scan.pdf", uri: "file:///scan.pdf", mimeType: "application/pdf" },
          };
        },
      },
      plainTextReader: async () => {
        throw new Error("Plain-text reader should not be used");
      },
      pdfExtraction: {
        async extractPdf(source) {
          expect(source.name).toBe("scan.pdf");
          expect(source.uri).toBe("file:///scan.pdf");
          return {
            status: "extracted",
            document: {
              version: 1,
              text: "Recognized PDF words",
              pages: [{ pageNumber: 1, text: "Recognized PDF words", provenance: { kind: "canonicalOcr" } }],
              diagnostics: [],
            },
          };
        },
      },
    });

    await expect(adapter.importDocument()).resolves.toEqual({
      status: "imported",
      fileName: "scan.pdf",
      text: "Recognized PDF words",
      source: "pdf",
      pageCount: 1,
    });
  });

  test("keeps cancellation and unsupported inputs explicit", async () => {
    const cancelled = createDocumentImportAdapter({
      picker: { async pickDocument() { return { status: "cancelled" }; } },
      plainTextReader: async () => "unused",
      pdfExtraction: unusedPdfExtraction,
    });
    const unsupported = createDocumentImportAdapter({
      picker: {
        async pickDocument() {
          return {
            status: "picked",
            document: { name: "archive.zip", uri: "file:///archive.zip", mimeType: "application/zip" },
          };
        },
      },
      plainTextReader: async () => "unused",
      pdfExtraction: unusedPdfExtraction,
    });

    await expect(cancelled.importDocument()).resolves.toEqual({ status: "cancelled" });
    await expect(unsupported.importDocument()).resolves.toEqual({
      status: "error",
      message: "Choose a plain-text, Markdown, or PDF document.",
    });
  });
});
