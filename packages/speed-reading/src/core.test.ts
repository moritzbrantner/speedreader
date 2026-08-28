import { describe, expect, test } from "bun:test";

import { chunkText, millisecondsPerChunk, pivotIndex, progressFor } from "./core";

describe("chunkText", () => {
  test("normalizes whitespace and retains deterministic chunk order", () => {
    expect(chunkText("One  two\nthree", 2)).toEqual([
      { index: 0, text: "One two", words: ["One", "two"], pivot: 2 },
      { index: 1, text: "three", words: ["three"], pivot: 1 },
    ]);
  });

  test("rejects an invalid chunk size", () => {
    expect(() => chunkText("one", 0)).toThrow("chunkSize must be a positive integer");
  });
});

test("pivot uses a stable optimal-recognition-point approximation", () => {
  expect(pivotIndex("reading")).toBe(2);
  expect(pivotIndex("")).toBe(0);
});

test("pacing scales with the number of words in a chunk", () => {
  expect(millisecondsPerChunk(300, 2)).toBe(400);
});

test("progress clamps seeks and marks completion", () => {
  const chunks = chunkText("one two three", 1);
  expect(progressFor(chunks, 8)).toEqual({ chunkIndex: 3, completed: true, totalChunks: 3 });
});
