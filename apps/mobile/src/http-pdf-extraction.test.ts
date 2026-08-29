import { describe, expect, test } from "bun:test";

import { createHttpPdfExtractionAdapter } from "./http-pdf-extraction";

describe("HTTP PDF extraction adapter", () => {
  test("posts PDF bytes to the Rust service contract and validates the document", async () => {
    const pdf = new Blob(["%PDF fixture"], { type: "application/pdf" });
    let request: Readonly<{ input: string; init?: RequestInit }> | undefined;
    const adapter = createHttpPdfExtractionAdapter({
      serviceUrl: "https://extract.example/extract/pdf",
      loadPdf: async () => pdf,
      fetchImplementation: async (input, init) => {
        request = { input, init };
        return Response.json({
          version: 1,
          text: "Shared chunks stay deterministic",
          pages: [
            {
              pageNumber: 1,
              text: "Shared chunks stay deterministic",
              provenance: { kind: "embeddedText" },
            },
          ],
          diagnostics: [],
        });
      },
    });

    await expect(adapter.extractPdf({ name: "fixture.pdf", uri: "file:///fixture.pdf" })).resolves.toEqual({
      status: "extracted",
      document: {
        version: 1,
        text: "Shared chunks stay deterministic",
        pages: [
          {
            pageNumber: 1,
            text: "Shared chunks stay deterministic",
            provenance: { kind: "embeddedText" },
          },
        ],
        diagnostics: [],
      },
    });
    expect(request?.input).toBe("https://extract.example/extract/pdf");
    expect(request?.init).toMatchObject({
      method: "POST",
      headers: { "content-type": "application/pdf" },
      body: pdf,
    });
  });

  test("does not touch the file or network when PDF extraction is unconfigured", async () => {
    let touchedBoundary = false;
    const adapter = createHttpPdfExtractionAdapter({
      loadPdf: async () => {
        touchedBoundary = true;
        return new Blob();
      },
      fetchImplementation: async () => {
        touchedBoundary = true;
        return new Response();
      },
    });

    await expect(adapter.extractPdf({ name: "scan.pdf", uri: "file:///scan.pdf" })).resolves.toEqual({
      status: "error",
      message: "PDF extraction is not configured. Set EXPO_PUBLIC_EXTRACTION_URL for this build.",
    });
    expect(touchedBoundary).toBeFalse();
  });

  test("rejects a successful response that is not the versioned reading-document contract", async () => {
    const adapter = createHttpPdfExtractionAdapter({
      serviceUrl: "https://extract.example/extract/pdf",
      loadPdf: async () => new Blob(["pdf"]),
      fetchImplementation: async () => Response.json({ text: "missing contract fields" }),
    });

    await expect(adapter.extractPdf({ name: "scan.pdf", uri: "file:///scan.pdf" })).resolves.toEqual({
      status: "error",
      message: "The PDF extraction service returned an invalid reading document.",
    });
  });
});
