import { describe, expect, test } from "bun:test";

import { createReadingSession, transitionReadingSession } from "./session";
import {
  createEmptyPersistedReaderState,
  createReadingDocument,
  parsePersistedReaderState,
  restoreReadingSession,
  serializePersistedReaderState,
  updatePersistedReaderState,
} from "./persistence";

const timestamp = "2026-08-29T10:00:00.000Z";

describe("persisted reader contracts", () => {
  test("round-trips versioned preferences, documents, and progress", () => {
    const document = createReadingDocument({
      title: "Notes",
      text: "one two three",
      source: "plain-text",
      updatedAt: timestamp,
    });
    const session = transitionReadingSession(
      createReadingSession(document.text, { chunkSize: 2, wordsPerMinute: 420 }),
      { type: "seek", chunkIndex: 1 },
    );
    const state = updatePersistedReaderState(
      createEmptyPersistedReaderState(),
      document,
      session,
      timestamp,
    );

    expect(parsePersistedReaderState(serializePersistedReaderState(state))).toEqual(state);
    expect(restoreReadingSession(document, state)).toMatchObject({
      chunkIndex: 1,
      settings: { chunkSize: 2, wordsPerMinute: 420 },
      status: "paused",
    });
  });

  test("discards corrupt, incompatible, and internally inconsistent values", () => {
    expect(parsePersistedReaderState("not-json")).toBeUndefined();
    expect(parsePersistedReaderState(JSON.stringify({ version: 2 }))).toBeUndefined();

    const state = createEmptyPersistedReaderState();
    expect(parsePersistedReaderState(JSON.stringify({
      ...state,
      progress: [{
        version: 1,
        documentId: "draft",
        contentFingerprint: "fingerprint",
        chunkIndex: 1,
        totalChunks: 2,
        completed: true,
        updatedAt: timestamp,
      }],
    }))).toBeUndefined();
  });

  test("does not apply a position to changed content or changed chunk semantics", () => {
    const document = createReadingDocument({
      id: "draft",
      title: "Draft",
      text: "one two three",
      source: "plain-text",
      updatedAt: timestamp,
    });
    const progressed = transitionReadingSession(createReadingSession(document.text), {
      type: "seek",
      chunkIndex: 2,
    });
    const state = updatePersistedReaderState(
      createEmptyPersistedReaderState(),
      document,
      progressed,
      timestamp,
    );

    expect(restoreReadingSession({ ...document, text: "replacement text" }, state).chunkIndex).toBe(0);
    expect(restoreReadingSession(document, {
      ...state,
      preferences: {
        version: 1,
        settings: { ...state.preferences.settings, chunkSize: 2 },
      },
    }).chunkIndex).toBe(0);
  });

  test("keeps recents bounded and retains progress only for recent documents", () => {
    let state = createEmptyPersistedReaderState();
    for (let index = 0; index < 12; index += 1) {
      const document = createReadingDocument({
        id: `document-${index}`,
        title: `Document ${index}`,
        text: `text ${index}`,
        source: "plain-text",
        updatedAt: timestamp,
      });
      state = updatePersistedReaderState(
        state,
        document,
        createReadingSession(document.text),
        timestamp,
      );
    }

    expect(state.recentDocuments).toHaveLength(10);
    expect(state.progress).toHaveLength(10);
    expect(state.currentDocumentId).toBe("document-11");
    expect(state.recentDocuments.at(-1)?.id).toBe("document-2");
  });
});
