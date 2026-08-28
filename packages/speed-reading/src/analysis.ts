import {
  chunkText,
  millisecondsForChunk,
  segmentsFromText,
  type ReaderSettings,
} from "./core";

export type ReadingAnalysis = Readonly<{
  chunkCount: number;
  estimatedDurationMilliseconds: number;
  wordCount: number;
}>;

export function analyzeReadingText(text: string, settings: ReaderSettings): ReadingAnalysis {
  const chunks = chunkText(text, settings.chunkSize, settings.segmentation);
  return {
    wordCount: segmentsFromText(text, settings.segmentation).length,
    chunkCount: chunks.length,
    estimatedDurationMilliseconds: chunks.reduce(
      (duration, chunk) => duration + millisecondsForChunk(chunk, settings.wordsPerMinute),
      0,
    ),
  };
}
