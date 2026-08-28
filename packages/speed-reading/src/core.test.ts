import { describe, expect, test } from "vitest";

import {
  advanceSpeedReadingIndex,
  createSpeedReadingChunks,
  getPivotIndex,
  getSpeedReadingDelay,
} from "./core";

describe("speed-reading core", () => {
  test("groups words into chunks and keeps a stable pivot", () => {
    const chunks = createSpeedReadingChunks("One quick brown fox", { chunkSize: 2 });

    expect(chunks.map((chunk) => chunk.text)).toEqual(["One quick", "brown fox"]);
    expect(chunks[0]?.pivot).toBe("u");
    expect(getPivotIndex("reading")).toBe(2);
  });

  test("adds pacing time at sentence boundaries", () => {
    const plain = createSpeedReadingChunks("Hello there", { chunkSize: 2 })[0];
    const sentence = createSpeedReadingChunks("Hello there.", { chunkSize: 2 })[0];

    expect(plain).toBeDefined();
    expect(sentence).toBeDefined();
    expect(getSpeedReadingDelay(sentence!, { wordsPerMinute: 300 })).toBeGreaterThan(
      getSpeedReadingDelay(plain!, { wordsPerMinute: 300 }),
    );
  });

  test("advances and reports completion without wrapping", () => {
    expect(advanceSpeedReadingIndex(0, 3)).toEqual({ nextIndex: 1, isComplete: false });
    expect(advanceSpeedReadingIndex(2, 3)).toEqual({ nextIndex: 2, isComplete: true });
    expect(advanceSpeedReadingIndex(0, 0)).toEqual({ nextIndex: 0, isComplete: true });
  });
});
