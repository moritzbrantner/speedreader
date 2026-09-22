import { expect, test } from "bun:test";

import {
  extractRemoteWebPageDocument,
  isSafeForRemoteReader,
  normalizeWebUrl,
} from "./index";

test("normalizes public web URLs and rejects non-web schemes or credentials", () => {
  expect(normalizeWebUrl("example.com/article")?.href).toBe("https://example.com/article");
  expect(normalizeWebUrl("javascript:alert(1)")).toBeUndefined();
  expect(normalizeWebUrl("https://user:secret@example.com")).toBeUndefined();
});

test("parses remote reader output into the canonical semantic document", async () => {
  const requests: string[] = [];
  const result = await extractRemoteWebPageDocument("https://example.com/story", {
    fetchImplementation: async (url) => {
      requests.push(url);
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

  expect(requests).toEqual(["https://reader.example/https://example.com/story"]);
  expect(result).toMatchObject({
    ok: true,
    title: "Useful story",
    url: "https://example.com/story",
    extractionMode: "remote-reader",
  });
  if (result.ok) {
    expect(result.document.text).toBe(
      "Useful story\nRelevant first paragraph.\nRelevant list item",
    );
    expect(result.document.pages[0]?.regions?.map((region) => region.role))
      .toEqual(["heading", "content", "content"]);
  }
});

test("keeps local, private, and single-label hosts out of remote extraction", async () => {
  expect(isSafeForRemoteReader(new URL("http://127.0.0.1/private"))).toBeFalse();
  expect(isSafeForRemoteReader(new URL("http://192.168.1.2/private"))).toBeFalse();
  expect(isSafeForRemoteReader(new URL("http://intranet/private"))).toBeFalse();
  expect(isSafeForRemoteReader(new URL("http://service.internal/private"))).toBeFalse();
  expect(isSafeForRemoteReader(new URL("http://localhost./private"))).toBeFalse();
  expect(isSafeForRemoteReader(new URL("http://intranet./private"))).toBeFalse();
  expect(isSafeForRemoteReader(new URL("http://[::ffff:127.0.0.1]/private"))).toBeFalse();
  expect(isSafeForRemoteReader(new URL("https://fctech.example/article"))).toBeTrue();

  let requests = 0;
  const result = await extractRemoteWebPageDocument("http://127.0.0.1/private", {
    fetchImplementation: async () => {
      requests += 1;
      return new Response("unexpected");
    },
    remoteReaderPrefix: "https://reader.example/",
  });
  expect(requests).toBe(0);
  expect(result).toEqual({
    ok: false,
    message: "Local and private-network addresses are never sent to the remote reader fallback.",
  });
});


test("keeps capped document text and semantic regions consistent", async () => {
  const oversized = "x".repeat(600_000);
  const result = await extractRemoteWebPageDocument("https://example.com/large", {
    fetchImplementation: async () => new Response([
      "Title: Large article",
      "",
      "Markdown Content:",
      oversized,
    ].join("\n")),
    remoteReaderPrefix: "https://reader.example/",
  });

  expect(result.ok).toBeTrue();
  if (!result.ok) return;

  const regions = result.document.pages[0]?.regions ?? [];
  const projected = regions
    .filter((region) => region.includeInReading)
    .map((region) => region.text)
    .join("\n");

  expect(result.document.text).toBe(projected);
  expect(result.document.text.length).toBeLessThanOrEqual(500_000);
  expect(result.document.pages[0]?.text.length).toBeLessThanOrEqual(500_000);
});
