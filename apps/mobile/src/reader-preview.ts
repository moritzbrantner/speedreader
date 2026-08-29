import {
  chunkText,
  millisecondsForChunk,
  progressFor,
} from "@moritzbrantner/speed-reading/core";
import { readerFixture } from "@moritzbrantner/speed-reading/fixture";
import {
  type ReaderParityFixture,
  type ReaderParityResult,
} from "@moritzbrantner/speed-reading/parity-fixtures";

export function mobileReaderPreview(): readonly string[] {
  return chunkText(readerFixture).map((chunk) => chunk.text);
}

export function mobileReaderParity(fixture: ReaderParityFixture): ReaderParityResult {
  const chunks = chunkText(fixture.text, fixture.settings.chunkSize, fixture.settings.segmentation);
  return {
    chunks: chunks.map((chunk) => chunk.text),
    durations: chunks.map((chunk) => millisecondsForChunk(
      chunk,
      fixture.settings.wordsPerMinute,
    )),
    progress: fixture.progressRequests.map((index) => progressFor(chunks, index)),
  };
}
