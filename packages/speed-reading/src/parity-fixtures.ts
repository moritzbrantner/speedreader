import type { ReaderSettings } from "./core";

export type ReaderParityFixture = Readonly<{
  name: string;
  text: string;
  settings: ReaderSettings;
  expectedChunks: readonly string[];
  expectedDurations: readonly number[];
  progressRequests: readonly number[];
  expectedProgress: readonly Readonly<{
    chunkIndex: number;
    completed: boolean;
    totalChunks: number;
  }>[];
}>;

export type ReaderParityResult = Readonly<{
  chunks: readonly string[];
  durations: readonly number[];
  progress: readonly Readonly<{
    chunkIndex: number;
    completed: boolean;
    totalChunks: number;
  }>[];
}>;

export const readerParityFixtures: readonly ReaderParityFixture[] = [
  {
    name: "punctuation pacing and clamped progress",
    text: "Ready, set go! Again",
    settings: { chunkSize: 1, wordsPerMinute: 300, segmentation: "punctuation" },
    expectedChunks: ["Ready,", "set", "go!", "Again"],
    expectedDurations: [240, 200, 320, 200],
    progressRequests: [-2, 2, 8],
    expectedProgress: [
      { chunkIndex: 0, completed: false, totalChunks: 4 },
      { chunkIndex: 2, completed: false, totalChunks: 4 },
      { chunkIndex: 4, completed: true, totalChunks: 4 },
    ],
  },
  {
    name: "Unicode and multi-word chunks",
    text: "naïve café 東京 finish.",
    settings: { chunkSize: 2, wordsPerMinute: 240, segmentation: "whitespace" },
    expectedChunks: ["naïve café", "東京 finish."],
    expectedDurations: [500, 800],
    progressRequests: [0, 1, 2],
    expectedProgress: [
      { chunkIndex: 0, completed: false, totalChunks: 2 },
      { chunkIndex: 1, completed: false, totalChunks: 2 },
      { chunkIndex: 2, completed: true, totalChunks: 2 },
    ],
  },
];
