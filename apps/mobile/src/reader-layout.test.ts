import { describe, expect, test } from "bun:test";

import { readerLayoutMode } from "./reader-layout";

describe("native reader layout", () => {
  test("stacks content in phone portrait", () => {
    expect(readerLayoutMode(390, 844)).toBe("compact");
  });

  test("uses two columns in phone landscape and on tablets", () => {
    expect(readerLayoutMode(844, 390)).toBe("wide");
    expect(readerLayoutMode(768, 1024)).toBe("wide");
  });
});
