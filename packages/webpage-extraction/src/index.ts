import type {
  DocumentTextRegion,
  DocumentTextRole,
  ReadingDocument,
} from "@moritzbrantner/speed-reading/document";

export type WebPageExtractionMode = "browser" | "remote-reader";

export type WebPageExtractionResult =
  | Readonly<{
      ok: true;
      document: ReadingDocument;
      title: string;
      url: string;
      extractionMode: WebPageExtractionMode;
    }>
  | Readonly<{ ok: false; message: string }>;

export type ParsedWebPage = Readonly<{
  title: string;
  regions: readonly DocumentTextRegion[];
}>;

export type WebPageFetch = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export type RemoteWebPageExtractionOptions = Readonly<{
  fetchImplementation?: WebPageFetch;
  remoteReaderPrefix?: string;
  failureContext?: string;
}>;

const defaultRemoteReaderPrefix = "https://r.jina.ai/";
const maximumSourceCharacters = 2_000_000;
const maximumReadingCharacters = 500_000;

export async function extractRemoteWebPageDocument(
  input: string,
  options: RemoteWebPageExtractionOptions = {},
): Promise<WebPageExtractionResult> {
  const target = normalizeWebUrl(input);
  if (target === undefined) {
    return { ok: false, message: "Enter a valid public http or https URL." };
  }

  const failureContext = options.failureContext === undefined
    ? ""
    : options.failureContext.trim() + " ";
  const remoteReaderPrefix = options.remoteReaderPrefix ?? defaultRemoteReaderPrefix;
  if (remoteReaderPrefix === "") {
    return {
      ok: false,
      message: (failureContext + "Remote reader fallback is disabled.").trim(),
    };
  }
  if (!isSafeForRemoteReader(target)) {
    return {
      ok: false,
      message: (failureContext
        + "Local and private-network addresses are never sent to the remote reader fallback.").trim(),
    };
  }

  const fetchImplementation = options.fetchImplementation ?? fetch;
  try {
    const response = await fetchImplementation(remoteReaderPrefix + target.href, {
      method: "GET",
      headers: { accept: "text/plain" },
    });
    if (!response.ok) {
      return {
        ok: false,
        message: "Remote webpage extraction failed with HTTP " + response.status + ".",
      };
    }
    const markdown = await response.text();
    if (markdown.length > maximumSourceCharacters) {
      return { ok: false, message: "The extracted webpage is too large to import." };
    }
    const parsed = parseRemoteReaderResponse(markdown, target);
    if (parsed.regions.length === 0) {
      return {
        ok: false,
        message: "The remote reader could not find readable article text.",
      };
    }
    return createWebPageExtractionResult(parsed, target, "remote-reader");
  } catch {
    return {
      ok: false,
      message: (failureContext + "The remote reader could not be reached.").trim(),
    };
  }
}

export function createWebPageExtractionResult(
  parsed: ParsedWebPage,
  target: URL,
  extractionMode: WebPageExtractionMode,
): WebPageExtractionResult {
  const defaultText = parsed.regions
    .filter((region) => region.includeInReading)
    .map((region) => region.text)
    .join("\n")
    .slice(0, maximumReadingCharacters)
    .trim();
  const document: ReadingDocument = {
    version: 1,
    text: defaultText,
    pages: [
      {
        pageNumber: 1,
        text: parsed.regions.map((region) => region.text).join("\n"),
        provenance: {
          source: "web",
          url: target.href,
          extractor: extractionMode,
        },
        readingOrder: {
          strategy: "sourceOrder",
          regionIndices: parsed.regions.map((_, index) => index),
        },
        regions: parsed.regions,
      },
    ],
    diagnostics: extractionMode === "remote-reader"
      ? [{
          kind: "remoteReaderFallback",
          text: "The configured remote reader fetched and cleaned the public webpage.",
          pages: [1],
        }]
      : [],
  };
  return {
    ok: true,
    document,
    title: parsed.title,
    url: target.href,
    extractionMode,
  };
}

export function parseRemoteReaderResponse(
  source: string,
  target: URL,
): ParsedWebPage {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const titleLine = lines.find((line) => line.startsWith("Title:"));
  const title = titleLine?.slice("Title:".length).trim() || target.hostname;
  const markerIndex = lines.findIndex((line) => line.trim() === "Markdown Content:");
  const contentLines = markerIndex >= 0
    ? lines.slice(markerIndex + 1)
    : lines.filter((line) => !/^(?:Title|URL Source|Published Time):/.test(line));
  const regions: DocumentTextRegion[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    const text = normalizedText(paragraph.join(" "));
    paragraph = [];
    if (text !== "") {
      regions.push(createRegion(regions.length, stripMarkdown(text), "content", true));
    }
  };

  for (const rawLine of contentLines) {
    const line = rawLine.trim();
    if (line === "") {
      flushParagraph();
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading !== null) {
      flushParagraph();
      regions.push(
        createRegion(regions.length, stripMarkdown(heading[2]), "heading", true),
      );
      continue;
    }
    if (/^\|?\s*:?-{3,}/.test(line)) continue;
    if (line.startsWith("|")) {
      flushParagraph();
      regions.push(
        createRegion(
          regions.length,
          stripMarkdown(line.replace(/\|/g, " ")),
          "table",
          true,
        ),
      );
      continue;
    }
    const listItem = /^(?:[-*+] |\d+[.)] )(.+)$/.exec(line);
    if (listItem !== null) {
      flushParagraph();
      regions.push(
        createRegion(regions.length, stripMarkdown(listItem[1]), "content", true),
      );
      continue;
    }
    paragraph.push(line.replace(/^>\s?/, ""));
  }
  flushParagraph();
  return { title, regions: regions.filter((region) => region.text !== "") };
}

export function createTextRegion(
  sourceLineIndex: number,
  text: string,
  role: DocumentTextRole,
  includeInReading: boolean,
): DocumentTextRegion {
  return createRegion(sourceLineIndex, text, role, includeInReading);
}

export function normalizeWebUrl(input: string): URL | undefined {
  const trimmed = input.trim();
  if (trimmed === "") return undefined;
  if (/^[a-z][a-z\d+.-]*:/i.test(trimmed) && !/^https?:\/\//i.test(trimmed)) {
    return undefined;
  }
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : "https://" + trimmed;
  try {
    const url = new URL(candidate);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:")
      || url.username !== ""
      || url.password !== ""
    ) {
      return undefined;
    }
    url.hash = "";
    return url;
  } catch {
    return undefined;
  }
}

export function isSafeForRemoteReader(url: URL): boolean {
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    hostname === "localhost"
    || hostname.endsWith(".localhost")
    || hostname.endsWith(".local")
    || hostname.endsWith(".internal")
    || hostname.endsWith(".lan")
  ) {
    return false;
  }
  if (hostname.includes(":")) {
    return !(
      hostname === "::1"
      || hostname.startsWith("fc")
      || hostname.startsWith("fd")
      || hostname.startsWith("fe80:")
    );
  }
  const octets = hostname.split(".").map(Number);
  if (
    octets.length !== 4
    || octets.some(
      (octet) => !Number.isInteger(octet) || octet < 0 || octet > 255,
    )
  ) {
    return hostname.includes(".");
  }
  if (octets[0] === 10 || octets[0] === 127 || octets[0] === 0) return false;
  if (octets[0] === 169 && octets[1] === 254) return false;
  if (octets[0] === 192 && octets[1] === 168) return false;
  if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return false;
  return true;
}

function createRegion(
  sourceLineIndex: number,
  text: string,
  role: DocumentTextRole,
  includeInReading: boolean,
): DocumentTextRegion {
  return {
    sourceLineIndex,
    text,
    role,
    confidence: null,
    evidence: [],
    includeInReading,
  };
}

function stripMarkdown(value: string): string {
  return normalizedText(
    value
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/[\x60*_~]/g, "")
      .replace(/<[^>]+>/g, " "),
  );
}

function normalizedText(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}
