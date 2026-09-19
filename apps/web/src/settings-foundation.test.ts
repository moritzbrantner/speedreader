import { expect, test } from "bun:test";

import {
  SPEEDREADER_SETTING_DEFINITIONS,
  semanticRoleModesFromValues,
  snapshotFromValues,
  speedreaderSemanticRoles,
} from "./settings-foundation";

test("declares fine-grained reader and semantic settings", () => {
  const ids = SPEEDREADER_SETTING_DEFINITIONS.map((definition) => definition.id);

  expect(ids).toContain("reader.words_per_minute");
  expect(ids).toContain("reader.chunk_size");
  expect(ids).toContain("reader.segmentation");
  expect(ids).toContain("document.semantic.header");
  expect(ids).toContain("document.semantic.footer");
  expect(ids).toContain("document.semantic.page_number");
  expect(
    SPEEDREADER_SETTING_DEFINITIONS.filter((definition) =>
      definition.id.startsWith("document.semantic."),
    ).length,
  ).toBe(speedreaderSemanticRoles.length);
});

test("projects validated foundation values into reader settings", () => {
  expect(
    snapshotFromValues({
      "reader.words_per_minute": { type: "integer", value: 480 },
      "reader.chunk_size": { type: "integer", value: 3 },
      "reader.segmentation": { type: "choice", value: "punctuation" },
    }).reader,
  ).toEqual({
    wordsPerMinute: 480,
    chunkSize: 3,
    segmentation: "punctuation",
  });
});

test("semantic role defaults stay sparse", () => {
  expect(
    semanticRoleModesFromValues({
      "document.semantic.header": { type: "choice", value: "exclude" },
      "document.semantic.footer": { type: "choice", value: "include" },
      "document.semantic.page_number": { type: "choice", value: "default" },
    }),
  ).toEqual({
    header: "exclude",
    footer: "include",
  });
});

test("missing values preserve consumer-owned reader defaults", () => {
  expect(snapshotFromValues({}).reader).toEqual({
    wordsPerMinute: 300,
    chunkSize: 1,
    segmentation: "whitespace",
  });
});
