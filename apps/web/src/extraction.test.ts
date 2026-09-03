import { expect, test } from "bun:test";

import { extractPdfDocument, readingText, type ReadingDocument } from "./extraction";

test("extracts a PDF through the configured service contract", async () => {
  const result = await extractPdfDocument(
    new Blob(["pdf"]),
    "https://extract.example/extract/pdf",
    async () => new Response(JSON.stringify({ version: 1, text: "Extracted text", pages: [], diagnostics: [] })),
  );

  expect(result).toEqual({
    ok: true,
    document: { version: 1, text: "Extracted text", pages: [], diagnostics: [] },
  });
});

test("retains a useful plain-text mode when extraction is unavailable", async () => {
  await expect(extractPdfDocument(new Blob(["pdf"]), undefined)).resolves.toEqual({
    ok: false,
    message: "PDF extraction is not configured for this static deployment.",
  });
});

test("projects a fully covered column-major reading order", () => {
  const document = readingDocument([0, 2, 1, 3]);

  expect(readingText(document)).toBe("Left 1\nLeft 2\nRight 1\nRight 2");
  expect(document.text).toBe("Left 1\nRight 1\nLeft 2\nRight 2");
});

test("falls back to cleaned source text when reading order is incomplete", () => {
  expect(readingText(readingDocument([0, 2, 1]))).toBe("Left 1\nRight 1\nLeft 2\nRight 2");
});

test("falls back when reading order contains duplicate regions", () => {
  expect(readingText(readingDocument([0, 2, 1, 1]))).toBe("Left 1\nRight 1\nLeft 2\nRight 2");
});

test("falls back when reading order references a missing region", () => {
  expect(readingText(readingDocument([0, 2, 1, 99]))).toBe("Left 1\nRight 1\nLeft 2\nRight 2");
});

function readingDocument(regionIndices: readonly number[]): ReadingDocument {
  const texts = ["Left 1", "Right 1", "Left 2", "Right 2"];
  return {
    version: 1,
    text: texts.join("\n"),
    pages: [
      {
        pageNumber: 1,
        text: texts.join("\n"),
        provenance: { kind: "canonicalOcr", preset: "fixture" },
        readingOrder: { strategy: "columnMajor", regionIndices },
        regions: texts.map((text, sourceLineIndex) => ({
          sourceLineIndex,
          text,
          role: "content",
          confidence: null,
          evidence: [],
          includeInReading: true,
        })),
      },
    ],
    diagnostics: [],
  };
}
