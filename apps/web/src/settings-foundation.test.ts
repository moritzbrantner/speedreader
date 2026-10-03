import { expect, test } from "bun:test";

import {
  SPEEDREADER_SETTING_DEFINITIONS,
  restoreUserScopeFromStorage,
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

test("successful imports with recovery diagnostics stay authoritative", () => {
  const legacyWrites: string[] = [];
  const persistedSnapshots: string[] = [];
  const canonicalSnapshot =
    '{"schema_version":2,"scope":"user","overrides":{"future.option":{"type":"bool","value":true}}}';

  const restore = restoreUserScopeFromStorage(
    {
      presentation: () => [],
      effectiveValues: () => ({}),
      set: (id) => {
        legacyWrites.push(id);
      },
      reset: () => {},
      importScope: () => ["UnknownSettingPreserved { id: future.option }"],
      exportScope: () => canonicalSnapshot,
      dispose: () => {},
    },
    {
      wordsPerMinute: 420,
      chunkSize: 2,
      segmentation: "whitespace",
    },
    {
      getItem: () => '{"schema_version":2,"scope":"user","overrides":{}}',
      setItem: (_key, value) => {
        persistedSnapshots.push(value);
      },
    },
  );

  expect(legacyWrites).toEqual([]);
  expect(persistedSnapshots).toEqual([canonicalSnapshot]);
  expect(restore).toEqual({
    persistenceAvailable: true,
    notice: "Stored settings were recovered by the shared settings foundation.",
  });
});
