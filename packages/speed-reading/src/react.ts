import { useCallback, useEffect, useMemo, useState } from "react";

import {
  advanceSpeedReadingIndex,
  clampSpeedReadingIndex,
  createSpeedReadingChunks,
  getSpeedReadingDelay,
  type SpeedReadingChunk,
} from "./core";

export type UseSpeedReadingOptions = {
  text: string;
  wordsPerMinute?: number;
  chunkSize?: number;
  defaultPlaying?: boolean;
};

export type UseSpeedReadingResult = {
  chunks: SpeedReadingChunk[];
  currentChunk: SpeedReadingChunk | null;
  currentChunkIndex: number;
  isPlaying: boolean;
  progress: number;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  reset: () => void;
  seek: (index: number) => void;
};

export function useSpeedReading({
  text,
  wordsPerMinute = 320,
  chunkSize = 1,
  defaultPlaying = false,
}: UseSpeedReadingOptions): UseSpeedReadingResult {
  const chunks = useMemo(() => createSpeedReadingChunks(text, { chunkSize }), [chunkSize, text]);
  const [internalChunkIndex, setInternalChunkIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(defaultPlaying && chunks.length > 0);
  const currentChunkIndex = clampSpeedReadingIndex(internalChunkIndex, chunks.length);
  const currentChunk = chunks[currentChunkIndex] ?? null;

  useEffect(() => {
    setInternalChunkIndex(0);
    setIsPlaying(defaultPlaying && chunks.length > 0);
  }, [chunkSize, chunks.length, defaultPlaying, text]);

  useEffect(() => {
    if (!isPlaying || !currentChunk) {
      return;
    }

    const advance = advanceSpeedReadingIndex(currentChunkIndex, chunks.length);
    if (advance.isComplete) {
      setIsPlaying(false);
      return;
    }

    const timeoutId = setTimeout(() => {
      setInternalChunkIndex(advance.nextIndex);
    }, getSpeedReadingDelay(currentChunk, { wordsPerMinute }));

    return () => clearTimeout(timeoutId);
  }, [chunks.length, currentChunk, currentChunkIndex, isPlaying, wordsPerMinute]);

  const play = useCallback(() => {
    if (chunks.length > 0) {
      setIsPlaying(true);
    }
  }, [chunks.length]);

  const pause = useCallback(() => setIsPlaying(false), []);

  const toggle = useCallback(() => {
    if (chunks.length > 0) {
      setIsPlaying((current) => !current);
    }
  }, [chunks.length]);

  const reset = useCallback(() => {
    setInternalChunkIndex(0);
    setIsPlaying(false);
  }, []);

  const seek = useCallback(
    (index: number) => {
      setInternalChunkIndex(clampSpeedReadingIndex(index, chunks.length));
    },
    [chunks.length],
  );

  return {
    chunks,
    currentChunk,
    currentChunkIndex,
    isPlaying,
    progress: chunks.length === 0 ? 0 : (currentChunkIndex + 1) / chunks.length,
    play,
    pause,
    toggle,
    reset,
    seek,
  };
}
