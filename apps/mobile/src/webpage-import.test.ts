import { expect, test } from "bun:test";

import { createExpoWebPageImportAdapter } from "./webpage-import";

test("imports a public URL through the configured reader service", async () => {
  const requests: string[] = [];
  const adapter = createExpoWebPageImportAdapter(
    "https://reader.example/",
    async (url) => {
      requests.push(url);
      return new Response([
        "Title: Mobile article",
        "",
        "Markdown Content:",
        "# Mobile article",
        "",
        "Relevant mobile text.",
      ].join("\n"));
    },
  );

  const result = await adapter.importWebPage("example.com/article");
  expect(requests).toEqual([
    "https://reader.example/https://example.com/article",
  ]);
  expect(result).toMatchObject({
    ok: true,
    title: "Mobile article",
    url: "https://example.com/article",
    extractionMode: "remote-reader",
  });
  if (result.ok) {
    expect(result.document.text).toBe("Mobile article\nRelevant mobile text.");
  }
});
