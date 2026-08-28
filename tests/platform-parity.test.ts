import { expect, test } from "bun:test";

import { mobileReaderPreview } from "../apps/mobile/src/reader-preview";
import { webReaderPreview } from "../apps/web/src/reader-preview";

test("web and mobile consume the same shared reader fixture", () => {
  expect(webReaderPreview()).toEqual(mobileReaderPreview());
});
