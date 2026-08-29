import { expect, mock, test } from "bun:test";

import { createEmptyPersistedReaderState } from "@moritzbrantner/speed-reading/persistence";

mock.module("expo-file-system", () => ({
  documentDirectory: "file:///documents/",
  readAsStringAsync: async () => "",
  writeAsStringAsync: async () => undefined,
}));

const { createExpoReaderPersistence } = await import("./expo-persistence");

test("persists reader state in Expo document storage", async () => {
  let contents: string | undefined;
  const persistence = createExpoReaderPersistence({
    stateFileUri: "file:///documents/reader-state.json",
    async read() {
      if (contents === undefined) throw new Error("missing");
      return contents;
    },
    async write(_uri, serialized) {
      contents = serialized;
    },
  });

  await expect(persistence.load()).resolves.toBeUndefined();
  await persistence.save(createEmptyPersistedReaderState());
  await expect(persistence.load()).resolves.toEqual(createEmptyPersistedReaderState());
});

test("does not fail startup when Expo storage is unavailable", async () => {
  const persistence = createExpoReaderPersistence({
    async read() {
      throw new Error("unavailable");
    },
    async write() {
      throw new Error("unavailable");
    },
  });

  await expect(persistence.load()).resolves.toBeUndefined();
  await expect(persistence.save(createEmptyPersistedReaderState())).rejects.toThrow(
    "Expo document storage is unavailable",
  );
});
