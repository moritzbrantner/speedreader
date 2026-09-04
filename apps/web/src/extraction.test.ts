import { expect, test } from "bun:test";

import { extractPdfDocument } from "./extraction";

const document = { version: 1, text: "Extracted text", pages: [], diagnostics: [] } as const;

test("extracts a PDF through the configured service contract", async () => {
  const result = await extractPdfDocument(
    new Blob(["pdf"]),
    "https://extract.example/extract/pdf",
    async () => new Response(JSON.stringify(document)),
  );

  expect(result).toEqual({ ok: true, document });
});

test("extracts a PDF locally when no service is configured", async () => {
  const result = await extractPdfDocument(
    new Blob(["pdf"]),
    undefined,
    undefined,
    async () => document,
  );

  expect(result).toEqual({ ok: true, document });
});

test("reports local browser extraction failures", async () => {
  const result = await extractPdfDocument(
    new Blob(["pdf"]),
    undefined,
    undefined,
    async () => {
      throw new Error("Browser OCR is unavailable.");
    },
  );

  expect(result).toEqual({ ok: false, message: "Browser OCR is unavailable." });
});
