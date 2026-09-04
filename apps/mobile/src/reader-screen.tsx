import { useCallback, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  useWindowDimensions,
  View,
} from "react-native";

import { readerFixture } from "@moritzbrantner/speed-reading/fixture";
import {
  createReadingDocument,
  type ReaderPersistence,
} from "@moritzbrantner/speed-reading/persistence";
import {
  useDurableSpeedReader,
  type SpeedReaderController,
} from "@moritzbrantner/speed-reading/react";

import type { DocumentImportAdapter, DocumentImportResult } from "./document-import";
import { readerLayoutMode } from "./reader-layout";

type ReaderScreenProps = Readonly<{
  documentImporter: DocumentImportAdapter;
  persistence?: ReaderPersistence;
}>;

type ImportState =
  | Readonly<{ status: "idle" }>
  | Readonly<{ status: "importing" }>
  | Readonly<{ status: "success"; message: string }>
  | Readonly<{ status: "error"; message: string }>;

const themes = {
  light: {
    background: "#f6f7f4",
    surface: "#ffffff",
    surfaceMuted: "#ecefe9",
    text: "#162019",
    textMuted: "#5d685f",
    border: "#ccd4cc",
    accent: "#b33b2e",
    action: "#245c3c",
    actionText: "#ffffff",
    danger: "#9b2c2c",
  },
  dark: {
    background: "#101512",
    surface: "#19201b",
    surfaceMuted: "#242d27",
    text: "#edf3ee",
    textMuted: "#aebbb1",
    border: "#3b493f",
    accent: "#ff8878",
    action: "#8fcda5",
    actionText: "#102117",
    danger: "#ff9b96",
  },
} as const;

const initialDocument = createReadingDocument({
  id: "local-draft",
  title: "Local draft",
  text: readerFixture,
  source: "plain-text",
  updatedAt: "1970-01-01T00:00:00.000Z",
});

export function ReaderScreen({ documentImporter, persistence }: ReaderScreenProps) {
  const [importState, setImportState] = useState<ImportState>({ status: "idle" });
  const dimensions = useWindowDimensions();
  const layout = readerLayoutMode(dimensions.width, dimensions.height);
  const colorScheme = useColorScheme();
  const theme = themes[colorScheme === "dark" ? "dark" : "light"];
  const reader = useDurableSpeedReader({ initialDocument, persistence });

  const importDocument = useCallback(async () => {
    setImportState({ status: "importing" });
    const result = await documentImporter.importDocument();
    if (result.status === "cancelled") {
      setImportState({ status: "idle" });
      return;
    }
    if (result.status === "error") {
      setImportState(result);
      return;
    }

    reader.openDocument(createReadingDocument({
      title: result.fileName,
      text: result.text,
      source: result.source,
      updatedAt: new Date().toISOString(),
    }));
    setImportState({ status: "success", message: importMessage(result) });
  }, [documentImporter, reader]);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.fill}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            layout === "wide" && styles.contentWide,
          ]}
          keyboardShouldPersistTaps="handled"
          testID="reader-layout"
        >
          <View style={[styles.sourceColumn, layout === "wide" && styles.wideColumn]}>
            <View style={styles.header}>
              <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
                Speedreader
              </Text>
              <Text style={[styles.introduction, { color: theme.textMuted }]}>
                Paste text and read entirely offline, or import a local text, Markdown, or PDF file.
              </Text>
            </View>

            <Pressable
              accessibilityHint="Opens the system document picker"
              accessibilityLabel="Import document"
              accessibilityRole="button"
              accessibilityState={{ disabled: importState.status === "importing" }}
              disabled={importState.status === "importing"}
              onPress={importDocument}
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: theme.action },
                pressed && styles.pressed,
              ]}
            >
              {importState.status === "importing" ? (
                <ActivityIndicator color={theme.actionText} />
              ) : null}
              <Text style={[styles.primaryButtonText, { color: theme.actionText }]}>
                {importState.status === "importing" ? "Importing…" : "Import document"}
              </Text>
            </Pressable>

            <ImportStatus state={importState} theme={theme} />

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.text }]}>Source text</Text>
              <TextInput
                accessibilityHint="Editing the text resets reading progress"
                accessibilityLabel="Source text"
                multiline
                onChangeText={reader.setText}
                placeholder="Paste or type text to read"
                placeholderTextColor={theme.textMuted}
                style={[
                  styles.textInput,
                  {
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                    color: theme.text,
                  },
                ]}
                textAlignVertical="top"
                value={reader.document.text}
              />
            </View>
          </View>

          <ReaderPanel reader={reader} theme={theme} wide={layout === "wide"} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

type Theme = (typeof themes)[keyof typeof themes];

function ImportStatus({ state, theme }: Readonly<{ state: ImportState; theme: Theme }>) {
  if (state.status === "idle" || state.status === "importing") return null;
  return (
    <Text
      accessibilityLiveRegion="polite"
      accessibilityRole={state.status === "error" ? "alert" : "text"}
      style={[styles.status, { color: state.status === "error" ? theme.danger : theme.textMuted }]}
    >
      {state.message}
    </Text>
  );
}

function ReaderPanel({
  reader,
  theme,
  wide,
}: Readonly<{ reader: SpeedReaderController; theme: Theme; wide: boolean }>) {
  const currentText = reader.currentChunk?.text;
  const displayText = currentText ?? (reader.chunks.length === 0 ? "Add text to start" : "Finished");
  const completed = reader.progress.completed;
  const canGoBack = reader.progress.chunkIndex > 0;
  const canGoForward = reader.progress.chunkIndex < reader.progress.totalChunks;
  const togglePlayback = () => {
    if (completed) reader.seek(0);
    else if (reader.isPlaying) reader.pause();
    else reader.play();
  };
  const playbackLabel = completed ? "Restart" : reader.isPlaying ? "Pause" : "Play";
  const progressText = `${reader.progress.chunkIndex} of ${reader.progress.totalChunks} chunks`;

  return (
    <View
      style={[
        styles.readerPanel,
        wide && styles.wideColumn,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      <Text
        accessibilityLabel="Reader"
        accessibilityRole="header"
        style={[styles.sectionTitle, { color: theme.text }]}
      >
        Reader
      </Text>
      <View style={styles.readerStage}>
        <Text
          accessibilityLabel={displayText}
          accessibilityLiveRegion="polite"
          style={[styles.readerWord, { color: theme.text }]}
        >
          {currentText === undefined ? displayText : <PivotedChunk reader={reader} theme={theme} />}
        </Text>
      </View>

      <View
        accessibilityLabel="Reading progress"
        accessibilityRole="progressbar"
        accessibilityValue={{
          min: 0,
          max: Math.max(reader.progress.totalChunks, 1),
          now: reader.progress.chunkIndex,
          text: progressText,
        }}
        style={[styles.progressTrack, { backgroundColor: theme.surfaceMuted }]}
      >
        <View
          style={[
            styles.progressFill,
            {
              backgroundColor: theme.action,
              width: `${progressPercent(reader)}%`,
            },
          ]}
        />
      </View>
      <Text style={[styles.progressText, { color: theme.textMuted }]}>{progressText}</Text>

      <View accessibilityLabel="Reading controls" style={styles.controls}>
        <ControlButton
          disabled={!canGoBack}
          label="Previous"
          onPress={() => reader.seek(reader.progress.chunkIndex - 1)}
          theme={theme}
        />
        <ControlButton
          disabled={reader.chunks.length === 0}
          emphasized
          label={playbackLabel}
          onPress={togglePlayback}
          theme={theme}
        />
        <ControlButton
          disabled={!canGoForward}
          label="Next"
          onPress={() => reader.seek(reader.progress.chunkIndex + 1)}
          theme={theme}
        />
      </View>

      <View style={[styles.settings, { borderTopColor: theme.border }]}>
        <SettingStepper
          decrement={() => reader.setWordsPerMinute(Math.max(60, reader.settings.wordsPerMinute - 50))}
          decrementLabel="Decrease reading speed"
          increment={() => reader.setWordsPerMinute(Math.min(900, reader.settings.wordsPerMinute + 50))}
          incrementLabel="Increase reading speed"
          label="Reading speed"
          theme={theme}
          value={`${reader.settings.wordsPerMinute} words per minute`}
        />
        <SettingStepper
          decrement={() => reader.setChunkSize(Math.max(1, reader.settings.chunkSize - 1))}
          decrementLabel="Fewer words per chunk"
          increment={() => reader.setChunkSize(Math.min(4, reader.settings.chunkSize + 1))}
          incrementLabel="More words per chunk"
          label="Chunk size"
          theme={theme}
          value={`${reader.settings.chunkSize} ${reader.settings.chunkSize === 1 ? "word" : "words"}`}
        />
      </View>
    </View>
  );
}

function PivotedChunk({ reader, theme }: Readonly<{ reader: SpeedReaderController; theme: Theme }>) {
  const chunk = reader.currentChunk;
  if (chunk === undefined) return null;
  return (
    <>
      {chunk.text.slice(0, chunk.pivot)}
      <Text style={{ color: theme.accent }}>{chunk.text[chunk.pivot]}</Text>
      {chunk.text.slice(chunk.pivot + 1)}
    </>
  );
}

type ControlButtonProps = Readonly<{
  disabled: boolean;
  emphasized?: boolean;
  label: string;
  onPress: () => void;
  theme: Theme;
}>;

function ControlButton({ disabled, emphasized = false, label, onPress, theme }: ControlButtonProps) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.controlButton,
        {
          backgroundColor: emphasized ? theme.action : theme.surfaceMuted,
          borderColor: emphasized ? theme.action : theme.border,
        },
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.controlButtonText, { color: emphasized ? theme.actionText : theme.text }]}>
        {label}
      </Text>
    </Pressable>
  );
}

type SettingStepperProps = Readonly<{
  decrement: () => void;
  decrementLabel: string;
  increment: () => void;
  incrementLabel: string;
  label: string;
  theme: Theme;
  value: string;
}>;

function SettingStepper({
  decrement,
  decrementLabel,
  increment,
  incrementLabel,
  label,
  theme,
  value,
}: SettingStepperProps) {
  return (
    <View accessibilityLabel={label} style={styles.settingRow}>
      <View style={styles.settingCopy}>
        <Text style={[styles.settingLabel, { color: theme.text }]}>{label}</Text>
        <Text accessibilityLiveRegion="polite" style={[styles.settingValue, { color: theme.textMuted }]}>
          {value}
        </Text>
      </View>
      <View style={styles.stepperControls}>
        <SmallButton label={decrementLabel} onPress={decrement} theme={theme}>−</SmallButton>
        <SmallButton label={incrementLabel} onPress={increment} theme={theme}>+</SmallButton>
      </View>
    </View>
  );
}

function SmallButton({
  children,
  label,
  onPress,
  theme,
}: Readonly<{ children: ReactNode; label: string; onPress: () => void; theme: Theme }>) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.smallButton,
        { backgroundColor: theme.surfaceMuted, borderColor: theme.border },
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.smallButtonText, { color: theme.text }]}>{children}</Text>
    </Pressable>
  );
}

function importMessage(result: Extract<DocumentImportResult, { status: "imported" }>): string {
  if (result.source === "pdf") {
    return `Imported ${result.fileName} (${result.pageCount ?? 0} pages).`;
  }
  return `Imported ${result.fileName}.`;
}

function progressPercent(reader: SpeedReaderController): number {
  if (reader.progress.totalChunks === 0) return 0;
  return (reader.progress.chunkIndex / reader.progress.totalChunks) * 100;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  fill: { flex: 1 },
  content: {
    flexGrow: 1,
    gap: 20,
    marginHorizontal: "auto",
    maxWidth: 1180,
    padding: 20,
    width: "100%",
  },
  contentWide: { alignItems: "stretch", flexDirection: "row", padding: 28 },
  sourceColumn: { flex: 1, gap: 16 },
  wideColumn: { flexBasis: 0, minWidth: 0 },
  header: { gap: 8 },
  title: { fontSize: 32, fontWeight: "800", letterSpacing: -0.8 },
  introduction: { fontSize: 16, lineHeight: 23 },
  primaryButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: 12,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  primaryButtonText: { fontSize: 16, fontWeight: "700" },
  status: { fontSize: 14, lineHeight: 20 },
  inputGroup: { flex: 1, gap: 8 },
  label: { fontSize: 15, fontWeight: "700" },
  textInput: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    fontSize: 17,
    lineHeight: 25,
    minHeight: 190,
    padding: 16,
  },
  readerPanel: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    gap: 14,
    justifyContent: "center",
    minHeight: 390,
    padding: 20,
  },
  sectionTitle: { fontSize: 16, fontWeight: "800" },
  readerStage: { alignItems: "center", justifyContent: "center", minHeight: 120 },
  readerWord: { fontSize: 42, fontWeight: "700", letterSpacing: -0.5, textAlign: "center" },
  progressTrack: { borderRadius: 4, height: 8, overflow: "hidden", width: "100%" },
  progressFill: { borderRadius: 4, height: "100%" },
  progressText: { fontSize: 14, textAlign: "center" },
  controls: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center" },
  controlButton: {
    alignItems: "center",
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
    minHeight: 48,
    minWidth: 92,
    paddingHorizontal: 16,
  },
  controlButtonText: { fontSize: 16, fontWeight: "700" },
  settings: { borderTopWidth: StyleSheet.hairlineWidth, gap: 12, marginTop: 4, paddingTop: 16 },
  settingRow: { alignItems: "center", flexDirection: "row", gap: 12, justifyContent: "space-between" },
  settingCopy: { flex: 1, gap: 2 },
  settingLabel: { fontSize: 15, fontWeight: "700" },
  settingValue: { fontSize: 14 },
  stepperControls: { flexDirection: "row", gap: 8 },
  smallButton: {
    alignItems: "center",
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  smallButtonText: { fontSize: 24, fontWeight: "600", lineHeight: 28 },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.72 },
});
