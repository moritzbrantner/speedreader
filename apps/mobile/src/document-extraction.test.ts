import { expect, test } from "bun:test";

import { readingText, type ReadingDocument } from "./document-extraction";

test("projects a fully covered column-major reading order", () => {
  expect(readingText(readingDocument([0, 2, 1, 3]))).toBe("Left 1\nLeft 2\nRight 1\nRight 2");
});

test("falls back when column-major metadata does not cover every readable region", () => {
  expect(readingText(readingDocument([0, 2, 1]))).toBe("Left 1\nRight 1\nLeft 2\nRight 2");
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
