import type {
  DocumentTextRegion,
  DocumentTextRole,
} from "./extraction";
import {
  createTextRegion,
  createWebPageExtractionResult,
  extractRemoteWebPageDocument,
  normalizeWebUrl,
  type ParsedWebPage,
  type WebPageExtractionResult,
  type WebPageFetch,
} from "@speedreader/webpage-extraction";

export type { WebPageExtractionResult } from "@speedreader/webpage-extraction";

type ExtractWebPageOptions = Readonly<{
  fetchImplementation?: WebPageFetch;
  remoteReaderPrefix?: string;
}>;

const maximumSourceCharacters = 2_000_000;
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
            return createWebPageExtractionResult(parsed, target, "browser");
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

  return extractRemoteWebPageDocument(target.href, {
    fetchImplementation,
    remoteReaderPrefix: options.remoteReaderPrefix,
    failureContext: directFailure,
  });
}

function parseReadableHtml(source: string, target: URL): ParsedWebPage {
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
    regions: text === "" ? [] : [createTextRegion(0, text, "content", true)],
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
  return createTextRegion(
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

function parsePlainTextPage(source: string, target: URL): ParsedWebPage {
  const text = normalizedText(source);
  return {
    title: target.hostname,
    regions: text === "" ? [] : [createTextRegion(0, text, "content", true)],
  };
}

function normalizedText(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}
