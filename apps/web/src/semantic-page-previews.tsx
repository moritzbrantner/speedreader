"use client";

import { useEffect, useMemo, useState } from "react";

import type { ReadingDocument } from "./extraction";
import {
  semanticPreviewOverlays,
  type PreviewBounds,
  type PreviewTextLine,
} from "./semantic-page-preview";
import type {
  SemanticRegionOverrides,
  SemanticRoleModes,
} from "./semantic-filter";

const thumbnailWidth = 132;

type SemanticPagePreviewsProps = Readonly<{
  file: Blob;
  document: ReadingDocument;
  roleModes: SemanticRoleModes;
  regionOverrides: SemanticRegionOverrides;
}>;

type RenderedPagePreview = Readonly<{
  pageNumber: number;
  imageUrl: string;
  aspectRatio: number;
  textLines: readonly PreviewTextLine[];
}>;

type PdfJsModule = Readonly<{
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (options: { data: Uint8Array }) => Readonly<{
    promise: Promise<PdfDocument>;
  }>;
}>;

type PdfDocument = Readonly<{
  getPage: (pageNumber: number) => Promise<PdfPage>;
  destroy: () => Promise<void>;
}>;

type PdfPage = Readonly<{
  getViewport: (options: { scale: number }) => PdfViewport;
  getTextContent: () => Promise<Readonly<{ items: readonly unknown[] }>>;
  render: (options: {
    canvasContext: CanvasRenderingContext2D;
    viewport: PdfViewport;
    background?: string;
  }) => Readonly<{ promise: Promise<void> }>;
  cleanup: () => void;
}>;

type PdfViewport = Readonly<{
  width: number;
  height: number;
  scale: number;
  transform: readonly number[];
}>;

type PdfTextItem = Readonly<{
  str: string;
  width: number;
  transform: readonly number[];
}>;

type TextFragment = Readonly<{
  text: string;
  bounds: PreviewBounds;
}>;

export function SemanticPagePreviews({
  file,
  document: readingDocument,
  roleModes,
  regionOverrides,
}: SemanticPagePreviewsProps) {
  const [previews, setPreviews] = useState<
    Readonly<Record<number, RenderedPagePreview>>
  >({});
  const [previewError, setPreviewError] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let pdfDocument: PdfDocument | undefined;

    setPreviews({});
    setPreviewError(undefined);
    setLoading(true);

    void (async () => {
      try {
        const pdfjs = (await import("pdfjs-dist")) as unknown as PdfJsModule;
        const assetBase = new URL("./", globalThis.document.baseURI);
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs/pdf.worker.mjs",
          assetBase,
        ).href;

        const bytes = new Uint8Array(await file.arrayBuffer());
        pdfDocument = await pdfjs.getDocument({ data: bytes }).promise;

        for (const extractedPage of readingDocument.pages) {
          if (cancelled) break;
          const page = await pdfDocument.getPage(extractedPage.pageNumber);
          const preview = await renderPagePreview(page, extractedPage.pageNumber);
          page.cleanup();
          if (cancelled) break;

          setPreviews((current) => ({
            ...current,
            [preview.pageNumber]: preview,
          }));
        }
      } catch (error) {
        if (!cancelled) {
          setPreviewError(
            error instanceof Error
              ? error.message
              : "Unable to render PDF page previews.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
        if (pdfDocument !== undefined) await pdfDocument.destroy();
      }
    })();

    return () => {
      cancelled = true;
      if (pdfDocument !== undefined) void pdfDocument.destroy();
    };
  }, [file, readingDocument]);

  const overlayCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const page of readingDocument.pages) {
      const preview = previews[page.pageNumber];
      if (preview === undefined) continue;
      counts[page.pageNumber] = semanticPreviewOverlays(
        page,
        preview.textLines,
        roleModes,
        regionOverrides,
      ).length;
    }
    return counts;
  }, [previews, readingDocument.pages, regionOverrides, roleModes]);

  return (
    <section aria-labelledby="semantic-page-previews-heading" style={{ display: "grid", gap: 10 }}>
      <div>
        <h3 id="semantic-page-previews-heading" style={{ marginBottom: 4 }}>
          Page previews
        </h3>
        <p style={{ margin: 0 }}>
          Solid boxes are excluded from reading; dashed boxes are included. The boxes follow the current semantic filter policy.
        </p>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", fontSize: "0.875rem", gap: 12 }}>
        <span style={{ alignItems: "center", display: "inline-flex", gap: 6 }}>
          <span aria-hidden="true" style={{ border: "2px solid #c2410c", display: "inline-block", height: 10, width: 16 }} />
          Excluded
        </span>
        <span style={{ alignItems: "center", display: "inline-flex", gap: 6 }}>
          <span aria-hidden="true" style={{ border: "2px dashed #2563eb", display: "inline-block", height: 10, width: 16 }} />
          Included
        </span>
      </div>
      <div
        aria-label="PDF page previews"
        style={{
          display: "flex",
          gap: 12,
          maxWidth: "100%",
          overflowX: "auto",
          paddingBottom: 8,
          scrollSnapType: "x proximity",
        }}
      >
        {readingDocument.pages.map((page) => {
          const preview = previews[page.pageNumber];
          const overlays =
            preview === undefined
              ? []
              : semanticPreviewOverlays(
                  page,
                  preview.textLines,
                  roleModes,
                  regionOverrides,
                );

          return (
            <figure
              key={page.pageNumber}
              style={{
                flex: `0 0 ${thumbnailWidth}px`,
                margin: 0,
                scrollSnapAlign: "start",
                width: thumbnailWidth,
              }}
            >
              <div
                style={{
                  aspectRatio: preview?.aspectRatio ?? 0.72,
                  background: "#f4f4f5",
                  border: "1px solid #71717a",
                  overflow: "hidden",
                  position: "relative",
                  width: "100%",
                }}
              >
                {preview === undefined ? (
                  <span
                    style={{
                      color: "#52525b",
                      display: "grid",
                      fontSize: "0.75rem",
                      height: "100%",
                      placeItems: "center",
                    }}
                  >
                    Loading…
                  </span>
                ) : (
                  <>
                    <img
                      alt=""
                      aria-hidden="true"
                      src={preview.imageUrl}
                      style={{ display: "block", height: "100%", objectFit: "contain", width: "100%" }}
                    />
                    {overlays.map((overlay) => (
                      <span
                        key={overlay.key}
                        aria-label={`${semanticLabel(overlay.role)}: ${overlay.included ? "included" : "excluded"}`}
                        role="img"
                        title={`${semanticLabel(overlay.role)} · ${overlay.included ? "included" : "excluded"} · ${overlay.text}`}
                        style={{
                          background: overlay.included
                            ? "rgba(37, 99, 235, 0.12)"
                            : "rgba(194, 65, 12, 0.18)",
                          border: overlay.included
                            ? "2px dashed #2563eb"
                            : "2px solid #c2410c",
                          boxSizing: "border-box",
                          height: `${overlay.bounds.height * 100}%`,
                          left: `${overlay.bounds.left * 100}%`,
                          pointerEvents: "none",
                          position: "absolute",
                          top: `${overlay.bounds.top * 100}%`,
                          width: `${overlay.bounds.width * 100}%`,
                        }}
                      />
                    ))}
                  </>
                )}
              </div>
              <figcaption style={{ fontSize: "0.75rem", marginTop: 4 }}>
                {preview === undefined
                  ? `Page ${page.pageNumber}`
                  : `Page ${page.pageNumber} · ${overlayCounts[page.pageNumber] ?? 0} boxes`}
              </figcaption>
            </figure>
          );
        })}
      </div>
      {loading ? <small role="status">Rendering page previews locally…</small> : null}
      {previewError === undefined ? null : (
        <small role="status">{`Page previews unavailable: ${previewError}`}</small>
      )}
    </section>
  );
}

async function renderPagePreview(
  page: PdfPage,
  pageNumber: number,
): Promise<RenderedPagePreview> {
  const baseViewport = page.getViewport({ scale: 1 });
  const displayScale = thumbnailWidth / Math.max(1, baseViewport.width);
  const displayViewport = page.getViewport({ scale: displayScale });
  const renderScale =
    displayScale * Math.min(Math.max(globalThis.devicePixelRatio || 1, 1), 2);
  const renderViewport = page.getViewport({ scale: renderScale });
  const canvas = globalThis.document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(renderViewport.width));
  canvas.height = Math.max(1, Math.ceil(renderViewport.height));
  const context = canvas.getContext("2d", { alpha: false });
  if (context === null) throw new Error("This browser cannot render PDF previews.");

  await page.render({
    canvasContext: context,
    viewport: renderViewport,
    background: "#ffffff",
  }).promise;
  const textContent = await page.getTextContent();

  return {
    pageNumber,
    imageUrl: canvas.toDataURL("image/jpeg", 0.78),
    aspectRatio: displayViewport.width / Math.max(1, displayViewport.height),
    textLines: buildPreviewTextLines(textContent.items, displayViewport),
  };
}

function buildPreviewTextLines(
  items: readonly unknown[],
  viewport: PdfViewport,
): readonly PreviewTextLine[] {
  const fragments = items
    .filter(isPdfTextItem)
    .map((item) => textFragment(item, viewport))
    .filter((fragment): fragment is TextFragment => fragment !== undefined)
    .sort((left, right) => {
      const vertical = left.bounds.top - right.bounds.top;
      if (Math.abs(vertical) > 0.004) return vertical;
      return left.bounds.left - right.bounds.left;
    });

  const lines: Array<{ fragments: TextFragment[]; center: number; height: number }> = [];
  for (const fragment of fragments) {
    const center = fragment.bounds.top + fragment.bounds.height / 2;
    const previous = lines.at(-1);
    const tolerance = Math.max(
      0.006,
      Math.min(previous?.height ?? fragment.bounds.height, fragment.bounds.height) * 0.6,
    );
    if (previous !== undefined && Math.abs(previous.center - center) <= tolerance) {
      previous.fragments.push(fragment);
      previous.center =
        previous.fragments.reduce(
          (sum, item) => sum + item.bounds.top + item.bounds.height / 2,
          0,
        ) / previous.fragments.length;
      previous.height = Math.max(previous.height, fragment.bounds.height);
    } else {
      lines.push({
        fragments: [fragment],
        center,
        height: fragment.bounds.height,
      });
    }
  }

  return lines.map((line) => {
    line.fragments.sort((left, right) => left.bounds.left - right.bounds.left);
    return {
      text: line.fragments.map((fragment) => fragment.text.trim()).filter(Boolean).join(" "),
      bounds: unionBounds(line.fragments.map((fragment) => fragment.bounds)),
    };
  });
}

function textFragment(
  item: PdfTextItem,
  viewport: PdfViewport,
): TextFragment | undefined {
  if (item.str.trim().length === 0 || item.transform.length < 6 || viewport.transform.length < 6) {
    return undefined;
  }

  const transform = multiplyTransforms(viewport.transform, item.transform);
  const height = Math.max(1, Math.hypot(transform[2] ?? 0, transform[3] ?? 0));
  const left = transform[4] ?? 0;
  const top = (transform[5] ?? 0) - height;
  const width = Math.max(1, Math.abs(item.width * viewport.scale));

  return {
    text: item.str,
    bounds: {
      left: left / Math.max(1, viewport.width),
      top: top / Math.max(1, viewport.height),
      width: width / Math.max(1, viewport.width),
      height: height / Math.max(1, viewport.height),
    },
  };
}

function isPdfTextItem(value: unknown): value is PdfTextItem {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.str === "string" &&
    typeof item.width === "number" &&
    Array.isArray(item.transform) &&
    item.transform.every((entry) => typeof entry === "number")
  );
}

function multiplyTransforms(
  left: readonly number[],
  right: readonly number[],
): readonly number[] {
  const [a1 = 1, b1 = 0, c1 = 0, d1 = 1, e1 = 0, f1 = 0] = left;
  const [a2 = 1, b2 = 0, c2 = 0, d2 = 1, e2 = 0, f2 = 0] = right;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

function unionBounds(bounds: readonly PreviewBounds[]): PreviewBounds {
  const left = Math.min(...bounds.map((item) => item.left));
  const top = Math.min(...bounds.map((item) => item.top));
  const right = Math.max(...bounds.map((item) => item.left + item.width));
  const bottom = Math.max(...bounds.map((item) => item.top + item.height));
  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
  };
}

function semanticLabel(value: string): string {
  const spaced = value.replace(/([a-z])([A-Z])/g, "$1 $2");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
