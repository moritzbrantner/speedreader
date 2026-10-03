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

import type { DocumentTextRole, ReadingDocument } from "@moritzbrantner/speed-reading/document";
import { readerFixture } from "@moritzbrantner/speed-reading/fixture";
import {
  createReadingDocument,
  type ReaderPersistence,
} from "@moritzbrantner/speed-reading/persistence";
import {
  useDurableSpeedReader,
  type SpeedReaderController,
} from "@moritzbrantner/speed-reading/react";
import {
  projectDocumentText,
  regionIncludedBySemanticFilters,
  semanticReviewRegions,
  semanticRoleStats,
  type SemanticFilterMode,
  type SemanticRegionOverrides,
  type SemanticRoleModes,
} from "@moritzbrantner/speed-reading/semantic-filter";

import type { DocumentImportAdapter, DocumentImportResult } from "./document-import";
import { readerLayoutMode } from "./reader-layout";
import type { WebPageImportAdapter } from "./webpage-import";

type ReaderScreenProps = Readonly<{
  documentImporter: DocumentImportAdapter;
  persistence?: ReaderPersistence;
  webPageImporter: WebPageImportAdapter;
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

export function ReaderScreen({
  documentImporter,
  persistence,
  webPageImporter,
}: ReaderScreenProps) {
  const [importState, setImportState] = useState<ImportState>({ status: "idle" });
  const [webUrl, setWebUrl] = useState("");
  const [semanticDocument, setSemanticDocument] = useState<ReadingDocument | undefined>();
  const [semanticRoleModes, setSemanticRoleModes] = useState<SemanticRoleModes>({});
  const [semanticRegionOverrides, setSemanticRegionOverrides] = useState<SemanticRegionOverrides>({});
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

    setSemanticRoleModes({});
    setSemanticRegionOverrides({});
    setSemanticDocument("document" in result ? result.document : undefined);
    reader.openDocument(createReadingDocument({
      title: result.fileName,
      text: result.text,
      source: result.source,
      updatedAt: new Date().toISOString(),
    }));
    setImportState({ status: "success", message: importMessage(result) });
  }, [documentImporter, reader]);

  const importWebPage = useCallback(async () => {
    if (webUrl.trim() === "") return;
    setImportState({ status: "importing" });
    const result = await webPageImporter.importWebPage(webUrl);
    if (!result.ok) {
      setImportState({ status: "error", message: result.message });
      return;
    }

    setSemanticRoleModes({});
    setSemanticRegionOverrides({});
    setSemanticDocument(result.document);
    setWebUrl(result.url);
    reader.openDocument(createReadingDocument({
      title: result.title,
      text: result.document.text,
      source: "web",
      updatedAt: new Date().toISOString(),
    }));
    setImportState({
      status: "success",
      message: "Imported " + result.title + ".",
    });
  }, [reader, webPageImporter, webUrl]);

  const applySemanticProjection = (
    roleModes: SemanticRoleModes,
    regionOverrides: SemanticRegionOverrides,
  ) => {
    if (semanticDocument === undefined) return;
    reader.setReadingText(projectDocumentText(semanticDocument, roleModes, regionOverrides));
  };

  const updateSemanticRole = (role: DocumentTextRole, mode: SemanticFilterMode) => {
    const nextRoleModes: Partial<Record<DocumentTextRole, SemanticFilterMode>> = {
      ...semanticRoleModes,
    };
    if (mode === "default") delete nextRoleModes[role];
    else nextRoleModes[role] = mode;
    setSemanticRoleModes(nextRoleModes);
    applySemanticProjection(nextRoleModes, semanticRegionOverrides);
  };

  const updateSemanticRegion = (key: string, included: boolean) => {
    const nextRegionOverrides = { ...semanticRegionOverrides, [key]: included };
    setSemanticRegionOverrides(nextRegionOverrides);
    applySemanticProjection(semanticRoleModes, nextRegionOverrides);
  };

  const clearSemanticRegion = (key: string) => {
    const nextRegionOverrides = { ...semanticRegionOverrides };
    delete nextRegionOverrides[key];
    setSemanticRegionOverrides(nextRegionOverrides);
    applySemanticProjection(semanticRoleModes, nextRegionOverrides);
  };

  const resetSemanticFilters = () => {
    setSemanticRoleModes({});
    setSemanticRegionOverrides({});
    if (semanticDocument !== undefined) reader.setReadingText(semanticDocument.text);
  };

  const updateSourceText = (text: string) => {
    setSemanticDocument(undefined);
    setSemanticRoleModes({});
    setSemanticRegionOverrides({});
    reader.setText(text);
  };

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
                Paste text, import a local document, or extract the readable text from a public webpage.
              </Text>
            </View>

            <View
              accessibilityLabel="Import web page"
              style={[
                styles.webImportCard,
                { backgroundColor: theme.surface, borderColor: theme.border },
              ]}
            >
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Read a webpage</Text>
              <Text style={[styles.webHint, { color: theme.textMuted }]}>
                The configured reader service fetches the public page, removes navigation and other page chrome, and returns semantic text regions for speed reading.
              </Text>
              <TextInput
                accessibilityLabel="Web address"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                onChangeText={setWebUrl}
                placeholder="https://example.com/article"
                placeholderTextColor={theme.textMuted}
                style={[
                  styles.webInput,
                  {
                    backgroundColor: theme.background,
                    borderColor: theme.border,
                    color: theme.text,
                  },
                ]}
                value={webUrl}
              />
              <Pressable
                accessibilityLabel="Extract webpage"
                accessibilityRole="button"
                accessibilityState={{
                  disabled: importState.status === "importing" || webUrl.trim() === "",
                }}
                disabled={importState.status === "importing" || webUrl.trim() === ""}
                onPress={importWebPage}
                style={({ pressed }) => [
                  styles.primaryButton,
                  { backgroundColor: theme.action },
                  (importState.status === "importing" || webUrl.trim() === "") && styles.disabled,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.primaryButtonText, { color: theme.actionText }]}>
                  {importState.status === "importing" ? "Extracting…" : "Extract webpage"}
                </Text>
              </Pressable>
              <Text style={[styles.webDisclosure, { color: theme.textMuted }]}>
                Public URLs are sent to the configured webpage reader service. Local and private-network addresses are rejected.
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
                accessibilityHint="Editing the text resets reading progress and semantic filters"
                accessibilityLabel="Source text"
                multiline
                onChangeText={updateSourceText}
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

            {semanticDocument === undefined ? null : (
              <SemanticFiltersPanel
                document={semanticDocument}
                onRegionOverride={updateSemanticRegion}
                onRegionReset={clearSemanticRegion}
                onReset={resetSemanticFilters}
                onRoleMode={updateSemanticRole}
                regionOverrides={semanticRegionOverrides}
                roleModes={semanticRoleModes}
                theme={theme}
              />
            )}
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

type SemanticFiltersPanelProps = Readonly<{
  document: ReadingDocument;
  onRegionOverride: (key: string, included: boolean) => void;
  onRegionReset: (key: string) => void;
  onReset: () => void;
  onRoleMode: (role: DocumentTextRole, mode: SemanticFilterMode) => void;
  regionOverrides: SemanticRegionOverrides;
  roleModes: SemanticRoleModes;
  theme: Theme;
}>;

function SemanticFiltersPanel({
  document,
  onRegionOverride,
  onRegionReset,
  onReset,
  onRoleMode,
  regionOverrides,
  roleModes,
  theme,
}: SemanticFiltersPanelProps) {
  const roleStats = semanticRoleStats(document, roleModes, regionOverrides)
    .filter((stats) => stats.regionCount > 0);
  const reviewRegions = semanticReviewRegions(document);
  if (roleStats.length === 0) return null;

  const hasOverrides =
    Object.keys(roleModes).length > 0 || Object.keys(regionOverrides).length > 0;

  return (
    <View
      accessibilityLabel="Semantic filters"
      style={[styles.semanticPanel, { backgroundColor: theme.surface, borderColor: theme.border }]}
    >
      <View style={styles.semanticHeader}>
        <View style={styles.semanticHeaderCopy}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Semantic filters</Text>
          <Text style={[styles.semanticDescription, { color: theme.textMuted }]}>
            Inspect extracted roles and change only the reading projection. The original extracted regions remain intact.
          </Text>
        </View>
        <Pressable
          accessibilityLabel="Reset semantic filters"
          accessibilityRole="button"
          accessibilityState={{ disabled: !hasOverrides }}
          disabled={!hasOverrides}
          onPress={onReset}
          style={({ pressed }) => [
            styles.secondaryButton,
            { backgroundColor: theme.surfaceMuted, borderColor: theme.border },
            !hasOverrides && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.secondaryButtonText, { color: theme.text }]}>Reset</Text>
        </Pressable>
      </View>

      {roleStats.map((stats) => {
        const currentMode = roleModes[stats.role] ?? "default";
        return (
          <View key={stats.role} style={[styles.semanticRoleRow, { borderTopColor: theme.border }]}>
            <Text style={[styles.settingLabel, { color: theme.text }]}>
              {semanticLabel(stats.role)}
            </Text>
            <Text style={[styles.settingValue, { color: theme.textMuted }]}>
              {stats.regionCount} detected · {stats.effectiveIncludedCount} included
            </Text>
            <View style={styles.semanticPolicyRow}>
              {(["default", "include", "exclude"] as const).map((mode) => {
                const selected = currentMode === mode;
                return (
                  <Pressable
                    accessibilityLabel={`${semanticLabel(stats.role)} policy ${mode}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    key={mode}
                    onPress={() => onRoleMode(stats.role, mode)}
                    style={({ pressed }) => [
                      styles.semanticPolicyButton,
                      {
                        backgroundColor: selected ? theme.action : theme.surfaceMuted,
                        borderColor: selected ? theme.action : theme.border,
                      },
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.semanticPolicyText,
                        { color: selected ? theme.actionText : theme.text },
                      ]}
                    >
                      {mode === "default" ? "Default" : mode === "include" ? "Include" : "Exclude"}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      })}

      {reviewRegions.length === 0 ? null : (
        <View style={styles.semanticRegions}>
          <Text style={[styles.settingLabel, { color: theme.text }]}>
            Classified regions ({reviewRegions.length})
          </Text>
          {reviewRegions.map(({ key, pageNumber, region }) => {
            const included = regionIncludedBySemanticFilters(
              pageNumber,
              region,
              roleModes,
              regionOverrides,
            );
            const overridden = Object.prototype.hasOwnProperty.call(regionOverrides, key);
            return (
              <View key={key} style={[styles.semanticRegion, { borderTopColor: theme.border }]}>
                <Text style={[styles.settingLabel, { color: theme.text }]}>
                  {semanticLabel(region.role)} · page {pageNumber}
                </Text>
                <Text style={[styles.semanticDescription, { color: theme.textMuted }]}>
                  {region.text}
                </Text>
                <View style={styles.semanticRegionActions}>
                  <Pressable
                    accessibilityLabel={`${included ? "Exclude" : "Include"} ${semanticLabel(region.role)} region on page ${pageNumber}`}
                    accessibilityRole="button"
                    onPress={() => onRegionOverride(key, !included)}
                    style={({ pressed }) => [
                      styles.secondaryButton,
                      { backgroundColor: theme.surfaceMuted, borderColor: theme.border },
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={[styles.secondaryButtonText, { color: theme.text }]}>
                      {included ? "Exclude" : "Include"}
                    </Text>
                  </Pressable>
                  {overridden ? (
                    <Pressable
                      accessibilityLabel={`Use role policy for ${semanticLabel(region.role)} region on page ${pageNumber}`}
                      accessibilityRole="button"
                      onPress={() => onRegionReset(key)}
                      style={({ pressed }) => [
                        styles.secondaryButton,
                        { backgroundColor: theme.surfaceMuted, borderColor: theme.border },
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text style={[styles.secondaryButtonText, { color: theme.text }]}>
                        Use role policy
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
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
    return `Imported ${result.fileName} (${result.pageCount} pages).`;
  }
  return `Imported ${result.fileName}.`;
}

function semanticLabel(value: string): string {
  const spaced = value.replace(/([a-z])([A-Z])/g, "$1 $2");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
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
  webImportCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 10,
    padding: 14,
  },
  webHint: { fontSize: 14, lineHeight: 20 },
  webInput: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  webDisclosure: { fontSize: 12, lineHeight: 17 },
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
  semanticPanel: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 14,
    padding: 14,
  },
  semanticHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  semanticHeaderCopy: { flex: 1, gap: 4 },
  semanticDescription: { fontSize: 14, lineHeight: 20 },
  semanticRoleRow: { borderTopWidth: StyleSheet.hairlineWidth, gap: 8, paddingTop: 12 },
  semanticPolicyRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  semanticPolicyButton: {
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 40,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  semanticPolicyText: { fontSize: 14, fontWeight: "700" },
  semanticRegions: { gap: 8 },
  semanticRegion: { borderTopWidth: StyleSheet.hairlineWidth, gap: 7, paddingTop: 10 },
  semanticRegionActions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  secondaryButton: {
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 40,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  secondaryButtonText: { fontSize: 14, fontWeight: "700" },
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
