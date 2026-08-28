"use client";

import { SAMPLE_READING_TEXT } from "@moritzbrantner/speed-reading";
import { useSpeedReading } from "@moritzbrantner/speed-reading/react";
import { useState } from "react";

export function SpeedReader() {
  const [text, setText] = useState(SAMPLE_READING_TEXT);
  const [wordsPerMinute, setWordsPerMinute] = useState(360);
  const [chunkSize, setChunkSize] = useState(1);
  const reader = useSpeedReading({ text, wordsPerMinute, chunkSize });
  const chunk = reader.currentChunk;

  return (
    <main className="mx-auto grid min-h-screen w-full max-w-5xl gap-6 p-5 md:p-10">
      <header className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] opacity-60">A0 shared reader</p>
        <h1 className="text-3xl font-semibold md:text-5xl">Speedreader</h1>
        <p className="max-w-2xl text-base leading-7 opacity-70">
          This web view and the Expo view use the same chunking, pivot, pacing, fixture, and React
          behavior package.
        </p>
      </header>

      <section className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="grid content-start gap-4 rounded-3xl border border-current/15 p-5">
          <label className="grid gap-2">
            <span className="text-sm font-medium">Source text</span>
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              className="min-h-64 resize-y rounded-2xl border border-current/15 bg-transparent p-4 leading-7 outline-none focus:border-current/40"
            />
          </label>

          <label className="grid gap-2">
            <span className="flex items-center justify-between text-sm font-medium">
              <span>Words per minute</span>
              <strong>{wordsPerMinute}</strong>
            </span>
            <input
              type="range"
              min={120}
              max={900}
              step={10}
              value={wordsPerMinute}
              onChange={(event) => setWordsPerMinute(Number(event.target.value))}
            />
          </label>

          <div className="grid gap-2">
            <span className="text-sm font-medium">Words per chunk</span>
            <div className="flex gap-2">
              {[1, 2, 3, 4].map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={chunkSize === value}
                  onClick={() => setChunkSize(value)}
                  className="rounded-full border border-current/20 px-4 py-2 aria-pressed:bg-current aria-pressed:text-[Canvas]"
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid content-start gap-4 rounded-3xl border border-current/15 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm opacity-70">
            <span>{reader.chunks.length} chunks</span>
            <span>
              {reader.chunks.length === 0 ? 0 : reader.currentChunkIndex + 1} / {reader.chunks.length}
            </span>
          </div>

          <div className="relative grid min-h-72 place-items-center overflow-hidden rounded-3xl border border-current/10 p-5">
            <div className="absolute inset-y-[15%] left-1/2 w-px bg-current/15" aria-hidden="true" />
            {chunk ? (
              <p
                className="relative z-10 flex items-baseline justify-center text-center text-4xl font-bold tracking-wide md:text-6xl"
                aria-label={`Current chunk: ${chunk.text}`}
              >
                <span className="opacity-70">{chunk.prefix}</span>
                <span className="text-red-500">{chunk.pivot || " "}</span>
                <span className="opacity-90">{chunk.suffix}</span>
              </p>
            ) : (
              <p className="opacity-60">Enter text to start.</p>
            )}
          </div>

          <progress className="h-2 w-full" value={reader.progress} max={1} />

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <ControlButton onClick={() => reader.seek(reader.currentChunkIndex - 10)}>Back 10</ControlButton>
            <ControlButton onClick={reader.toggle}>{reader.isPlaying ? "Pause" : "Play"}</ControlButton>
            <ControlButton onClick={() => reader.seek(reader.currentChunkIndex + 10)}>Forward 10</ControlButton>
            <ControlButton onClick={reader.reset}>Reset</ControlButton>
          </div>
        </div>
      </section>
    </main>
  );
}

function ControlButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl border border-current/20 px-4 py-3 font-medium transition hover:bg-current/5"
    >
      {children}
    </button>
  );
}
