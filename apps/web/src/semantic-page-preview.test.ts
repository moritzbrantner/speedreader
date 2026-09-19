import { expect, test } from "bun:test";

import type { ExtractedPage } from "./extraction";
import {
  semanticPreviewOverlays,
  type PreviewTextLine,
} from "./semantic-page-preview";

test("maps OCR semantic regions into normalized page coordinates", () => {
  const page: ExtractedPage = {
    pageNumber: 1,
    text: "Body",
    provenance: "canonicalOcr",
    sourceImageSize: { width: 1000, height: 2000 },
    regions: [
      {
        sourceLineIndex: 0,
        text: "Running header",
        role: "header",
        confidence: 90,
        evidence: ["topMargin"],
        ocr: {
          blockKind: "heading",
          confidence: 95,
          region: { x: 100, y: 80, width: 800, height: 120 },
        },
        includeInReading: false,
      },
    ],
  };

  const overlay = semanticPreviewOverlays(page, [])[0];
  expect(overlay).toMatchObject({
    key: "1:0",
    role: "header",
    text: "Running header",
    included: false,
  });
  expect(overlay?.bounds.left).toBeCloseTo(0.1);
  expect(overlay?.bounds.top).toBeCloseTo(0.04);
  expect(overlay?.bounds.width).toBeCloseTo(0.8);
  expect(overlay?.bounds.height).toBeCloseTo(0.06);
});

test("matches embedded PDF semantic regions to rendered text lines", () => {
  const page: ExtractedPage = {
    pageNumber: 2,
    text: "Body",
    provenance: "embeddedText",
    regions: [
      {
        sourceLineIndex: 0,
        text: "Parish Bulletin — September",
        role: "header",
        confidence: 90,
        evidence: ["topMargin"],
        includeInReading: false,
      },
    ],
  };
  const lines: readonly PreviewTextLine[] = [
    {
      text: "Parish Bulletin - September",
      bounds: { left: 0.1, top: 0.03, width: 0.8, height: 0.04 },
    },
  ];

  const bounds = semanticPreviewOverlays(page, lines)[0]?.bounds;
  expect(bounds?.left).toBeCloseTo(lines[0]?.bounds.left ?? 0);
  expect(bounds?.top).toBeCloseTo(lines[0]?.bounds.top ?? 0);
  expect(bounds?.width).toBeCloseTo(lines[0]?.bounds.width ?? 0);
  expect(bounds?.height).toBeCloseTo(lines[0]?.bounds.height ?? 0);
});

test("does not clutter the preview with ordinary content until its policy changes", () => {
  const page: ExtractedPage = {
    pageNumber: 3,
    text: "Body paragraph",
    provenance: "embeddedText",
    regions: [
      {
        sourceLineIndex: 0,
        text: "Body paragraph",
        role: "content",
        confidence: null,
        evidence: [],
        includeInReading: true,
      },
    ],
  };
  const lines: readonly PreviewTextLine[] = [
    {
      text: "Body paragraph",
      bounds: { left: 0.1, top: 0.2, width: 0.8, height: 0.05 },
    },
  ];

  expect(semanticPreviewOverlays(page, lines)).toEqual([]);
  expect(semanticPreviewOverlays(page, lines, { content: "exclude" })[0]).toMatchObject({
    key: "3:0",
    role: "content",
    included: false,
  });
});

test("individual region overrides are reflected in the page overlay", () => {
  const page: ExtractedPage = {
    pageNumber: 4,
    text: "Body",
    provenance: "embeddedText",
    regions: [
      {
        sourceLineIndex: 2,
        text: "4",
        role: "pageNumber",
        confidence: 100,
        evidence: ["bottomMargin", "numericOnly", "sequentialPageNumber"],
        includeInReading: false,
      },
    ],
  };
  const lines: readonly PreviewTextLine[] = [
    {
      text: "4",
      bounds: { left: 0.48, top: 0.94, width: 0.04, height: 0.03 },
    },
  ];

  expect(semanticPreviewOverlays(page, lines, {}, { "4:2": true })[0]).toMatchObject({
    key: "4:2",
    included: true,
  });
});
