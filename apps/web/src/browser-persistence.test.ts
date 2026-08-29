import { expect, test } from "bun:test";

import {
  createEmptyPersistedReaderState,
  type PersistedReaderState,
} from "@moritzbrantner/speed-reading/persistence";

import { createBrowserReaderPersistence } from "./browser-persistence";

test("falls back to localStorage when IndexedDB is unavailable", async () => {
  const storage = new MemoryStorage();
  const persistence = createBrowserReaderPersistence(() => ({ localStorage: storage }));
  const state: PersistedReaderState = createEmptyPersistedReaderState();

  await persistence.save(state);

  await expect(persistence.load()).resolves.toEqual(state);
});

test("treats inaccessible or corrupt browser persistence as an empty start", async () => {
  const persistence = createBrowserReaderPersistence(() => ({
    localStorage: {
      getItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("quota exceeded");
      },
    } as unknown as Storage,
  }));

  await expect(persistence.load()).resolves.toBeUndefined();
  await expect(persistence.save(createEmptyPersistedReaderState())).rejects.toThrow("quota exceeded");

  const corrupt = new MemoryStorage();
  corrupt.setItem("speedreader.reader-state.v1", "corrupt");
  await expect(createBrowserReaderPersistence(() => ({ localStorage: corrupt })).load())
    .resolves.toBeUndefined();
});

class MemoryStorage implements Storage {
  readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}
