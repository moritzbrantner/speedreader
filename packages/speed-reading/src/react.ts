import { useCallback, useMemo, useState } from "react";

import {
  chunkText,
  defaultReaderSettings,
  progressFor,
  type ReaderChunk,
  type ReaderProgress,
  type ReaderSettings,
} from "./core";

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

export function useSpeedReader(
  text: string,
  initialSettings: Partial<ReaderSettings> = {},
): SpeedReaderController {
  const [settings, setSettings] = useState<ReaderSettings>({
    ...defaultReaderSettings,
    ...initialSettings,
  });
  const [chunkIndex, setChunkIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const chunks = useMemo(() => chunkText(text, settings.chunkSize), [text, settings.chunkSize]);
  const progress = progressFor(chunks, chunkIndex);

  const seek = useCallback((nextChunkIndex: number) => {
    setChunkIndex(progressFor(chunks, nextChunkIndex).chunkIndex);
  }, [chunks]);

  const setChunkSize = useCallback((chunkSize: number) => {
    setSettings((current) => ({ ...current, chunkSize }));
    setChunkIndex(0);
  }, []);

  const setWordsPerMinute = useCallback((wordsPerMinute: number) => {
    setSettings((current) => ({ ...current, wordsPerMinute }));
  }, []);

  return {
    chunks,
    currentChunk: chunks[progress.chunkIndex],
    isPlaying,
    progress,
    settings,
    pause: () => setIsPlaying(false),
    play: () => setIsPlaying(true),
    seek,
    setChunkSize,
    setWordsPerMinute,
  };
}
