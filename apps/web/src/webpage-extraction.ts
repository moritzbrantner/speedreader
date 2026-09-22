import type {
  DocumentTextRegion,
  DocumentTextRole,
  ReadingDocument,
} from "./extraction";

export type WebPageExtractionResult =
  | Readonly<{
      ok: true;
      document: ReadingDocument;
      title: string;
      url: string;
      extractionMode: "browser" | "remote-reader";
    }>
  | Readonly<{ ok: false; message: string }>;

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

type ExtractWebPageOptions = Readonly<{
  fetchImplementation?: Fetch;
  remoteReaderPrefix?: string;
}>;

type ParsedPage = Readonly<{
  title: string;
  regions: readonly DocumentTextRegion[];
}>;

const defaultRemoteReaderPrefix = "https://r.jina.ai/";
const maximumSourceCharacters = 2_000_000;
const maximumReadingCharacters = 500_000;
const blockSelector = "h1,h2,h3,h4,h5,h6,p,li,blockquote,pre,figcaption,table";
const noiseSelector = [
  "script",
  "style",
  "noscript",
  "template",
  "svg",
  "canvas",
  "iframe",
  "nav",
  "header",
  "footer",
  "aside",
  "form",
  "dialog",
  "button",
  "input",
  "select",
  "textarea",
  "[hidden]",
  '[aria-hidden="true"]',
].join(",");

export async function extractWebPageDocument(
  input: string,
  options: ExtractWebPageOptions = {},
): Promise<WebPageExtractionResult> {
  const target = normalizeWebUrl(input);
  if (target === undefined) {
    return { ok: false, message: "Enter a valid public http or https URL." };
  }

  const fetchImplementation = options.fetchImplementation ?? fetch;
  let directFailure: string | undefined;

  try {
    const response = await fetchImplementation(target.href, {
      method: "GET",
      headers: {
        accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1",
      },
    });
    if (!response.ok) {
      directFailure = "The website returned HTTP " + response.status + ".";
    } else {
      const contentLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(contentLength) && contentLength > maximumSourceCharacters) {
        directFailure = "The webpage is too large to import directly.";
      } else {
        const source = await response.text();
        if (source.length > maximumSourceCharacters) {
          directFailure = "The webpage is too large to import directly.";
        } else {
          const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
          const parsed = contentType.includes("text/plain")
            ? parsePlainTextPage(source, target)
            : parseReadableHtml(source, target);
          if (parsed.regions.length > 0) {
            return successfulExtraction(parsed, target, "browser");
          }
          directFailure = "No readable article text was found on the webpage.";
        }
      }
    }
  } catch (error) {
    directFailure = error instanceof Error
      ? error.message
      : "The website could not be fetched in the browser.";
  }

  const remoteReaderPrefix = options.remoteReaderPrefix ?? defaultRemoteReaderPrefix;
  if (remoteReaderPrefix === "") {
    return {
      ok: false,
      message: (directFailure ?? "The webpage could not be imported.") + " Remote reader fallback is disabled.",
    };
  }
  if (!isSafeForRemoteReader(target)) {
    return {
      ok: false,
      message: (directFailure ?? "The webpage could not be imported.")
        + " Local and private-network addresses are never sent to the remote reader fallback.",
    };
  }

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
    return successfulExtraction(parsed, target, "remote-reader");
  } catch {
    return {
      ok: false,
      message: (directFailure ?? "The webpage could not be fetched in the browser.")
        + " The remote reader fallback could not be reached.",
    };
  }
}

function successfulExtraction(
  parsed: ParsedPage,
  target: URL,
  extractionMode: "browser" | "remote-reader",
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
          text: "Direct browser access was unavailable, so the configured remote reader fetched and cleaned the public webpage.",
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

function parseReadableHtml(source: string, target: URL): ParsedPage {
  if (typeof DOMParser === "undefined") {
    throw new Error("Browser webpage parsing is unavailable in this environment.");
  }
  const document = new DOMParser().parseFromString(source, "text/html");
  const title = document.querySelector('meta[property="og:title"]')?.getAttribute("content")?.trim()
    || document.querySelector('meta[name="twitter:title"]')?.getAttribute("content")?.trim()
    || document.title.trim()
    || target.hostname;

  const candidates = [
    ...document.querySelectorAll<HTMLElement>("article,main,[role=main]"),
    document.body,
  ].filter((candidate): candidate is HTMLElement => candidate !== null);

  let best: HTMLElement | undefined;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const candidate of candidates) {
    const clone = cleanClone(candidate);
    const textLength = normalizedText(clone.textContent ?? "").length;
    if (textLength === 0) continue;
    const linkLength = [...clone.querySelectorAll("a")]
      .reduce((total, link) => total + normalizedText(link.textContent ?? "").length, 0);
    const paragraphCount = clone.querySelectorAll("p").length;
    const headingCount = clone.querySelectorAll("h1,h2,h3,h4,h5,h6").length;
    const semanticBonus = candidate.matches("article,main,[role=main]") ? 4_000 : 0;
    const linkPenalty = Math.round((linkLength / textLength) * 700);
    const score = textLength + paragraphCount * 90 + headingCount * 35 + semanticBonus - linkPenalty;
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  if (best === undefined) return { title, regions: [] };
  const root = cleanClone(best);
  const blocks = [...root.querySelectorAll<HTMLElement>(blockSelector)]
    .filter((element) => !hasSelectedBlockAncestor(element, root));
  const regions = blocks
    .map((element, sourceLineIndex) => regionFromElement(element, sourceLineIndex))
    .filter((region): region is DocumentTextRegion => region !== undefined);

  if (regions.length > 0) return { title, regions };
  const text = normalizedText(root.textContent ?? "");
  return {
    title,
    regions: text === "" ? [] : [createRegion(0, text, "content", true)],
  };
}

function cleanClone(element: HTMLElement): HTMLElement {
  const clone = element.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(noiseSelector).forEach((node) => node.remove());
  return clone;
}

function hasSelectedBlockAncestor(element: HTMLElement, root: HTMLElement): boolean {
  let parent = element.parentElement;
  while (parent !== null && parent !== root) {
    if (parent.matches(blockSelector)) return true;
    parent = parent.parentElement;
  }
  return false;
}

function regionFromElement(
  element: HTMLElement,
  sourceLineIndex: number,
): DocumentTextRegion | undefined {
  const text = normalizedText(element.textContent ?? "");
  if (text === "") return undefined;
  const role = roleForElement(element);
  return createRegion(
    sourceLineIndex,
    text,
    role,
    role !== "footnote" && role !== "sidebar",
  );
}

function roleForElement(element: HTMLElement): DocumentTextRole {
  if (element.matches("h1,h2,h3,h4,h5,h6")) return "heading";
  if (element.matches("figcaption")) return "caption";
  if (element.matches("table")) return "table";
  const semanticHint = (element.id + " " + element.className).toLowerCase();
  if (/footnote|endnote|reference/.test(semanticHint)) return "footnote";
  if (/sidebar|related|recommend/.test(semanticHint)) return "sidebar";
  return "content";
}

function parsePlainTextPage(source: string, target: URL): ParsedPage {
  const text = normalizedText(source);
  return {
    title: target.hostname,
    regions: text === "" ? [] : [createRegion(0, text, "content", true)],
  };
}

function parseRemoteReaderResponse(source: string, target: URL): ParsedPage {
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

function normalizeWebUrl(input: string): URL | undefined {
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

function isSafeForRemoteReader(url: URL): boolean {
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    hostname === "localhost"
    || hostname.endsWith(".localhost")
    || hostname.endsWith(".local")
  ) {
    return false;
  }
  if (
    hostname === "::1"
    || hostname.startsWith("fc")
    || hostname.startsWith("fd")
    || hostname.startsWith("fe80:")
  ) {
    return false;
  }
  const octets = hostname.split(".").map(Number);
  if (
    octets.length !== 4
    || octets.some(
      (octet) => !Number.isInteger(octet) || octet < 0 || octet > 255,
    )
  ) {
    return true;
  }
  if (octets[0] === 10 || octets[0] === 127 || octets[0] === 0) return false;
  if (octets[0] === 169 && octets[1] === 254) return false;
  if (octets[0] === 192 && octets[1] === 168) return false;
  if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return false;
  return true;
}
