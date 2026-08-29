import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  type ReaderChunk,
  type ReaderProgress,
  type ReaderSettings,
  millisecondsForChunk,
} from "./core";
import {
  createReadingSession,
  snapshotFor,
  transitionReadingSession,
  type ReadingSession,
  type ReadingSessionEvent,
} from "./session";
import {
  createEmptyPersistedReaderState,
  currentReadingDocument,
  restoreReadingSession,
  updatePersistedReaderState,
  type ReaderPersistence,
  type ReadingDocument,
} from "./persistence";

export type SpeedReaderController = Readonly<{
  chunks: readonly ReaderChunk[];
  currentChunk: ReaderChunk | undefined;
  isPlaying: boolean;
  progress: ReaderProgress;
  settings: ReaderSettings;
  pause: () => void;
  play: () => void;
  seek: (chunkIndex: number) => void;
  setChunkSize: (chunkSize: number) => void;
  setWordsPerMinute: (wordsPerMinute: number) => void;
}>;

export type UseReadingSessionOptions = Readonly<{
  initialSession?: ReadingSession;
  session?: ReadingSession;
  onSessionChange?: (session: ReadingSession) => void;
}>;

export type ReadingSessionController = Readonly<{
  dispatch: (event: ReadingSessionEvent) => void;
  snapshot: ReturnType<typeof snapshotFor>;
}>;

export type DurableSpeedReaderController = SpeedReaderController & Readonly<{
  document: ReadingDocument;
  restored: boolean;
  openDocument: (document: ReadingDocument) => void;
  setText: (text: string) => void;
}>;

export type UseDurableSpeedReaderOptions = Readonly<{
  initialDocument: ReadingDocument;
  persistence?: ReaderPersistence;
  now?: () => string;
}>;

export function useReadingSession(options: UseReadingSessionOptions): ReadingSessionController {
  const [uncontrolledSession, setUncontrolledSession] = useState<ReadingSession>(() =>
    options.initialSession ?? createReadingSession(""),
  );
  const session = options.session ?? uncontrolledSession;
  const snapshot = snapshotFor(session);
  const dispatch = useCallback((event: ReadingSessionEvent) => {
    const nextSession = transitionReadingSession(session, event);
    if (options.session === undefined) setUncontrolledSession(nextSession);
    options.onSessionChange?.(nextSession);
  }, [options, session]);

  useEffect(() => {
    const { currentChunk, session: currentSession } = snapshot;
    if (currentSession.status !== "playing" || currentChunk === undefined) return;

    const timer = setTimeout(
      () => dispatch({ type: "step", direction: 1 }),
      millisecondsForChunk(currentChunk, currentSession.settings.wordsPerMinute),
    );
    return () => clearTimeout(timer);
  }, [dispatch, snapshot]);

  return { dispatch, snapshot };
}

export function useSpeedReader(
  text: string,
  initialSettings: Partial<ReaderSettings> = {},
): SpeedReaderController {
  const { chunkSize, segmentation, wordsPerMinute } = initialSettings;
  const initialSession = useMemo(
    () => createReadingSession(text, { chunkSize, segmentation, wordsPerMinute }),
    [chunkSize, segmentation, text, wordsPerMinute],
  );
  const [session, setSession] = useState<ReadingSession>(initialSession);

  useEffect(() => {
    setSession(initialSession);
  }, [initialSession]);

  const { dispatch, snapshot } = useReadingSession({
    session,
    onSessionChange: setSession,
  });

  const seek = useCallback((chunkIndex: number) => dispatch({ type: "seek", chunkIndex }), [dispatch]);

  const setChunkSize = useCallback((chunkSize: number) => {
    dispatch({ type: "set-chunk-size", chunkSize });
  }, [dispatch]);

  const setWordsPerMinute = useCallback((wordsPerMinute: number) => {
    dispatch({ type: "set-wpm", wordsPerMinute });
  }, [dispatch]);

  return {
    chunks: snapshot.chunks,
    currentChunk: snapshot.currentChunk,
    isPlaying: snapshot.session.status === "playing",
    progress: snapshot.progress,
    settings: snapshot.session.settings,
    pause: () => dispatch({ type: "pause" }),
    play: () => dispatch({ type: "play" }),
    seek,
    setChunkSize,
    setWordsPerMinute,
  };
}

const currentTimestamp = () => new Date().toISOString();

export function useDurableSpeedReader(
  options: UseDurableSpeedReaderOptions,
): DurableSpeedReaderController {
  const { initialDocument, persistence } = options;
  const now = options.now ?? currentTimestamp;
  const persistedState = useRef(createEmptyPersistedReaderState());
  const [document, setDocument] = useState(initialDocument);
  const [session, setSession] = useState(() => createReadingSession(initialDocument.text));
  const [restored, setRestored] = useState(persistence === undefined);

  useEffect(() => {
    if (persistence === undefined) {
      setRestored(true);
      return;
    }

    let active = true;
    setRestored(false);
    void persistence.load()
      .catch(() => undefined)
      .then((loaded) => {
        if (!active) return;
        const state = loaded ?? createEmptyPersistedReaderState();
        const restoredDocument = currentReadingDocument(state) ?? initialDocument;
        persistedState.current = state;
        setDocument(restoredDocument);
        setSession(restoreReadingSession(restoredDocument, state));
        setRestored(true);
      });

    return () => {
      active = false;
    };
  }, [initialDocument, persistence]);

  useEffect(() => {
    if (!restored || persistence === undefined) return;
    const next = updatePersistedReaderState(
      persistedState.current,
      document,
      session,
      now(),
    );
    persistedState.current = next;
    void persistence.save(next).catch(() => undefined);
  }, [document, now, persistence, restored, session]);

  const { dispatch, snapshot } = useReadingSession({
    session,
    onSessionChange: setSession,
  });

  const openDocument = useCallback((nextDocument: ReadingDocument) => {
    setDocument(nextDocument);
    setSession(restoreReadingSession(nextDocument, persistedState.current));
  }, []);

  const setText = useCallback((text: string) => {
    setDocument((currentDocument) => ({
      ...currentDocument,
      text,
      updatedAt: now(),
    }));
    setSession((currentSession) => createReadingSession(text, currentSession.settings));
  }, [now]);

  return {
    chunks: snapshot.chunks,
    currentChunk: snapshot.currentChunk,
    document,
    isPlaying: snapshot.session.status === "playing",
    progress: snapshot.progress,
    restored,
    settings: snapshot.session.settings,
    openDocument,
    pause: () => dispatch({ type: "pause" }),
    play: () => dispatch({ type: "play" }),
    seek: (chunkIndex) => dispatch({ type: "seek", chunkIndex }),
    setChunkSize: (chunkSize) => dispatch({ type: "set-chunk-size", chunkSize }),
    setText,
    setWordsPerMinute: (wordsPerMinute) => dispatch({ type: "set-wpm", wordsPerMinute }),
  };
}
