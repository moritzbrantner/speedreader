import { act, create } from "react-test-renderer";
import { expect, test } from "bun:test";
import { useState } from "react";

import { createReadingSession, type ReadingSession } from "./session";
import { useReadingSession, useSpeedReader, type ReadingSessionController } from "./react";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let controller: ReadingSessionController | undefined;

function UncontrolledHarness() {
  controller = useReadingSession({ initialSession: createReadingSession("one two") });
  return null;
}

function ControlledHarness() {
  const [session, setSession] = useState(createReadingSession("one two"));
  controller = useReadingSession({ session, onSessionChange: setSession });
  return null;
}

function TextHarness({ text }: { text: string }) {
  const reader = useSpeedReader(text);
  controller = {
    dispatch: () => {},
    snapshot: {
      chunks: reader.chunks,
      currentChunk: reader.currentChunk,
      progress: reader.progress,
      session: {
        version: 1,
        text,
        settings: reader.settings,
        chunkIndex: reader.progress.chunkIndex,
        status: reader.isPlaying ? "playing" : reader.progress.completed ? "complete" : "paused",
      } satisfies ReadingSession,
    },
  };
  return null;
}

test("controlled and uncontrolled controllers share transition semantics", () => {
  let uncontrolled: ReturnType<typeof create>;
  act(() => {
    uncontrolled = create(<UncontrolledHarness />);
  });
  act(() => controller?.dispatch({ type: "play" }));
  expect(controller?.snapshot.session.status).toBe("playing");
  act(() => uncontrolled!.unmount());

  let controlled: ReturnType<typeof create>;
  act(() => {
    controlled = create(<ControlledHarness />);
  });
  act(() => controller?.dispatch({ type: "play" }));
  expect(controller?.snapshot.session.status).toBe("playing");
  act(() => controlled!.unmount());
});

test("the convenience hook resets when its text input changes", () => {
  let renderer: ReturnType<typeof create>;
  act(() => {
    renderer = create(<TextHarness text="one two" />);
  });
  expect(controller?.snapshot.progress.totalChunks).toBe(2);

  act(() => {
    renderer!.update(<TextHarness text="naïve café 東京" />);
  });
  expect(controller?.snapshot.progress.totalChunks).toBe(3);
  act(() => renderer!.unmount());
});
