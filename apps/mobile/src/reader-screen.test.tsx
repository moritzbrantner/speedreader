import { expect, mock, test } from "bun:test";
import React, { type ReactNode } from "react";
import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer,
} from "react-test-renderer";

import {
  chunkText,
  defaultReaderSettings,
  progressFor,
} from "@moritzbrantner/speed-reading/core";

import type { DocumentImportAdapter } from "./document-import";

const dimensions = { width: 390, height: 844 };

function nativeHost(name: string) {
  return ({ children, ...props }: Readonly<{ children?: ReactNode } & Record<string, unknown>>) =>
    React.createElement(name, props, children);
}

mock.module("react-native", () => ({
  ActivityIndicator: nativeHost("ActivityIndicator"),
  KeyboardAvoidingView: nativeHost("KeyboardAvoidingView"),
  Platform: { OS: "ios" },
  Pressable: nativeHost("Pressable"),
  SafeAreaView: nativeHost("SafeAreaView"),
  ScrollView: nativeHost("ScrollView"),
  StyleSheet: { create: <T,>(styles: T) => styles, hairlineWidth: 1 },
  Text: nativeHost("Text"),
  TextInput: nativeHost("TextInput"),
  useColorScheme: () => "light",
  useWindowDimensions: () => dimensions,
  View: nativeHost("View"),
}));
mock.module("@moritzbrantner/speed-reading/react", () => ({
  useSpeedReader: (text: string) => {
    const [chunkIndex, setChunkIndex] = React.useState(0);
    const [chunkSize, setChunkSize] = React.useState(defaultReaderSettings.chunkSize);
    const [wordsPerMinute, setWordsPerMinute] = React.useState(defaultReaderSettings.wordsPerMinute);
    const [isPlaying, setIsPlaying] = React.useState(false);
    const chunks = chunkText(text, chunkSize);
    const progress = progressFor(chunks, chunkIndex);

    React.useEffect(() => {
      setChunkIndex(0);
      setIsPlaying(false);
    }, [text]);

    return {
      chunks,
      currentChunk: chunks[progress.chunkIndex],
      isPlaying,
      progress,
      settings: { ...defaultReaderSettings, chunkSize, wordsPerMinute },
      pause: () => setIsPlaying(false),
      play: () => setIsPlaying(true),
      seek: setChunkIndex,
      setChunkSize,
      setWordsPerMinute,
    };
  },
}));

const { ReaderScreen } = await import("./reader-screen");

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

test("exposes accessible reader controls and advances through shared chunks", async () => {
  let importCalls = 0;
  const renderer = renderReader({
    async importDocument() {
      importCalls += 1;
      return { status: "cancelled" };
    },
  });
  const root = renderer.root;

  expect(byLabel(root, "Source text").props.accessibilityHint).toContain("resets reading progress");
  expect(byLabel(root, "Reader").props.accessibilityRole).toBe("header");
  expect(byLabel(root, "Reading progress").props.accessibilityRole).toBe("progressbar");
  expect(byLabel(root, "Previous").props.accessibilityState).toEqual({ disabled: true });
  expect(byLabel(root, "Play").props.accessibilityRole).toBe("button");

  await act(async () => {
    byLabel(root, "Source text").props.onChangeText("Offline reading works");
  });

  expect(byLabel(root, "Offline")).toBeDefined();
  expect(importCalls).toBe(0);

  await act(async () => {
    byLabel(root, "Next").props.onPress();
  });

  expect(byLabel(root, "Previous").props.accessibilityState).toEqual({ disabled: false });
  expect(byLabel(root, "Reading progress").props.accessibilityValue).toMatchObject({ now: 1 });
  expect(byLabel(root, "reading")).toBeDefined();
});

test("feeds imported text into reader state without exposing transport details to the UI", async () => {
  const importer: DocumentImportAdapter = {
    async importDocument() {
      return {
        status: "imported",
        fileName: "local.txt",
        text: "Native words",
        source: "plain-text",
      };
    },
  };
  const renderer = renderReader(importer);
  const root = renderer.root;

  await act(async () => {
    await byLabel(root, "Import document").props.onPress();
  });

  expect(byLabel(root, "Source text").props.value).toBe("Native words");
  expect(byLabel(root, "Native")).toBeDefined();
  expect(root.findAll((node) => node.props.accessibilityLiveRegion === "polite")
    .some((node) => textContent(node).includes("Imported local.txt."))).toBeTrue();
});

function renderReader(documentImporter: DocumentImportAdapter): ReactTestRenderer {
  let renderer: ReactTestRenderer | undefined;
  act(() => {
    renderer = create(<ReaderScreen documentImporter={documentImporter} />);
  });
  if (renderer === undefined) throw new Error("Reader did not render");
  return renderer;
}

function byLabel(root: ReactTestInstance, label: string): ReactTestInstance {
  return root.find((node) => node.props.accessibilityLabel === label);
}

function textContent(node: ReactTestInstance): string {
  return node.children.map((child) => typeof child === "string" ? child : textContent(child)).join("");
}
