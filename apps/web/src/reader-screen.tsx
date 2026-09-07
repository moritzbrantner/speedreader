"use client";

import { useCallback, useEffect, useState } from "react";
import { readerFixture } from "@moritzbrantner/speed-reading/fixture";
import { createReadingDocument } from "@moritzbrantner/speed-reading/persistence";
import { useDurableSpeedReader } from "@moritzbrantner/speed-reading/react";

import {
  extractPdfDocument,
  type DocumentTextRole,
  type ExtractionResult,
  type ReadingDocument,
} from "./extraction";
import {
  isDesktopShell,
  openDesktopDocument,
  type DesktopExtractionProgress,
} from "./desktop-extraction";
import { createPlatformReaderPersistence } from "./platform-persistence";
import {
  projectDocumentText,
  regionIncludedBySemanticFilters,
  semanticReviewRegions,
  semanticRoleStats,
  type SemanticFilterMode,
  type SemanticRegionOverrides,
  type SemanticRoleModes,
} from "./semantic-filter";

const initialDocument = createReadingDocument({
  id: "local-draft",
  title: "Local draft",
  text: readerFixture,
  source: "plain-text",
  updatedAt: "1970-01-01T00:00:00.000Z",
});
const readerPersistence = createPlatformReaderPersistence();

export function ReaderScreen() {
  const [extraction, setExtraction] = useState<ExtractionResult | undefined>();
  const [importError, setImportError] = useState<string | undefined>();
  const [importingPdf, setImportingPdf] = useState(false);
  const [desktopAvailable, setDesktopAvailable] = useState(false);
  const [desktopProgress, setDesktopProgress] = useState<DesktopExtractionProgress | undefined>();
  const [semanticRoleModes, setSemanticRoleModes] = useState<SemanticRoleModes>({});
  const [semanticRegionOverrides, setSemanticRegionOverrides] = useState<SemanticRegionOverrides>({});
  const reader = useDurableSpeedReader({ initialDocument, persistence: readerPersistence });
  const toggle = useCallback(() => {
    if (reader.isPlaying) reader.pause();
    else reader.play();
  }, [reader]);

  useEffect(() => {
    setDesktopAvailable(isDesktopShell());
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.code === "Space") {
        event.preventDefault();
        toggle();
      }
      if (event.code === "ArrowLeft") reader.seek(reader.progress.chunkIndex - 1);
      if (event.code === "ArrowRight") reader.seek(reader.progress.chunkIndex + 1);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [reader, toggle]);

  const openExtractedDocument = (
    title: string,
    source: "pdf" | "plain-text",
    document: ReadingDocument,
  ) => {
    setSemanticRoleModes({});
    setSemanticRegionOverrides({});
    reader.openDocument(createReadingDocument({
      title,
      text: document.text,
      source,
      updatedAt: new Date().toISOString(),
    }));
  };

  const importPdf = async (file: File | undefined) => {
    if (file === undefined) return;
    setImportError(undefined);
    setImportingPdf(true);
    const result = await extractPdfDocument(file, process.env.NEXT_PUBLIC_EXTRACTION_URL);
    setImportingPdf(false);
    if (result.ok) {
      setExtraction(result);
      openExtractedDocument(file.name, "pdf", result.document);
    } else {
      setImportError(result.message);
    }
  };

  const openNativeDocument = async () => {
    setImportError(undefined);
    const result = await openDesktopDocument(setDesktopProgress);
    setDesktopProgress(undefined);
    if (result.status === "opened") {
      openExtractedDocument(
        result.fileName,
        result.fileName.toLowerCase().endsWith(".pdf") ? "pdf" : "plain-text",
        result.document,
      );
      setExtraction({ ok: true, document: result.document });
    } else if (result.status === "error") {
      setImportError(result.message);
    }
  };

  const applySemanticProjection = (
    roleModes: SemanticRoleModes,
    regionOverrides: SemanticRegionOverrides,
  ) => {
    if (!extraction?.ok) return;
    reader.setReadingText(projectDocumentText(extraction.document, roleModes, regionOverrides));
  };

  const updateSemanticRole = (role: DocumentTextRole, mode: SemanticFilterMode) => {
    const nextRoleModes: Partial<Record<DocumentTextRole, SemanticFilterMode>> = {
      ...semanticRoleModes,
    };
    if (mode === "default") delete nextRoleModes[role];
    else nextRoleModes[role] = mode;
    setSemanticRoleModes(nextRoleModes);
    applySemanticProjection(nextRoleModes, semanticRegionOverrides);
  };

  const updateSemanticRegion = (key: string, included: boolean) => {
    const nextRegionOverrides = { ...semanticRegionOverrides, [key]: included };
    setSemanticRegionOverrides(nextRegionOverrides);
    applySemanticProjection(semanticRoleModes, nextRegionOverrides);
  };

  const clearSemanticRegion = (key: string) => {
    const nextRegionOverrides = { ...semanticRegionOverrides };
    delete nextRegionOverrides[key];
    setSemanticRegionOverrides(nextRegionOverrides);
    applySemanticProjection(semanticRoleModes, nextRegionOverrides);
  };

  const resetSemanticFilters = () => {
    setSemanticRoleModes({});
    setSemanticRegionOverrides({});
    if (extraction?.ok) reader.setReadingText(extraction.document.text);
  };

  const semanticStats = extraction?.ok
    ? semanticRoleStats(extraction.document, semanticRoleModes, semanticRegionOverrides)
    : [];
  const reviewRegions = extraction?.ok ? semanticReviewRegions(extraction.document) : [];
  const hasSemanticMetadata = semanticStats.some((stats) => stats.regionCount > 0);
  const hasSemanticOverrides =
    Object.keys(semanticRoleModes).length > 0 || Object.keys(semanticRegionOverrides).length > 0;

  return (
    <main style={{ display: "grid", gap: 24, margin: "auto", maxWidth: 960, minHeight: "100dvh", padding: 24 }}>
      <header>
        <h1>Speedreader</h1>
        <p>Paste text or import a PDF. Web PDF extraction runs locally in your browser, including OCR for scanned pages.</p>
      </header>
      {desktopAvailable ? (
        <button type="button" onClick={() => void openNativeDocument()}>
          Open local text or PDF
        </button>
      ) : null}
      <label style={{ display: "grid", gap: 8 }}>
        Source text
        <textarea
          value={reader.document.text}
          onChange={(event) => {
            setExtraction(undefined);
            setImportError(undefined);
            setSemanticRoleModes({});
            setSemanticRegionOverrides({});
            reader.setText(event.target.value);
          }}
          rows={8}
        />
      </label>
      <label>
        Import PDF
        <input type="file" accept="application/pdf" disabled={importingPdf} onChange={(event) => void importPdf(event.target.files?.[0])} />
      </label>
      {importingPdf ? <p role="status">Extracting PDF locally… Scanned pages may load OCR models on first use.</p> : null}
      {desktopProgress !== undefined ? <p role="status">{desktopProgressMessage(desktopProgress)}</p> : null}
      {importError !== undefined ? <p role="status">{importError}</p> : null}
      {extraction?.ok ? <p role="status">Imported {extraction.document.pages.length} pages.</p> : null}
      {extraction?.ok && hasSemanticMetadata ? (
        <section aria-labelledby="semantic-filters-heading" style={{ display: "grid", gap: 16 }}>
          <div style={{ alignItems: "start", display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "space-between" }}>
            <div style={{ maxWidth: 720 }}>
              <h2 id="semantic-filters-heading">Semantic filters</h2>
              <p>
                Review what the extractor classified before reading. Overrides change only the reading projection; the original regions, roles, confidence, and evidence remain available.
              </p>
            </div>
            <button type="button" disabled={!hasSemanticOverrides} onClick={resetSemanticFilters}>
              Reset filters
            </button>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", minWidth: 640, width: "100%" }}>
              <thead>
                <tr>
                  <th scope="col" style={{ padding: 8, textAlign: "left" }}>Role</th>
                  <th scope="col" style={{ padding: 8, textAlign: "left" }}>Detected</th>
                  <th scope="col" style={{ padding: 8, textAlign: "left" }}>Extraction default</th>
                  <th scope="col" style={{ padding: 8, textAlign: "left" }}>Reading now</th>
                  <th scope="col" style={{ padding: 8, textAlign: "left" }}>Policy</th>
                </tr>
              </thead>
              <tbody>
                {semanticStats.filter((stats) => stats.regionCount > 0).map((stats) => (
                  <tr key={stats.role} style={{ borderTop: "1px solid currentColor" }}>
                    <th scope="row" style={{ padding: 8, textAlign: "left" }}>{semanticLabel(stats.role)}</th>
                    <td style={{ padding: 8 }}>{stats.regionCount}</td>
                    <td style={{ padding: 8 }}>{`${stats.defaultIncludedCount} included`}</td>
                    <td style={{ padding: 8 }}>{`${stats.effectiveIncludedCount} included`}</td>
                    <td style={{ padding: 8 }}>
                      <select
                        aria-label={`${semanticLabel(stats.role)} policy`}
                        value={semanticRoleModes[stats.role] ?? "default"}
                        onChange={(event) => updateSemanticRole(stats.role, event.target.value as SemanticFilterMode)}
                      >
                        <option value="default">Use extraction default</option>
                        <option value="include">Include all</option>
                        <option value="exclude">Exclude all</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {reviewRegions.length > 0 ? (
            <details>
              <summary>Review classified regions ({reviewRegions.length})</summary>
              <p>Individual choices override the role policy, so one misclassified line can be corrected without changing every footer, header, footnote, or sidebar.</p>
              <div style={{ display: "grid", gap: 8 }}>
                {reviewRegions.map(({ key, pageNumber, region }) => {
                  const included = regionIncludedBySemanticFilters(
                    pageNumber,
                    region,
                    semanticRoleModes,
                    semanticRegionOverrides,
                  );
                  const overridden = Object.prototype.hasOwnProperty.call(semanticRegionOverrides, key);
                  return (
                    <div key={key} style={{ borderTop: "1px solid currentColor", display: "grid", gap: 6, padding: "10px 0" }}>
                      <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 10 }}>
                        <label style={{ alignItems: "center", display: "flex", gap: 6 }}>
                          <input
                            type="checkbox"
                            checked={included}
                            onChange={(event) => updateSemanticRegion(key, event.target.checked)}
                          />
                          Include
                        </label>
                        <strong>{`${semanticLabel(region.role)} · page ${pageNumber}`}</strong>
                        {region.confidence === null ? null : <span>{`${region.confidence}% role confidence`}</span>}
                        {overridden ? (
                          <button type="button" onClick={() => clearSemanticRegion(key)}>
                            Use role policy
                          </button>
                        ) : null}
                      </div>
                      <div>{region.text}</div>
                      {region.evidence.length > 0 ? (
                        <small>{`Evidence: ${region.evidence.map(semanticLabel).join(", ")}`}</small>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </details>
          ) : null}
        </section>
      ) : null}
      <section aria-label="Reader" style={{ display: "grid", gap: 16, textAlign: "center" }}>
        <output aria-live="polite" style={{ fontSize: "clamp(2rem, 8vw, 5rem)", minHeight: "1.2em" }}>
          {reader.currentChunk?.text ?? "Finished"}
        </output>
        <progress value={reader.progress.chunkIndex} max={reader.progress.totalChunks || 1} />
        <p>{`${reader.progress.chunkIndex} / ${reader.progress.totalChunks}`}</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
          <button type="button" onClick={() => reader.seek(reader.progress.chunkIndex - 1)}>Previous</button>
          <button type="button" onClick={toggle}>{reader.isPlaying ? "Pause" : "Play"}</button>
          <button type="button" onClick={() => reader.seek(reader.progress.chunkIndex + 1)}>Next</button>
        </div>
        <label>
          Words per minute {reader.settings.wordsPerMinute}
          <input type="range" min="60" max="900" step="10" value={reader.settings.wordsPerMinute} onChange={(event) => reader.setWordsPerMinute(Number(event.target.value))} />
        </label>
        <label>
          Words per chunk
          <select value={reader.settings.chunkSize} onChange={(event) => reader.setChunkSize(Number(event.target.value))}>
            {[1, 2, 3, 4].map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
        </label>
      </section>
    </main>
  );
}

function semanticLabel(value: string): string {
  const spaced = value.replace(/([a-z])([A-Z])/g, "$1 $2");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function desktopProgressMessage(progress: DesktopExtractionProgress): string {
  switch (progress.event) {
    case "selected":
      return `Opening ${progress.data.fileName}…`;
    case "reading":
      return "Reading the local document…";
    case "extractingPdf":
      return `Extracting ${progress.data.pageCount} PDF pages locally…`;
    case "recognizingPage":
      return `Recognizing scanned page ${progress.data.pageNumber} locally…`;
    case "finished":
      return `Finished extracting ${progress.data.pageCount} pages.`;
  }
}
