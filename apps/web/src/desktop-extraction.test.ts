import { expect, test } from "bun:test";

import { openDesktopDocument, type DesktopDocumentBridge } from "./desktop-extraction";

test("keeps the static web reader independent from a desktop runtime", async () => {
  await expect(openDesktopDocument(() => undefined, undefined)).resolves.toEqual({ status: "unavailable" });
});

test("validates a native document and forwards typed extraction progress", async () => {
  const bridge: DesktopDocumentBridge = {
    async open(onProgress) {
      onProgress({ event: "recognizingPage", data: { pageNumber: 2 } });
      onProgress({ event: "recognizingPage", data: { pageNumber: "invalid" } });
      return {
        fileName: "scan.pdf",
        document: {
          version: 1,
          text: "Scanned locally",
          pages: [{ pageNumber: 1, text: "Scanned locally", provenance: { kind: "canonicalOcr" } }],
          diagnostics: [],
        },
      };
    },
  };
  const progress: unknown[] = [];

  const result = await openDesktopDocument((event) => progress.push(event), bridge);

  expect(result).toEqual({
    status: "opened",
    fileName: "scan.pdf",
    document: {
      version: 1,
      text: "Scanned locally",
      pages: [{ pageNumber: 1, text: "Scanned locally", provenance: { kind: "canonicalOcr" } }],
      diagnostics: [],
    },
  });
  expect(progress).toEqual([{ event: "recognizingPage", data: { pageNumber: 2 } }]);
});

test("turns structured Tauri command failures into adapter errors", async () => {
  const bridge: DesktopDocumentBridge = {
    async open() {
      throw { kind: "invalidText", message: "notes.txt is not valid UTF-8 text" };
    },
  };

  await expect(openDesktopDocument(() => undefined, bridge)).resolves.toEqual({
    status: "error",
    message: "notes.txt is not valid UTF-8 text",
  });
});
