import { expect, test } from "bun:test";

import { mobileReaderPreview } from "./reader-preview";

test("mobile preview receives fixture chunks from the shared reader", () => {
  expect(mobileReaderPreview()).toEqual([
    "Speed",
    "reading",
    "stays",
    "useful",
    "when",
    "its",
    "core",
    "is",
    "shared.",
  ]);
});
