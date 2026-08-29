import {
  defaultReaderSettings,
  type ReaderSettings,
} from "./core";
import {
  createReadingSession,
  snapshotFor,
  transitionReadingSession,
  type ReadingSession,
} from "./session";

export const persistedReaderVersion = 1 as const;
export const readingDocumentVersion = 1 as const;
export const readerPreferencesVersion = 1 as const;
export const readingProgressVersion = 1 as const;

export type ReadingDocumentSource = "plain-text" | "pdf";

export type ReadingDocument = Readonly<{
  version: typeof readingDocumentVersion;
  id: string;
  title: string;
  text: string;
  source: ReadingDocumentSource;
  updatedAt: string;
}>;

export type ReaderPreferences = Readonly<{
  version: typeof readerPreferencesVersion;
  settings: ReaderSettings;
}>;

export type ReadingProgress = Readonly<{
  version: typeof readingProgressVersion;
  documentId: string;
  contentFingerprint: string;
  chunkIndex: number;
  totalChunks: number;
  completed: boolean;
  updatedAt: string;
}>;

export type PersistedReaderState = Readonly<{
  version: typeof persistedReaderVersion;
  currentDocumentId?: string;
  preferences: ReaderPreferences;
  recentDocuments: readonly ReadingDocument[];
  progress: readonly ReadingProgress[];
}>;

export type ReaderPersistence = Readonly<{
  load: () => Promise<PersistedReaderState | undefined>;
  save: (state: PersistedReaderState) => Promise<void>;
}>;

export type SerializedReaderStorage = Readonly<{
  read: () => Promise<string | undefined>;
  write: (serialized: string) => Promise<void>;
}>;

export type CreateReadingDocumentInput = Readonly<{
  id?: string;
  title: string;
  text: string;
  source: ReadingDocumentSource;
  updatedAt: string;
}>;

const maximumRecentDocuments = 10;

export function createReadingDocument(input: CreateReadingDocumentInput): ReadingDocument {
  const title = input.title.trim() || "Untitled document";
  return {
    version: readingDocumentVersion,
    id: input.id ?? `document-${fingerprintText(`${title}\u0000${input.text}`)}`,
    title,
    text: input.text,
    source: input.source,
    updatedAt: input.updatedAt,
  };
}

export function createEmptyPersistedReaderState(): PersistedReaderState {
  return {
    version: persistedReaderVersion,
    preferences: {
      version: readerPreferencesVersion,
      settings: defaultReaderSettings,
    },
    recentDocuments: [],
    progress: [],
  };
}

export function currentReadingDocument(
  state: PersistedReaderState,
): ReadingDocument | undefined {
  return state.recentDocuments.find((document) => document.id === state.currentDocumentId);
}

export function restoreReadingSession(
  document: ReadingDocument,
  state: PersistedReaderState,
): ReadingSession {
  const initial = createReadingSession(document.text, state.preferences.settings);
  const progress = state.progress.find((candidate) => candidate.documentId === document.id);
  const snapshot = snapshotFor(initial);

  if (
    progress === undefined ||
    progress.contentFingerprint !== fingerprintText(document.text) ||
    progress.totalChunks !== snapshot.progress.totalChunks
  ) {
    return initial;
  }

  return transitionReadingSession(initial, {
    type: "seek",
    chunkIndex: progress.completed ? snapshot.progress.totalChunks : progress.chunkIndex,
  });
}

export function updatePersistedReaderState(
  state: PersistedReaderState,
  document: ReadingDocument,
  session: ReadingSession,
  updatedAt: string,
): PersistedReaderState {
  const normalizedSession = session.text === document.text
    ? session
    : createReadingSession(document.text, session.settings);
  const snapshot = snapshotFor(normalizedSession);
  const recentDocuments = [
    { ...document, updatedAt },
    ...state.recentDocuments.filter((candidate) => candidate.id !== document.id),
  ].slice(0, maximumRecentDocuments);
  const recentIds = new Set(recentDocuments.map((candidate) => candidate.id));
  const progress: ReadingProgress = {
    version: readingProgressVersion,
    documentId: document.id,
    contentFingerprint: fingerprintText(document.text),
    chunkIndex: snapshot.progress.chunkIndex,
    totalChunks: snapshot.progress.totalChunks,
    completed: snapshot.progress.completed,
    updatedAt,
  };

  return {
    version: persistedReaderVersion,
    currentDocumentId: document.id,
    preferences: {
      version: readerPreferencesVersion,
      settings: snapshot.session.settings,
    },
    recentDocuments,
    progress: [
      progress,
      ...state.progress.filter(
        (candidate) => candidate.documentId !== document.id && recentIds.has(candidate.documentId),
      ),
    ],
  };
}

export function serializePersistedReaderState(state: PersistedReaderState): string {
  return JSON.stringify(state);
}

export function parsePersistedReaderState(serialized: string): PersistedReaderState | undefined {
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    return undefined;
  }
  return isPersistedReaderState(value) ? value : undefined;
}

export function createReaderPersistence(storage: SerializedReaderStorage): ReaderPersistence {
  let pendingWrite = Promise.resolve();
  return {
    async load() {
      try {
        const serialized = await storage.read();
        return serialized === undefined ? undefined : parsePersistedReaderState(serialized);
      } catch {
        return undefined;
      }
    },
    save(state) {
      const serialized = serializePersistedReaderState(state);
      pendingWrite = pendingWrite.catch(() => undefined).then(() => storage.write(serialized));
      return pendingWrite;
    },
  };
}

export function fingerprintText(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${text.length.toString(36)}-${(hash >>> 0).toString(36)}`;
}

function isPersistedReaderState(value: unknown): value is PersistedReaderState {
  if (!isRecord(value) || value.version !== persistedReaderVersion) return false;
  if (value.currentDocumentId !== undefined && typeof value.currentDocumentId !== "string") return false;
  if (!isReaderPreferences(value.preferences)) return false;
  if (
    !Array.isArray(value.recentDocuments) ||
    value.recentDocuments.length > maximumRecentDocuments ||
    !value.recentDocuments.every(isReadingDocument)
  ) return false;
  if (!Array.isArray(value.progress) || !value.progress.every(isReadingProgress)) return false;

  const documentIds = value.recentDocuments.map((document) => document.id);
  const progressIds = value.progress.map((progress) => progress.documentId);
  const knownDocumentIds = new Set(documentIds);
  return (
    new Set(documentIds).size === documentIds.length &&
    new Set(progressIds).size === progressIds.length &&
    progressIds.every((id) => knownDocumentIds.has(id)) &&
    (value.currentDocumentId === undefined || knownDocumentIds.has(value.currentDocumentId))
  );
}

function isReaderPreferences(value: unknown): value is ReaderPreferences {
  return (
    isRecord(value) &&
    value.version === readerPreferencesVersion &&
    isReaderSettings(value.settings)
  );
}

function isReaderSettings(value: unknown): value is ReaderSettings {
  return (
    isRecord(value) &&
    isPositiveInteger(value.chunkSize) &&
    isPositiveNumber(value.wordsPerMinute) &&
    (value.segmentation === "whitespace" || value.segmentation === "punctuation")
  );
}

function isReadingDocument(value: unknown): value is ReadingDocument {
  return (
    isRecord(value) &&
    value.version === readingDocumentVersion &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.title) &&
    typeof value.text === "string" &&
    (value.source === "plain-text" || value.source === "pdf") &&
    isNonEmptyString(value.updatedAt)
  );
}

function isReadingProgress(value: unknown): value is ReadingProgress {
  return (
    isRecord(value) &&
    value.version === readingProgressVersion &&
    isNonEmptyString(value.documentId) &&
    isNonEmptyString(value.contentFingerprint) &&
    isNonNegativeInteger(value.chunkIndex) &&
    isNonNegativeInteger(value.totalChunks) &&
    value.chunkIndex <= value.totalChunks &&
    typeof value.completed === "boolean" &&
    value.completed === (value.chunkIndex === value.totalChunks) &&
    isNonEmptyString(value.updatedAt)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
