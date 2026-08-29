export type ReaderLayoutMode = "compact" | "wide";

export function readerLayoutMode(width: number, height: number): ReaderLayoutMode {
  const isTabletWidth = width >= 768;
  const isUsableLandscape = width > height && width >= 640;
  return isTabletWidth || isUsableLandscape ? "wide" : "compact";
}
