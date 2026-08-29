import { expect, test } from "bun:test";

import { desktopReaderParity } from "../apps/desktop/src/reader-preview";
import { mobileReaderParity, mobileReaderPreview } from "../apps/mobile/src/reader-preview";
import { webReaderParity, webReaderPreview } from "../apps/web/src/reader-preview";
import { readerParityFixtures } from "../packages/speed-reading/src/parity-fixtures";

test("web and mobile consume the same shared reader fixture", () => {
  expect(webReaderPreview()).toEqual(mobileReaderPreview());
});

for (const fixture of readerParityFixtures) {
  test(`web, mobile, and desktop preserve ${fixture.name}`, () => {
    const expected = {
      chunks: fixture.expectedChunks,
      durations: fixture.expectedDurations,
      progress: fixture.expectedProgress,
    };

    expect(webReaderParity(fixture)).toEqual(expected);
    expect(mobileReaderParity(fixture)).toEqual(expected);
    expect(desktopReaderParity(fixture)).toEqual(expected);
  });
}
