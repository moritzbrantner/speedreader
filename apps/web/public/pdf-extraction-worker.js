const OCR_MODELS = {
  detection: {
    url: "https://ocrs-models.s3-accelerate.amazonaws.com/text-detection.rten",
    sha256: "f15cfb56bd02c4bf478a20343986504a1f01e1665c2b3a0ad66340f054b1b5ca",
  },
  recognition: {
    url: "https://ocrs-models.s3-accelerate.amazonaws.com/text-recognition.rten",
    sha256: "e484866d4cce403175bd8d00b128feb08ab42e208de30e42cd9889d8f1735a6e",
  },
};

let wasmPromise;
let pdfjsPromise;
let ocrPromise;

self.addEventListener("message", (event) => {
  if (event.data?.type !== "extract") return;
  void extract(event.data).catch((error) => {
    self.postMessage({
      type: "error",
      requestId: event.data.requestId,
      message: error instanceof Error ? error.message : String(error),
    });
  });
});

async function extract({ requestId, pdf, assetBase }) {
  report(requestId, { stage: "initializing" });
  const wasm = await loadWasm(assetBase);
  const pdfBytes = new Uint8Array(pdf);

  report(requestId, { stage: "inspecting" });
  const pages = JSON.parse(wasm.inspectPdf(pdfBytes));
  const scannedPages = pages.filter((page) => page.embeddedText.trim() === "");

  if (scannedPages.length > 0) {
    const [pdfjs, ocr] = await Promise.all([
      loadPdfJs(assetBase),
      loadOcr(wasm, requestId),
    ]);
    const loadingTask = pdfjs.getDocument({ data: pdfBytes });
    const pdfDocument = await loadingTask.promise;

    try {
      for (const pageInput of scannedPages) {
        report(requestId, {
          stage: "rendering",
          pageNumber: pageInput.pageNumber,
          pageCount: pages.length,
        });
        const page = await pdfDocument.getPage(pageInput.pageNumber);
        const viewport = page.getViewport({ scale: 2 });
        const width = Math.max(1, Math.ceil(viewport.width));
        const height = Math.max(1, Math.ceil(viewport.height));
        const canvas = new OffscreenCanvas(width, height);
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (context === null) throw new Error("This browser cannot create an off-screen PDF canvas.");

        await page.render({ canvasContext: context, viewport }).promise;
        const image = context.getImageData(0, 0, width, height);
        report(requestId, {
          stage: "recognizing",
          pageNumber: pageInput.pageNumber,
          pageCount: pages.length,
        });
        pageInput.ocrText = ocr.recognizeRgba(width, height, image.data);
        page.cleanup();
      }
    } finally {
      await pdfDocument.destroy();
    }
  }

  report(requestId, { stage: "assembling", pageCount: pages.length });
  const document = JSON.parse(wasm.assembleReadingDocument(JSON.stringify(pages)));
  self.postMessage({ type: "result", requestId, document });
}

async function loadWasm(assetBase) {
  wasmPromise ??= (async () => {
    const moduleUrl = new URL("wasm/document_extraction.js", assetBase).href;
    const wasmUrl = new URL("wasm/document_extraction_bg.wasm", assetBase).href;
    const module = await import(moduleUrl);
    await module.default(wasmUrl);
    return module;
  })();
  return wasmPromise;
}

async function loadPdfJs(assetBase) {
  pdfjsPromise ??= (async () => {
    const moduleUrl = new URL("pdfjs/pdf.mjs", assetBase).href;
    const module = await import(moduleUrl);
    module.GlobalWorkerOptions.workerSrc = new URL("pdfjs/pdf.worker.mjs", assetBase).href;
    return module;
  })();
  return pdfjsPromise;
}

async function loadOcr(wasm, requestId) {
  ocrPromise ??= (async () => {
    report(requestId, { stage: "loadingOcr" });
    const [detectionModel, recognitionModel] = await Promise.all([
      fetchVerifiedModel(OCR_MODELS.detection),
      fetchVerifiedModel(OCR_MODELS.recognition),
    ]);
    return new wasm.BrowserOcr(detectionModel, recognitionModel);
  })();
  return ocrPromise;
}

async function fetchVerifiedModel(model) {
  const response = await fetch(model.url, { cache: "force-cache" });
  if (!response.ok) {
    throw new Error(`Unable to download browser OCR model (${response.status}).`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const actualDigest = await sha256(bytes);
  if (actualDigest !== model.sha256) {
    throw new Error("Browser OCR model integrity check failed.");
  }
  return bytes;
}

async function sha256(bytes) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function report(requestId, progress) {
  self.postMessage({ type: "progress", requestId, progress });
}
