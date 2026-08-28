import { useCallback, useEffect, useMemo, useState } from "react";

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
