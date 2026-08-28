export type ReaderSettings = Readonly<{
  chunkSize: number;
  wordsPerMinute: number;
}>;

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
};

export function wordsFromText(text: string): readonly string[] {
  const normalized = text.trim();
  return normalized === "" ? [] : normalized.split(/\s+/u);
}

export function pivotIndex(word: string): number {
  if (word.length === 0) return 0;
  return Math.min(word.length - 1, Math.floor(word.length * 0.35));
}

export function chunkText(text: string, chunkSize = 1): readonly ReaderChunk[] {
  if (!Number.isInteger(chunkSize) || chunkSize < 1) {
    throw new RangeError("chunkSize must be a positive integer");
  }

  const words = wordsFromText(text);
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
