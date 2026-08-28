import { describe, expect, test } from "bun:test";

import { analyzeReadingText } from "./analysis";
import { defaultReaderSettings } from "./core";
import {
  createReadingSession,
  parseReadingSession,
  serializeReadingSession,
  snapshotFor,
  transitionReadingSession,
} from "./session";

describe("reading session transitions", () => {
  test("is deterministic without a clock", () => {
    const initial = createReadingSession("One, two. three", { wordsPerMinute: 250 });
    const playing = transitionReadingSession(initial, { type: "play" });
    const stepped = transitionReadingSession(playing, { type: "step", direction: 1 });

    expect(stepped).toMatchObject({ chunkIndex: 1, status: "playing" });
    expect(snapshotFor(stepped).currentChunk?.text).toBe("two.");
  });

  test("supports seek, reset, and completion", () => {
    const session = createReadingSession("one two");
    const complete = transitionReadingSession(session, { type: "seek", chunkIndex: 2 });
    expect(complete.status).toBe("complete");
    expect(transitionReadingSession(complete, { type: "reset" })).toMatchObject({
      chunkIndex: 0,
      status: "paused",
    });
  });
});

test("session state is stable and serializable", () => {
  const session = transitionReadingSession(createReadingSession("naïve café"), {
    type: "set-segmentation",
    segmentation: "punctuation",
  });
  expect(parseReadingSession(serializeReadingSession(session))).toEqual(session);
});

test("chunk policy changes reset safely while pacing changes preserve position", () => {
  const playing = transitionReadingSession(createReadingSession("one two three"), { type: "play" });
  const progressed = transitionReadingSession(playing, { type: "step", direction: 1 });
  expect(transitionReadingSession(progressed, { type: "set-wpm", wordsPerMinute: 450 })).toMatchObject({
    chunkIndex: 1,
    settings: { wordsPerMinute: 450 },
  });
  expect(transitionReadingSession(progressed, { type: "set-chunk-size", chunkSize: 2 })).toMatchObject({
    chunkIndex: 0,
    status: "paused",
  });
});

test("analysis exposes counts and a deterministic duration estimate", () => {
  expect(analyzeReadingText("One two.", defaultReaderSettings)).toEqual({
    wordCount: 2,
    chunkCount: 2,
    estimatedDurationMilliseconds: 520,
  });
});
