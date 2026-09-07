import { expect, test } from "bun:test";

import type { ReadingDocument } from "./extraction";
import {
  projectDocumentText,
  regionIncludedBySemanticFilters,
  semanticReviewRegions,
  semanticRoleStats,
} from "./semantic-filter";

const document: ReadingDocument = {
  version: 1,
  text: "Body paragraph\nSection heading",
  pages: [
    {
      pageNumber: 1,
      text: "Body paragraph\nSection heading",
      provenance: "embeddedText",
      regions: [
        {
          sourceLineIndex: 0,
          text: "Journal title",
          role: "header",
          confidence: 90,
          evidence: ["topMargin", "repeatedAcrossPages"],
          includeInReading: false,
        },
        {
          sourceLineIndex: 1,
          text: "Body paragraph",
          role: "content",
          confidence: null,
          evidence: [],
          includeInReading: true,
        },
        {
          sourceLineIndex: 2,
          text: "Section heading",
          role: "heading",
          confidence: null,
          evidence: ["ocrBlockHint"],
          includeInReading: true,
        },
        {
          sourceLineIndex: 3,
          text: "1",
          role: "pageNumber",
          confidence: 100,
          evidence: ["bottomMargin", "numericOnly", "sequentialPageNumber"],
          includeInReading: false,
        },
        {
          sourceLineIndex: 4,
          text: "Confidential",
          role: "footer",
          confidence: 90,
          evidence: ["bottomMargin", "repeatedAcrossPages"],
          includeInReading: false,
        },
      ],
    },
  ],
  diagnostics: [],
};

test("preserves the extraction projection by default", () => {
  expect(projectDocumentText(document)).toBe(document.text);
});

test("can include or exclude entire semantic roles", () => {
  expect(projectDocumentText(document, { header: "include", heading: "exclude" })).toBe(
    "Journal title\nBody paragraph",
  );
});

test("individual region overrides take precedence over a role filter", () => {
  const region = document.pages[0]?.regions?.[4];
  if (region === undefined) throw new Error("Expected footer fixture region.");

  expect(
    regionIncludedBySemanticFilters(
      1,
      region,
      { footer: "include" },
      { "1:4": false },
    ),
  ).toBe(false);
  expect(projectDocumentText(document, { footer: "include" }, { "1:4": false })).toBe(
    document.text,
  );
});

test("reports default and effective inclusion counts by role", () => {
  const header = semanticRoleStats(document, { header: "include" }).find(
    (stats) => stats.role === "header",
  );

  expect(header).toEqual({
    role: "header",
    regionCount: 1,
    defaultIncludedCount: 0,
    effectiveIncludedCount: 1,
  });
});

test("surfaces classified regions for manual review", () => {
  expect(semanticReviewRegions(document).map((item) => item.region.role)).toEqual([
    "header",
    "heading",
    "pageNumber",
    "footer",
  ]);
});

test("falls back to canonical page text when region metadata is unavailable", () => {
  const legacyDocument: ReadingDocument = {
    ...document,
    text: "Legacy projection",
    pages: [
      {
        pageNumber: 1,
        text: "Legacy projection",
        provenance: "embeddedText",
      },
    ],
  };

  expect(projectDocumentText(legacyDocument, { header: "include" })).toBe(
    "Legacy projection",
  );
});
