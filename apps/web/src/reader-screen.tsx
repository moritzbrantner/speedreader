"use client";

import { useSpeedReader } from "@moritzbrantner/speed-reading/react";
import { readerFixture } from "@moritzbrantner/speed-reading/fixture";

export function ReaderScreen() {
  const reader = useSpeedReader(readerFixture);
  return (
    <main>
      <p aria-live="polite">{reader.currentChunk?.text ?? "Finished"}</p>
      <p>{`${reader.progress.chunkIndex} / ${reader.progress.totalChunks}`}</p>
      <button type="button" onClick={reader.isPlaying ? reader.pause : reader.play}>
        {reader.isPlaying ? "Pause" : "Play"}
      </button>
      <button type="button" onClick={() => reader.seek(reader.progress.chunkIndex + 1)}>
        Next
      </button>
    </main>
  );
}
