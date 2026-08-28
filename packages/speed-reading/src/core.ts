export type ReaderSettings = Readonly<{
  chunkSize: number;
  wordsPerMinute: number;
  segmentation: SegmentationPolicy;
}>;

export type SegmentationPolicy = "whitespace" | "punctuation";

export type ReaderChunk = Readonly<{
  index: number;
  text: string;
  words: readonly string[];
  pivot: number;
}>;

export type ReaderProgress = Readonly<{
  chunkIndex: number;
  completed: boolean;
  totalChunks: number;
}>;

export const defaultReaderSettings: ReaderSettings = {
  chunkSize: 1,
  wordsPerMinute: 300,
  segmentation: "whitespace",
};

export function wordsFromText(text: string): readonly string[] {
  const normalized = text.trim();
  return normalized === "" ? [] : normalized.split(/\s+/u);
}

export function segmentsFromText(
  text: string,
  segmentation: SegmentationPolicy = "whitespace",
): readonly string[] {
  if (segmentation === "whitespace") return wordsFromText(text);

  return text.match(/\p{L}[\p{L}\p{M}\p{N}'’-]*[.!?,;:…]*/gu) ?? [];
}

export function pivotIndex(word: string): number {
  if (word.length === 0) return 0;
  return Math.min(word.length - 1, Math.floor(word.length * 0.35));
}

export function chunkText(
  text: string,
  chunkSize = 1,
  segmentation: SegmentationPolicy = "whitespace",
): readonly ReaderChunk[] {
  if (!Number.isInteger(chunkSize) || chunkSize < 1) {
    throw new RangeError("chunkSize must be a positive integer");
  }

  const words = segmentsFromText(text, segmentation);
  const chunks: ReaderChunk[] = [];
  for (let start = 0; start < words.length; start += chunkSize) {
    const chunkWords = words.slice(start, start + chunkSize);
    const chunkTextValue = chunkWords.join(" ");
    chunks.push({
      index: chunks.length,
      text: chunkTextValue,
      words: chunkWords,
      pivot: pivotIndex(chunkTextValue),
    });
  }
  return chunks;
}

export function millisecondsPerChunk(
  wordsPerMinute: number,
  wordsInChunk = 1,
): number {
  if (!Number.isFinite(wordsPerMinute) || wordsPerMinute <= 0) {
    throw new RangeError("wordsPerMinute must be greater than zero");
  }
  if (!Number.isInteger(wordsInChunk) || wordsInChunk < 1) {
    throw new RangeError("wordsInChunk must be a positive integer");
  }
  return (60_000 / wordsPerMinute) * wordsInChunk;
}

export function punctuationMultiplier(text: string): number {
  if (/[.!?…][”"')\]]*$/u.test(text)) return 1.6;
  if (/[,;:][”"')\]]*$/u.test(text)) return 1.2;
  return 1;
}

export function millisecondsForChunk(chunk: ReaderChunk, wordsPerMinute: number): number {
  return millisecondsPerChunk(wordsPerMinute, chunk.words.length) * punctuationMultiplier(chunk.text);
}

export function progressFor(
  chunks: readonly ReaderChunk[],
  requestedChunkIndex: number,
): ReaderProgress {
  if (chunks.length === 0) {
    return { chunkIndex: 0, completed: true, totalChunks: 0 };
  }

  const chunkIndex = Math.max(0, Math.min(requestedChunkIndex, chunks.length));
  return {
    chunkIndex,
    completed: chunkIndex === chunks.length,
    totalChunks: chunks.length,
  };
}
