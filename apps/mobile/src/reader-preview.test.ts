import { expect, test } from "bun:test";

import { mobileReaderPreview } from "./reader-preview";

test("mobile preview receives fixture chunks from the shared reader", () => {
  expect(mobileReaderPreview()[0]).toBe("Speed");
});
