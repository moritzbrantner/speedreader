import { act, create } from "react-test-renderer";
import { expect, test } from "bun:test";
import { useState } from "react";

import { createReadingSession, type ReadingSession } from "./session";
import {
  createEmptyPersistedReaderState,
  createReadingDocument,
  updatePersistedReaderState,
  type PersistedReaderState,
  type ReaderPersistence,
} from "./persistence";
import {
  useDurableSpeedReader,
  useReadingSession,
  useSpeedReader,
  type DurableSpeedReaderController,
  type ReadingSessionController,
} from "./react";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let controller: ReadingSessionController | undefined;
let durableController: DurableSpeedReaderController | undefined;

const initialDurableDocument = createReadingDocument({
  id: "draft",
  title: "Draft",
  text: "fallback words",
  source: "plain-text",
  updatedAt: "2026-08-29T10:00:00.000Z",
});

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

function DurableHarness({ persistence }: Readonly<{ persistence: ReaderPersistence }>) {
  durableController = useDurableSpeedReader({
    initialDocument: initialDurableDocument,
    persistence,
    now: () => "2026-08-29T11:00:00.000Z",
  });
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

test("the durable controller restores validated progress paused and saves later changes", async () => {
  const document = createReadingDocument({
    id: "persisted",
    title: "Persisted",
    text: "one two three four",
    source: "plain-text",
    updatedAt: "2026-08-29T10:00:00.000Z",
  });
  const session = createReadingSession(document.text, { wordsPerMinute: 450 });
  const progressed = { ...session, chunkIndex: 2, status: "playing" as const };
  const persisted = updatePersistedReaderState(
    createEmptyPersistedReaderState(),
    document,
    progressed,
    "2026-08-29T10:00:00.000Z",
  );
  let saved: PersistedReaderState | undefined;
  const persistence: ReaderPersistence = {
    async load() {
      return persisted;
    },
    async save(state) {
      saved = state;
    },
  };
  let renderer: ReturnType<typeof create> | undefined;

  await act(async () => {
    renderer = create(<DurableHarness persistence={persistence} />);
    await Promise.resolve();
  });

  expect(durableController?.document.id).toBe("persisted");
  expect(durableController?.progress.chunkIndex).toBe(2);
  expect(durableController?.isPlaying).toBeFalse();
  expect(durableController?.settings.wordsPerMinute).toBe(450);

  await act(async () => {
    durableController?.seek(3);
    await Promise.resolve();
  });
  expect(saved?.progress[0]).toMatchObject({ documentId: "persisted", chunkIndex: 3 });
  act(() => renderer?.unmount());
});

test("the durable controller remains usable when persistence rejects", async () => {
  const persistence: ReaderPersistence = {
    async load() {
      throw new Error("read failed");
    },
    async save() {
      throw new Error("write failed");
    },
  };
  let renderer: ReturnType<typeof create> | undefined;

  await act(async () => {
    renderer = create(<DurableHarness persistence={persistence} />);
    await Promise.resolve();
  });
  act(() => durableController?.seek(1));

  expect(durableController?.document.text).toBe("fallback words");
  expect(durableController?.progress.chunkIndex).toBe(1);
  expect(durableController?.restored).toBeTrue();
  act(() => renderer?.unmount());
});
