import { expect, test } from "bun:test";

import { webReaderPreview } from "./reader-preview";

test("web preview receives fixture chunks from the shared reader", () => {
  expect(webReaderPreview()).toEqual([
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
