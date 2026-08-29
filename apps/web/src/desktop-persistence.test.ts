import { expect, test } from "bun:test";

import {
  createEmptyPersistedReaderState,
  serializePersistedReaderState,
} from "@moritzbrantner/speed-reading/persistence";

import { createDesktopReaderPersistence } from "./desktop-persistence";

test("loads and saves through the Tauri persistence bridge", async () => {
  let serialized: string | null = serializePersistedReaderState(createEmptyPersistedReaderState());
  const persistence = createDesktopReaderPersistence(() => ({
    async load() {
      return serialized;
    },
    async save(next) {
      serialized = next;
    },
  }));

  const loaded = await persistence.load();
  expect(loaded).toEqual(createEmptyPersistedReaderState());
  await persistence.save({ ...loaded!, currentDocumentId: "desktop-draft" });
  expect(JSON.parse(serialized!)).toMatchObject({ currentDocumentId: "desktop-draft" });
});

test("keeps desktop startup usable when the bridge fails", async () => {
  const persistence = createDesktopReaderPersistence(() => ({
    async load() {
      throw new Error("unreadable");
    },
    async save() {
      throw new Error("unwritable");
    },
  }));

  await expect(persistence.load()).resolves.toBeUndefined();
  await expect(persistence.save(createEmptyPersistedReaderState())).rejects.toThrow("unwritable");
});
