import type {
  DocumentTextRegion,
  DocumentTextRole,
  ExtractedPage,
} from "./extraction";
import {
  regionIncludedBySemanticFilters,
  semanticRegionKey,
  type SemanticRegionOverrides,
  type SemanticRoleModes,
} from "./semantic-filter";

export type PreviewBounds = Readonly<{
  left: number;
  top: number;
  width: number;
  height: number;
}>;

export type PreviewTextLine = Readonly<{
  text: string;
  bounds: PreviewBounds;
}>;

export type SemanticPreviewOverlay = Readonly<{
  key: string;
  role: DocumentTextRole;
  text: string;
  included: boolean;
  bounds: PreviewBounds;
}>;

export function semanticPreviewOverlays(
  page: ExtractedPage,
  textLines: readonly PreviewTextLine[],
  roleModes: SemanticRoleModes = {},
  regionOverrides: SemanticRegionOverrides = {},
): readonly SemanticPreviewOverlay[] {
  const usedTextLines = new Set<number>();
  const overlays: SemanticPreviewOverlay[] = [];

  for (const region of page.regions ?? []) {
    const key = semanticRegionKey(page.pageNumber, region.sourceLineIndex);
    if (!shouldShowRegion(region, key, roleModes, regionOverrides)) continue;

    const bounds =
      normalizedOcrBounds(page, region) ??
      matchedTextBounds(region, textLines, usedTextLines);
    if (bounds === undefined) continue;

    overlays.push({
      key,
      role: region.role,
      text: region.text,
      included: regionIncludedBySemanticFilters(
        page.pageNumber,
        region,
        roleModes,
        regionOverrides,
      ),
      bounds,
    });
  }

  return overlays;
}

function shouldShowRegion(
  region: DocumentTextRegion,
  key: string,
  roleModes: SemanticRoleModes,
  regionOverrides: SemanticRegionOverrides,
): boolean {
  const roleMode = roleModes[region.role];
  return (
    region.role !== "content" ||
    !region.includeInReading ||
    (roleMode !== undefined && roleMode !== "default") ||
    Object.prototype.hasOwnProperty.call(regionOverrides, key)
  );
}

function normalizedOcrBounds(
  page: ExtractedPage,
  region: DocumentTextRegion,
): PreviewBounds | undefined {
  const sourceSize = page.sourceImageSize;
  const sourceBounds = region.ocr?.region;
  if (
    sourceSize === undefined ||
    sourceSize === null ||
    sourceBounds === undefined ||
    sourceBounds === null ||
    sourceSize.width <= 0 ||
    sourceSize.height <= 0
  ) {
    return undefined;
  }

  return clampBounds({
    left: sourceBounds.x / sourceSize.width,
    top: sourceBounds.y / sourceSize.height,
    width: sourceBounds.width / sourceSize.width,
    height: sourceBounds.height / sourceSize.height,
  });
}

function matchedTextBounds(
  region: DocumentTextRegion,
  lines: readonly PreviewTextLine[],
  usedTextLines: Set<number>,
): PreviewBounds | undefined {
  const target = normalizeMatchText(region.text);
  if (target.length === 0) return undefined;

  const exactMatches: number[] = [];
  const partialMatches: number[] = [];

  for (const [index, line] of lines.entries()) {
    if (usedTextLines.has(index)) continue;
    const candidate = normalizeMatchText(line.text);
    if (candidate.length === 0) continue;
    if (candidate === target) {
      exactMatches.push(index);
      continue;
    }
    if (
      Math.min(candidate.length, target.length) >= 4 &&
      (candidate.includes(target) || target.includes(candidate))
    ) {
      partialMatches.push(index);
    }
  }

  const matches = exactMatches.length > 0 ? exactMatches : partialMatches;
  if (matches.length === 0) return undefined;

  const selected = selectBestMatch(matches, lines, region.role);
  usedTextLines.add(selected);
  return clampBounds(lines[selected]?.bounds);
}

function selectBestMatch(
  matches: readonly number[],
  lines: readonly PreviewTextLine[],
  role: DocumentTextRole,
): number {
  return matches.reduce((best, candidate) => {
    const bestBounds = lines[best]?.bounds;
    const candidateBounds = lines[candidate]?.bounds;
    if (bestBounds === undefined) return candidate;
    if (candidateBounds === undefined) return best;

    const bestScore = positionScore(bestBounds, role);
    const candidateScore = positionScore(candidateBounds, role);
    if (candidateScore < bestScore) return candidate;
    return best;
  });
}

function positionScore(bounds: PreviewBounds, role: DocumentTextRole): number {
  const center = bounds.top + bounds.height / 2;
  switch (role) {
    case "header":
      return center;
    case "footer":
    case "pageNumber":
      return 1 - center;
    case "footnote":
      return Math.abs(0.9 - center);
    case "heading":
      return Math.abs(0.2 - center);
    default:
      return 0;
  }
}

function normalizeMatchText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/\u00ad/g, "")
    .toLowerCase()
    .replace(/[.,;:!?()[\]{}'"“”‘’\-–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function clampBounds(bounds: PreviewBounds | undefined): PreviewBounds | undefined {
  if (bounds === undefined) return undefined;

  const left = clampUnit(bounds.left);
  const top = clampUnit(bounds.top);
  const right = clampUnit(bounds.left + bounds.width);
  const bottom = clampUnit(bounds.top + bounds.height);
  if (right <= left || bottom <= top) return undefined;

  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
  };
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}
