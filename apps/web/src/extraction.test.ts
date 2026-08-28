import { expect, test } from "bun:test";

import { extractPdfDocument } from "./extraction";

test("extracts a PDF through the configured service contract", async () => {
  const result = await extractPdfDocument(
    new Blob(["pdf"]),
    "https://extract.example/extract/pdf",
    async () => new Response(JSON.stringify({ version: 1, text: "Extracted text", pages: [], diagnostics: [] })),
  );

  expect(result).toEqual({
    ok: true,
    document: { version: 1, text: "Extracted text", pages: [], diagnostics: [] },
  });
});

test("retains a useful plain-text mode when extraction is unavailable", async () => {
  await expect(extractPdfDocument(new Blob(["pdf"]), undefined)).resolves.toEqual({
    ok: false,
    message: "PDF extraction is not configured for this static deployment.",
  });
});
