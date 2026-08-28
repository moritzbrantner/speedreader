"use client";

import { useCallback, useEffect, useState } from "react";
import { useSpeedReader } from "@moritzbrantner/speed-reading/react";
import { readerFixture } from "@moritzbrantner/speed-reading/fixture";

import { extractPdfDocument, type ExtractionResult } from "./extraction";
import {
  isDesktopShell,
  openDesktopDocument,
  type DesktopExtractionProgress,
} from "./desktop-extraction";

export function ReaderScreen() {
  const [text, setText] = useState(readerFixture);
  const [extraction, setExtraction] = useState<ExtractionResult | undefined>();
  const [desktopAvailable, setDesktopAvailable] = useState(false);
  const [desktopProgress, setDesktopProgress] = useState<DesktopExtractionProgress | undefined>();
  const reader = useSpeedReader(text);
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
    const result = await extractPdfDocument(file, process.env.NEXT_PUBLIC_EXTRACTION_URL);
    setExtraction(result);
    if (result.ok) setText(result.document.text);
  };

  const openNativeDocument = async () => {
    setExtraction(undefined);
    const result = await openDesktopDocument(setDesktopProgress);
    setDesktopProgress(undefined);
    if (result.status === "opened") {
      setText(result.document.text);
      setExtraction({ ok: true, document: result.document });
    } else if (result.status === "error") {
      setExtraction({ ok: false, message: result.message });
    }
  };

  return (
    <main style={{ display: "grid", gap: 24, margin: "auto", maxWidth: 960, minHeight: "100dvh", padding: 24 }}>
      <header>
        <h1>Speedreader</h1>
        <p>Paste text to read locally, or import a PDF through a configured extraction service.</p>
      </header>
      {desktopAvailable ? (
        <button type="button" onClick={() => void openNativeDocument()}>
          Open local text or PDF
        </button>
      ) : null}
      <label style={{ display: "grid", gap: 8 }}>
        Source text
        <textarea value={text} onChange={(event) => setText(event.target.value)} rows={8} />
      </label>
      <label>
        Import PDF
        <input type="file" accept="application/pdf" onChange={(event) => void importPdf(event.target.files?.[0])} />
      </label>
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
