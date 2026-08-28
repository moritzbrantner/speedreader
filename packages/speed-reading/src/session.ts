import {
  chunkText,
  defaultReaderSettings,
  progressFor,
  type ReaderChunk,
  type ReaderProgress,
  type ReaderSettings,
  type SegmentationPolicy,
} from "./core";

export const readingSessionVersion = 1 as const;

export type ReadingSessionStatus = "paused" | "playing" | "complete";

export type ReadingSession = Readonly<{
  version: typeof readingSessionVersion;
  text: string;
  settings: ReaderSettings;
  chunkIndex: number;
  status: ReadingSessionStatus;
}>;

export type ReadingSessionEvent =
  | Readonly<{ type: "play" }>
  | Readonly<{ type: "pause" }>
  | Readonly<{ type: "reset" }>
  | Readonly<{ type: "seek"; chunkIndex: number }>
  | Readonly<{ type: "step"; direction: -1 | 1 }>
  | Readonly<{ type: "set-wpm"; wordsPerMinute: number }>
  | Readonly<{ type: "set-chunk-size"; chunkSize: number }>
  | Readonly<{ type: "set-segmentation"; segmentation: SegmentationPolicy }>;

export type ReadingSessionSnapshot = Readonly<{
  chunks: readonly ReaderChunk[];
  currentChunk: ReaderChunk | undefined;
  progress: ReaderProgress;
  session: ReadingSession;
}>;

export function createReadingSession(
  text: string,
  settings: Partial<ReaderSettings> = {},
): ReadingSession {
  const mergedSettings = { ...defaultReaderSettings, ...settings };
  const chunks = chunksFor(text, mergedSettings);
  const progress = progressFor(chunks, 0);
  return {
    version: readingSessionVersion,
    text,
    settings: mergedSettings,
    chunkIndex: progress.chunkIndex,
    status: progress.completed ? "complete" : "paused",
  };
}

export function snapshotFor(session: ReadingSession): ReadingSessionSnapshot {
  const chunks = chunksFor(session.text, session.settings);
  const progress = progressFor(chunks, session.chunkIndex);
  const normalizedStatus: ReadingSessionStatus = progress.completed
    ? "complete"
    : session.status === "complete"
      ? "paused"
      : session.status;

  return {
    chunks,
    currentChunk: chunks[progress.chunkIndex],
    progress,
    session: { ...session, chunkIndex: progress.chunkIndex, status: normalizedStatus },
  };
}

export function transitionReadingSession(
  session: ReadingSession,
  event: ReadingSessionEvent,
): ReadingSession {
  const snapshot = snapshotFor(session);
  const from = snapshot.session;
  const withPosition = (chunkIndex: number, status: ReadingSessionStatus = from.status) => {
    const progress = progressFor(snapshot.chunks, chunkIndex);
    return {
      ...from,
      chunkIndex: progress.chunkIndex,
      status: progress.completed ? "complete" : status,
    };
  };

  switch (event.type) {
    case "play":
      return from.status === "complete" ? from : { ...from, status: "playing" };
    case "pause":
      return from.status === "complete" ? from : { ...from, status: "paused" };
    case "reset":
      return withPosition(0, snapshot.chunks.length === 0 ? "complete" : "paused");
    case "seek":
      return withPosition(event.chunkIndex, from.status);
    case "step":
      return withPosition(from.chunkIndex + event.direction, from.status);
    case "set-wpm":
      assertPositiveNumber(event.wordsPerMinute, "wordsPerMinute");
      return { ...from, settings: { ...from.settings, wordsPerMinute: event.wordsPerMinute } };
    case "set-chunk-size":
      assertPositiveInteger(event.chunkSize, "chunkSize");
      return createReadingSession(from.text, { ...from.settings, chunkSize: event.chunkSize });
    case "set-segmentation":
      return createReadingSession(from.text, { ...from.settings, segmentation: event.segmentation });
  }
}

export function serializeReadingSession(session: ReadingSession): string {
  return JSON.stringify(snapshotFor(session).session);
}

export function parseReadingSession(serialized: string): ReadingSession {
  const value: unknown = JSON.parse(serialized);
  if (!isRecord(value) || value.version !== readingSessionVersion || typeof value.text !== "string") {
    throw new TypeError("Invalid reading session");
  }
  if (!isRecord(value.settings) || typeof value.chunkIndex !== "number" || typeof value.status !== "string") {
    throw new TypeError("Invalid reading session");
  }

  const settings = value.settings;
  assertPositiveInteger(settings.chunkSize, "chunkSize");
  assertPositiveNumber(settings.wordsPerMinute, "wordsPerMinute");
  if (settings.segmentation !== "whitespace" && settings.segmentation !== "punctuation") {
    throw new TypeError("Invalid segmentation");
  }
  if (!Number.isInteger(value.chunkIndex) || value.chunkIndex < 0) {
    throw new TypeError("Invalid chunkIndex");
  }
  if (value.status !== "paused" && value.status !== "playing" && value.status !== "complete") {
    throw new TypeError("Invalid status");
  }

  return snapshotFor({
    version: readingSessionVersion,
    text: value.text,
    settings: {
      chunkSize: settings.chunkSize,
      wordsPerMinute: settings.wordsPerMinute,
      segmentation: settings.segmentation,
    },
    chunkIndex: value.chunkIndex,
    status: value.status,
  }).session;
}

function chunksFor(text: string, settings: ReaderSettings): readonly ReaderChunk[] {
  return chunkText(text, settings.chunkSize, settings.segmentation);
}

function assertPositiveInteger(value: unknown, label: string): asserts value is number {
  if (!Number.isInteger(value) || (value as number) < 1) {
    throw new RangeError(`${label} must be a positive integer`);
  }
}

function assertPositiveNumber(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be greater than zero`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
