import { expect, test } from "bun:test";

import { chunkText, millisecondsForChunk, progressFor } from "./core";
import { readerParityFixtures } from "./parity-fixtures";

for (const fixture of readerParityFixtures) {
  test(`shared parity fixture: ${fixture.name}`, () => {
    const chunks = chunkText(
      fixture.text,
      fixture.settings.chunkSize,
      fixture.settings.segmentation,
    );

    expect(chunks.map((chunk) => chunk.text)).toEqual([...fixture.expectedChunks]);
    expect(chunks.map((chunk) => millisecondsForChunk(
      chunk,
      fixture.settings.wordsPerMinute,
    ))).toEqual([...fixture.expectedDurations]);
    expect(fixture.progressRequests.map((index) => progressFor(chunks, index))).toEqual(
      [...fixture.expectedProgress],
    );
  });
}
