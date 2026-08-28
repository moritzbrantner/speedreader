export type SpeedReadingChunk = {
  index: number;
  text: string;
  wordCount: number;
  pivotIndex: number;
  prefix: string;
  pivot: string;
  suffix: string;
};

export type CreateSpeedReadingChunksOptions = {
  chunkSize?: number;
};

export type SpeedReadingTimingOptions = {
  wordsPerMinute?: number;
  commaPauseMultiplier?: number;
  sentencePauseMultiplier?: number;
  longWordLength?: number;
  longWordPauseMultiplier?: number;
};

export type SpeedReadingAdvance = {
  nextIndex: number;
  isComplete: boolean;
};

const WORD_PATTERN = /\S+/gu;

export function createSpeedReadingChunks(
  text: string,
  options: CreateSpeedReadingChunksOptions = {},
): SpeedReadingChunk[] {
  const chunkSize = clampPositiveInteger(options.chunkSize ?? 1);
  const words = text.match(WORD_PATTERN) ?? [];
  const chunks: SpeedReadingChunk[] = [];

  for (let index = 0; index < words.length; index += chunkSize) {
    const chunkWords = words.slice(index, index + chunkSize);
    const chunkText = chunkWords.join(" ");
    const pivotIndex = getChunkPivotIndex(chunkWords);

    chunks.push({
      index: chunks.length,
      text: chunkText,
      wordCount: chunkWords.length,
      pivotIndex,
      prefix: chunkText.slice(0, pivotIndex),
      pivot: chunkText.charAt(pivotIndex),
      suffix: chunkText.slice(pivotIndex + 1),
    });
  }

  return chunks;
}

export function countSpeedReadingWords(text: string): number {
  return text.match(WORD_PATTERN)?.length ?? 0;
}

export function getSpeedReadingDelay(
  chunk: Pick<SpeedReadingChunk, "text" | "wordCount">,
  options: SpeedReadingTimingOptions = {},
): number {
  const wordsPerMinute = Math.max(60, options.wordsPerMinute ?? 320);
  const commaPauseMultiplier = Math.max(1, options.commaPauseMultiplier ?? 1.35);
  const sentencePauseMultiplier = Math.max(1, options.sentencePauseMultiplier ?? 1.9);
  const longWordLength = Math.max(6, options.longWordLength ?? 9);
  const longWordPauseMultiplier = Math.max(1, options.longWordPauseMultiplier ?? 1.15);
  const baseDelayMs = (60_000 / wordsPerMinute) * Math.max(1, chunk.wordCount);
  let multiplier = 1;

  if (/[.!?]["')\]]*$/u.test(chunk.text)) {
    multiplier *= sentencePauseMultiplier;
  } else if (/[,;:]["')\]]*$/u.test(chunk.text)) {
    multiplier *= commaPauseMultiplier;
  }

  if (chunk.text.replace(/[^\p{L}\p{N}]/gu, "").length >= longWordLength) {
    multiplier *= longWordPauseMultiplier;
  }

  return Math.max(1, Math.round(baseDelayMs * multiplier));
}

export function getPivotIndex(word: string): number {
  const visible = word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");

  if (!visible) {
    return 0;
  }

  const length = visible.length;
  let pivot = 0;

  if (length <= 1) {
    pivot = 0;
  } else if (length <= 5) {
    pivot = 1;
  } else if (length <= 9) {
    pivot = 2;
  } else if (length <= 13) {
    pivot = 3;
  } else {
    pivot = 4;
  }

  const leadingDecorationLength = word.indexOf(visible);
  return Math.min(word.length - 1, leadingDecorationLength + pivot);
}

export function clampSpeedReadingIndex(index: number, chunkCount: number): number {
  if (chunkCount <= 0 || !Number.isFinite(index)) {
    return 0;
  }

  return Math.min(Math.max(0, Math.round(index)), chunkCount - 1);
}

export function advanceSpeedReadingIndex(currentIndex: number, chunkCount: number): SpeedReadingAdvance {
  if (chunkCount <= 0) {
    return { nextIndex: 0, isComplete: true };
  }

  const safeIndex = clampSpeedReadingIndex(currentIndex, chunkCount);
  if (safeIndex >= chunkCount - 1) {
    return { nextIndex: safeIndex, isComplete: true };
  }

  return { nextIndex: safeIndex + 1, isComplete: false };
}

function getChunkPivotIndex(words: string[]): number {
  if (!words.length) {
    return 0;
  }

  const pivotWordIndex = Math.floor(words.length / 2);
  const pivotWord = words[pivotWordIndex] ?? words[0] ?? "";
  const offset =
    words.slice(0, pivotWordIndex).reduce((sum, word) => sum + word.length, 0) + pivotWordIndex;

  return offset + getPivotIndex(pivotWord);
}

function clampPositiveInteger(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.max(1, Math.round(value));
}
