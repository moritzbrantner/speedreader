import type { ReadingDocument } from "./extraction";

export type BrowserPdfExtractionProgress = Readonly<{
  stage: "initializing" | "inspecting" | "loadingOcr" | "rendering" | "recognizing" | "assembling";
  pageNumber?: number;
  pageCount?: number;
}>;

type WorkerMessage =
  | Readonly<{ type: "progress"; requestId: number; progress: BrowserPdfExtractionProgress }>
  | Readonly<{ type: "result"; requestId: number; document: unknown }>
  | Readonly<{ type: "error"; requestId: number; message: string }>;

export async function extractPdfInBrowser(
  file: Blob,
  onProgress?: (progress: BrowserPdfExtractionProgress) => void,
): Promise<unknown> {
  if (typeof Worker === "undefined" || typeof document === "undefined") {
    throw new Error("Local browser PDF extraction is unavailable in this environment.");
  }
  if (typeof OffscreenCanvas === "undefined") {
    throw new Error("This browser does not support the off-screen canvas required for local PDF extraction.");
  }

  const requestId = 1;
  const assetBase = new URL("./", document.baseURI).href;
  const workerUrl = new URL("pdf-extraction-worker.js", assetBase);
  const worker = new Worker(workerUrl, { type: "module", name: "speedreader-pdf-extraction" });
  const pdf = await file.arrayBuffer();

  return await new Promise<ReadingDocument>((resolve, reject) => {
    worker.addEventListener("message", (event: MessageEvent<WorkerMessage>) => {
      const message = event.data;
      if (message.requestId !== requestId) return;
      if (message.type === "progress") {
        onProgress?.(message.progress);
        return;
      }
      worker.terminate();
      if (message.type === "result") resolve(message.document as ReadingDocument);
      else reject(new Error(message.message));
    });
    worker.addEventListener("error", (event) => {
      worker.terminate();
      reject(new Error(event.message || "The local PDF extraction worker failed."));
    });
    worker.postMessage({ type: "extract", requestId, pdf, assetBase }, [pdf]);
  });
}
