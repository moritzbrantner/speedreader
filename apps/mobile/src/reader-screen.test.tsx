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
import type { WebPageImportAdapter } from "./webpage-import";

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
  useDurableSpeedReader: ({ initialDocument }: Readonly<{
    initialDocument: Readonly<{ text: string }>;
  }>) => {
    const [document, setDocument] = React.useState(initialDocument);
    const [chunkIndex, setChunkIndex] = React.useState(0);
    const [chunkSize, setChunkSize] = React.useState(defaultReaderSettings.chunkSize);
    const [wordsPerMinute, setWordsPerMinute] = React.useState(defaultReaderSettings.wordsPerMinute);
    const [isPlaying, setIsPlaying] = React.useState(false);
    const chunks = chunkText(document.text, chunkSize);
    const progress = progressFor(chunks, chunkIndex);

    React.useEffect(() => {
      setChunkIndex(0);
      setIsPlaying(false);
    }, [document.text]);

    return {
      chunks,
      currentChunk: chunks[progress.chunkIndex],
      document,
      isPlaying,
      progress,
      restored: true,
      settings: { ...defaultReaderSettings, chunkSize, wordsPerMinute },
      openDocument: setDocument,
      pause: () => setIsPlaying(false),
      play: () => setIsPlaying(true),
      seek: setChunkIndex,
      setChunkSize,
      setReadingText: (text: string) => setDocument((current) => ({ ...current, text })),
      setText: (text: string) => setDocument((current) => ({ ...current, text })),
      setWordsPerMinute,
    };
  },
}));

const { ReaderScreen } = await import("./reader-screen");

const unusedWebPageImporter: WebPageImportAdapter = {
  async importWebPage() {
    throw new Error("Webpage import should not be used");
  },
};

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

test("imports a webpage into the shared reader and preserves semantic regions", async () => {
  const importer: DocumentImportAdapter = {
    async importDocument() {
      return { status: "cancelled" };
    },
  };
  const webPageImporter: WebPageImportAdapter = {
    async importWebPage(url) {
      expect(url).toBe("https://example.com/article");
      return {
        ok: true,
        title: "Useful article",
        url,
        extractionMode: "remote-reader",
        document: {
          version: 1,
          text: "Useful article\nRelevant paragraph",
          diagnostics: [],
          pages: [{
            pageNumber: 1,
            text: "Useful article\nRelevant paragraph",
            provenance: { source: "web", url },
            regions: [
              {
                sourceLineIndex: 0,
                text: "Useful article",
                role: "heading",
                confidence: null,
                evidence: [],
                includeInReading: true,
              },
              {
                sourceLineIndex: 1,
                text: "Relevant paragraph",
                role: "content",
                confidence: null,
                evidence: [],
                includeInReading: true,
              },
            ],
          }],
        },
      };
    },
  };
  const renderer = renderReader(importer, webPageImporter);
  const root = renderer.root;

  await act(async () => {
    byLabel(root, "Web address").props.onChangeText("https://example.com/article");
  });
  await act(async () => {
    await byLabel(root, "Extract webpage").props.onPress();
  });

  expect(byLabel(root, "Source text").props.value)
    .toBe("Useful article\nRelevant paragraph");
  expect(byLabel(root, "Semantic filters")).toBeDefined();
  expect(root.findAll((node) => node.props.accessibilityLiveRegion === "polite")
    .some((node) => textContent(node).includes("Imported Useful article.")))
    .toBeTrue();
});

test("keeps PDF semantic regions inspectable and projects role overrides into reading text", async () => {
  const importer: DocumentImportAdapter = {
    async importDocument() {
      return {
        status: "imported",
        fileName: "paper.pdf",
        text: "Body paragraph",
        source: "pdf",
        pageCount: 1,
        document: {
          version: 1,
          text: "Body paragraph",
          diagnostics: [],
          pages: [{
            pageNumber: 1,
            text: "Body paragraph\nRepeated footer",
            provenance: "embeddedText",
            regions: [
              {
                sourceLineIndex: 0,
                text: "Body paragraph",
                role: "content",
                confidence: 99,
                evidence: [],
                includeInReading: true,
              },
              {
                sourceLineIndex: 1,
                text: "Repeated footer",
                role: "footer",
                confidence: 92,
                evidence: ["bottomMargin", "repeatedAcrossPages"],
                includeInReading: false,
              },
            ],
          }],
        },
      };
    },
  };
  const renderer = renderReader(importer);
  const root = renderer.root;

  await act(async () => {
    await byLabel(root, "Import document").props.onPress();
  });

  expect(byLabel(root, "Semantic filters")).toBeDefined();
  expect(byLabel(root, "Source text").props.value).toBe("Body paragraph");
  expect(byLabel(root, "Footer policy default").props.accessibilityState).toEqual({ selected: true });

  await act(async () => {
    byLabel(root, "Footer policy include").props.onPress();
  });

  expect(byLabel(root, "Source text").props.value).toBe("Body paragraph\nRepeated footer");
  expect(byLabel(root, "Footer policy include").props.accessibilityState).toEqual({ selected: true });
});

function renderReader(
  documentImporter: DocumentImportAdapter,
  webPageImporter: WebPageImportAdapter = unusedWebPageImporter,
): ReactTestRenderer {
  let renderer: ReactTestRenderer | undefined;
  act(() => {
    renderer = create(
      <ReaderScreen
        documentImporter={documentImporter}
        webPageImporter={webPageImporter}
      />,
    );
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
