import { expect, test } from "bun:test";

import { extractWebPageDocument } from "./webpage-extraction";

test("imports directly readable text without using the remote reader", async () => {
  const requests: string[] = [];
  const result = await extractWebPageDocument("example.com/article", {
    fetchImplementation: async (url) => {
      requests.push(url);
      return new Response("Direct article text", {
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    },
  });

  expect(requests).toEqual(["https://example.com/article"]);
  expect(result).toMatchObject({
    ok: true,
    title: "example.com",
    url: "https://example.com/article",
    extractionMode: "browser",
  });
  if (result.ok) expect(result.document.text).toBe("Direct article text");
});

test("falls back to a remote reader for public sites that block browser fetching", async () => {
  const requests: string[] = [];
  const result = await extractWebPageDocument("https://example.com/story", {
    fetchImplementation: async (url) => {
      requests.push(url);
      if (requests.length === 1) throw new TypeError("Failed to fetch");
      return new Response([
        "Title: Useful story",
        "URL Source: https://example.com/story",
        "",
        "Markdown Content:",
        "# Useful story",
        "",
        "Relevant first paragraph.",
        "",
        "- Relevant list item",
      ].join("\n"));
    },
    remoteReaderPrefix: "https://reader.example/",
  });

  expect(requests).toEqual([
    "https://example.com/story",
    "https://reader.example/https://example.com/story",
  ]);
  expect(result).toMatchObject({
    ok: true,
    title: "Useful story",
    extractionMode: "remote-reader",
  });
  if (result.ok) {
    expect(result.document.text).toBe(
      "Useful story\nRelevant first paragraph.\nRelevant list item",
    );
    expect(
      result.document.pages[0]?.regions?.map((region) => region.role),
    ).toEqual(["heading", "content", "content"]);
    expect(result.document.diagnostics[0]?.kind).toBe("remoteReaderFallback");
  }
});

test("never sends local or private-network URLs to the remote reader", async () => {
  let requests = 0;
  const result = await extractWebPageDocument("http://127.0.0.1:8080/private", {
    fetchImplementation: async () => {
      requests += 1;
      throw new TypeError("Failed to fetch");
    },
    remoteReaderPrefix: "https://reader.example/",
  });

  expect(requests).toBe(1);
  expect(result).toEqual({
    ok: false,
    message: "Failed to fetch Local and private-network addresses are never sent to the remote reader fallback.",
  });
});

test("rejects non-web and credential-bearing URLs before fetching", async () => {
  let requests = 0;
  const fetchImplementation = async () => {
    requests += 1;
    return new Response("unexpected");
  };

  expect(
    await extractWebPageDocument("javascript:alert(1)", { fetchImplementation }),
  ).toEqual({
    ok: false,
    message: "Enter a valid public http or https URL.",
  });
  expect(
    await extractWebPageDocument(
      "https://user:secret@example.com",
      { fetchImplementation },
    ),
  ).toEqual({
    ok: false,
    message: "Enter a valid public http or https URL.",
  });
  expect(requests).toBe(0);
});
