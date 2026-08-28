import { isReadingDocument, type ReadingDocument } from "./extraction";

export type DesktopExtractionProgress =
  | Readonly<{ event: "selected"; data: Readonly<{ fileName: string }> }>
  | Readonly<{ event: "reading" }>
  | Readonly<{ event: "extractingPdf"; data: Readonly<{ pageCount: number }> }>
  | Readonly<{ event: "recognizingPage"; data: Readonly<{ pageNumber: number }> }>
  | Readonly<{ event: "finished"; data: Readonly<{ pageCount: number }> }>;

export type DesktopOpenResult =
  | Readonly<{ status: "unavailable" }>
  | Readonly<{ status: "cancelled" }>
  | Readonly<{ status: "opened"; fileName: string; document: ReadingDocument }>
  | Readonly<{ status: "error"; message: string }>;

export type DesktopDocumentBridge = Readonly<{
  open: (onProgress: (progress: unknown) => void) => Promise<unknown>;
}>;

export function isDesktopShell(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function openDesktopDocument(
  onProgress: (progress: DesktopExtractionProgress) => void,
  bridge: DesktopDocumentBridge | undefined = desktopDocumentBridge(),
): Promise<DesktopOpenResult> {
  if (bridge === undefined) return { status: "unavailable" };

  try {
    const value = await bridge.open((progress) => {
      if (isDesktopExtractionProgress(progress)) onProgress(progress);
    });
    if (value === null) return { status: "cancelled" };
    if (!isOpenedDocument(value)) {
      return { status: "error", message: "The desktop shell returned an invalid reading document." };
    }
    return { status: "opened", fileName: value.fileName, document: value.document };
  } catch (error) {
    return { status: "error", message: desktopErrorMessage(error) };
  }
}

function desktopDocumentBridge(): DesktopDocumentBridge | undefined {
  if (!isDesktopShell()) return undefined;
  return {
    async open(onProgress) {
      const { Channel, invoke } = await import("@tauri-apps/api/core");
      const channel = new Channel<unknown>();
      channel.onmessage = onProgress;
      return invoke<unknown>("open_document", { onProgress: channel });
    },
  };
}

function isOpenedDocument(value: unknown): value is Readonly<{
  fileName: string;
  document: ReadingDocument;
}> {
  if (typeof value !== "object" || value === null) return false;
  const opened = value as Record<string, unknown>;
  return typeof opened.fileName === "string" && isReadingDocument(opened.document);
}

function isDesktopExtractionProgress(value: unknown): value is DesktopExtractionProgress {
  if (typeof value !== "object" || value === null || !("event" in value)) return false;
  const progress = value as Record<string, unknown>;
  if (progress.event === "reading") return true;
  if (typeof progress.data !== "object" || progress.data === null) return false;
  const data = progress.data as Record<string, unknown>;
  switch (progress.event) {
    case "selected":
      return typeof data.fileName === "string";
    case "extractingPdf":
    case "finished":
      return typeof data.pageCount === "number";
    case "recognizingPage":
      return typeof data.pageNumber === "number";
    default:
      return false;
  }
}

function desktopErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  if (typeof error === "string" && error !== "") return error;
  return "The desktop shell could not open this document.";
}
