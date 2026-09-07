import type {
  DocumentTextRegion,
  DocumentTextRole,
  ReadingDocument,
} from "./extraction";

export const semanticDocumentRoles = [
  "content",
  "heading",
  "caption",
  "table",
  "form",
  "footnote",
  "sidebar",
  "header",
  "footer",
  "pageNumber",
] as const satisfies readonly DocumentTextRole[];

export type SemanticFilterMode = "default" | "include" | "exclude";
export type SemanticRoleModes = Readonly<
  Partial<Record<DocumentTextRole, SemanticFilterMode>>
>;
export type SemanticRegionOverrides = Readonly<Partial<Record<string, boolean>>>;

export type SemanticRoleStats = Readonly<{
  role: DocumentTextRole;
  regionCount: number;
  defaultIncludedCount: number;
  effectiveIncludedCount: number;
}>;

export type SemanticReviewRegion = Readonly<{
  key: string;
  pageNumber: number;
  region: DocumentTextRegion;
}>;

export function semanticRegionKey(pageNumber: number, sourceLineIndex: number): string {
  return `${pageNumber}:${sourceLineIndex}`;
}

export function regionIncludedBySemanticFilters(
  pageNumber: number,
  region: DocumentTextRegion,
  roleModes: SemanticRoleModes = {},
  regionOverrides: SemanticRegionOverrides = {},
): boolean {
  const regionOverride = regionOverrides[
    semanticRegionKey(pageNumber, region.sourceLineIndex)
  ];
  if (regionOverride !== undefined) return regionOverride;

  switch (roleModes[region.role] ?? "default") {
    case "include":
      return true;
    case "exclude":
      return false;
    case "default":
      return region.includeInReading;
  }
}

export function projectDocumentText(
  document: ReadingDocument,
  roleModes: SemanticRoleModes = {},
  regionOverrides: SemanticRegionOverrides = {},
): string {
  if (document.pages.length === 0) return document.text;

  return document.pages
    .map((page) => {
      if (page.regions === undefined || page.regions.length === 0) return page.text;

      return page.regions
        .filter((region) =>
          regionIncludedBySemanticFilters(
            page.pageNumber,
            region,
            roleModes,
            regionOverrides,
          ),
        )
        .map((region) => region.text)
        .join("\n");
    })
    .filter((text) => text.length > 0)
    .join("\n\n");
}

export function semanticRoleStats(
  document: ReadingDocument,
  roleModes: SemanticRoleModes = {},
  regionOverrides: SemanticRegionOverrides = {},
): readonly SemanticRoleStats[] {
  return semanticDocumentRoles.map((role) => {
    let regionCount = 0;
    let defaultIncludedCount = 0;
    let effectiveIncludedCount = 0;

    for (const page of document.pages) {
      for (const region of page.regions ?? []) {
        if (region.role !== role) continue;
        regionCount += 1;
        if (region.includeInReading) defaultIncludedCount += 1;
        if (
          regionIncludedBySemanticFilters(
            page.pageNumber,
            region,
            roleModes,
            regionOverrides,
          )
        ) {
          effectiveIncludedCount += 1;
        }
      }
    }

    return {
      role,
      regionCount,
      defaultIncludedCount,
      effectiveIncludedCount,
    };
  });
}

export function semanticReviewRegions(
  document: ReadingDocument,
): readonly SemanticReviewRegion[] {
  return document.pages.flatMap((page) =>
    (page.regions ?? [])
      .filter((region) => region.role !== "content" || !region.includeInReading)
      .map((region) => ({
        key: semanticRegionKey(page.pageNumber, region.sourceLineIndex),
        pageNumber: page.pageNumber,
        region,
      })),
  );
}
