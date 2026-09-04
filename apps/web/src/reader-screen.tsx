"use client";

import { useCallback, useEffect, useState } from "react";
import { readerFixture } from "@moritzbrantner/speed-reading/fixture";
import { createReadingDocument } from "@moritzbrantner/speed-reading/persistence";
import { useDurableSpeedReader } from "@moritzbrantner/speed-reading/react";

import { extractPdfDocument, type ExtractionResult } from "./extraction";
import {
  isDesktopShell,
  openDesktopDocument,
  type DesktopExtractionProgress,
} from "./desktop-extraction";
import { createPlatformReaderPersistence } from "./platform-persistence";

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
  const [importingPdf, setImportingPdf] = useState(false);
  const [desktopAvailable, setDesktopAvailable] = useState(false);
  const [desktopProgress, setDesktopProgress] = useState<DesktopExtractionProgress | undefined>();
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

  const importPdf = async (file: File | undefined) => {
    if (file === undefined) return;
    setExtraction(undefined);
    setImportingPdf(true);
    const result = await extractPdfDocument(file, process.env.NEXT_PUBLIC_EXTRACTION_URL);
    setImportingPdf(false);
    setExtraction(result);
    if (result.ok) {
      reader.openDocument(createReadingDocument({
        title: file.name,
        text: result.document.text,
        source: "pdf",
        updatedAt: new Date().toISOString(),
      }));
    }
  };

  const openNativeDocument = async () => {
    setExtraction(undefined);
    const result = await openDesktopDocument(setDesktopProgress);
    setDesktopProgress(undefined);
    if (result.status === "opened") {
      reader.openDocument(createReadingDocument({
        title: result.fileName,
        text: result.document.text,
        source: result.fileName.toLowerCase().endsWith(".pdf") ? "pdf" : "plain-text",
        updatedAt: new Date().toISOString(),
      }));
      setExtraction({ ok: true, document: result.document });
    } else if (result.status === "error") {
      setExtraction({ ok: false, message: result.message });
    }
  };

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
          onChange={(event) => reader.setText(event.target.value)}
          rows={8}
        />
      </label>
      <label>
        Import PDF
        <input type="file" accept="application/pdf" disabled={importingPdf} onChange={(event) => void importPdf(event.target.files?.[0])} />
      </label>
      {importingPdf ? <p role="status">Extracting PDF locally… Scanned pages may load OCR models on first use.</p> : null}
      {desktopProgress !== undefined ? <p role="status">{desktopProgressMessage(desktopProgress)}</p> : null}
      {extraction !== undefined && !extraction.ok ? <p role="status">{extraction.message}</p> : null}
      {extraction?.ok ? <p role="status">Imported {extraction.document.pages.length} pages.</p> : null}
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
