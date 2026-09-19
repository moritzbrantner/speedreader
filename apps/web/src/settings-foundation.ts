import {
  defaultReaderSettings,
  type ReaderSettings,
  type SegmentationPolicy,
} from "@moritzbrantner/speed-reading/core";
import type {
  DocumentTextRole,
} from "@moritzbrantner/speed-reading/document";
import type {
  SemanticFilterMode,
  SemanticRoleModes,
} from "@moritzbrantner/speed-reading/semantic-filter";

export const SETTINGS_BROWSER_DIST_COMMIT = "1a268c485380eafb4e233a24c5803db4ff1f9ed0";
export const SETTINGS_SOURCE_COMMIT = "4aff7dc2dbfcae0e245269bd3fe50f6afb8e19e8";
const SETTINGS_BROWSER_API_VERSION = 1;
const SETTINGS_STORAGE_KEY = "speedreader.settings.user.v1";
const SETTINGS_READY_EVENT = "speedreader-settings-browser-ready";

type SettingScope = "session" | "save" | "device" | "user";
type ApplyMode = "immediate" | "apply" | "restart" | "reconnect";

type SettingValue =
  | Readonly<{ type: "bool"; value: boolean }>
  | Readonly<{ type: "integer"; value: number }>
  | Readonly<{ type: "number"; value: number }>
  | Readonly<{ type: "text"; value: string }>
  | Readonly<{ type: "choice"; value: string }>;

type SettingDefinition = Readonly<{
  id: string;
  kind:
    | Readonly<{ type: "bool" }>
    | Readonly<{ type: "integer"; min: number; max: number }>
    | Readonly<{ type: "number"; min: number; max: number }>
    | Readonly<{ type: "text"; min_chars: number; max_chars: number }>
    | Readonly<{ type: "choice"; options: readonly string[] }>;
  default: SettingValue;
  scope: SettingScope;
  apply_mode: ApplyMode;
}>;

type PresentationEntry = Readonly<{
  id: string;
  metadata: Readonly<{
    label_key: string;
    description_key?: string;
    category_key: string;
    group_key?: string;
    order?: number;
    discoverability?: "primary" | "advanced" | "search_only";
    search_keys?: readonly string[];
  }>;
}>;

type SettingsSession = Readonly<{
  presentation: () => readonly PresentationEntry[];
  effectiveValues: () => Readonly<Record<string, SettingValue>>;
  set: (id: string, value: SettingValue) => void;
  reset: (id: string) => void;
  importScope: (scope: "user", snapshot: string) => readonly string[];
  exportScope: (scope: "user") => string;
  dispose: () => void;
}>;

type SettingsBrowserModule = Readonly<{
  SETTINGS_BROWSER_API_VERSION: number;
  createSettingsSession: (
    definitions: readonly SettingDefinition[],
    presentation?: readonly PresentationEntry[],
  ) => Promise<SettingsSession>;
}>;

declare global {
  interface Window {
    speedreaderSettingsBrowser?: SettingsBrowserModule;
    speedreaderSettingsBrowserError?: string;
  }
}

export const speedreaderSemanticRoles = [
  "content",
  "heading",
  "caption",
  "table",
  "form",
  "footnote",
  "sidebar",
  "header",
  "footer",
  "pageNumber",
] as const satisfies readonly DocumentTextRole[];

const semanticSettingIds: Readonly<Record<DocumentTextRole, string>> = {
  content: "document.semantic.content",
  heading: "document.semantic.heading",
  caption: "document.semantic.caption",
  table: "document.semantic.table",
  form: "document.semantic.form",
  footnote: "document.semantic.footnote",
  sidebar: "document.semantic.sidebar",
  header: "document.semantic.header",
  footer: "document.semantic.footer",
  pageNumber: "document.semantic.page_number",
};

export const SPEEDREADER_SETTING_DEFINITIONS: readonly SettingDefinition[] = [
  {
    id: "reader.words_per_minute",
    kind: { type: "integer", min: 60, max: 1200 },
    default: { type: "integer", value: defaultReaderSettings.wordsPerMinute },
    scope: "user",
    apply_mode: "immediate",
  },
  {
    id: "reader.chunk_size",
    kind: { type: "integer", min: 1, max: 8 },
    default: { type: "integer", value: defaultReaderSettings.chunkSize },
    scope: "user",
    apply_mode: "immediate",
  },
  {
    id: "reader.segmentation",
    kind: { type: "choice", options: ["whitespace", "punctuation"] },
    default: { type: "choice", value: defaultReaderSettings.segmentation },
    scope: "user",
    apply_mode: "immediate",
  },
  ...speedreaderSemanticRoles.map((role) => ({
    id: semanticSettingIds[role],
    kind: { type: "choice" as const, options: ["default", "include", "exclude"] },
    default: { type: "choice" as const, value: "default" },
    scope: "user" as const,
    apply_mode: "immediate" as const,
  })),
];

export const SPEEDREADER_SETTING_PRESENTATION: readonly PresentationEntry[] = [
  {
    id: "reader.words_per_minute",
    metadata: {
      label_key: "settings.reader.words_per_minute.label",
      description_key: "settings.reader.words_per_minute.description",
      category_key: "settings.category.reader",
      group_key: "settings.group.pacing",
      order: 10,
      discoverability: "primary",
      search_keys: ["settings.search.speed", "settings.search.wpm"],
    },
  },
  {
    id: "reader.chunk_size",
    metadata: {
      label_key: "settings.reader.chunk_size.label",
      description_key: "settings.reader.chunk_size.description",
      category_key: "settings.category.reader",
      group_key: "settings.group.pacing",
      order: 20,
      discoverability: "primary",
      search_keys: ["settings.search.chunk", "settings.search.words"],
    },
  },
  {
    id: "reader.segmentation",
    metadata: {
      label_key: "settings.reader.segmentation.label",
      description_key: "settings.reader.segmentation.description",
      category_key: "settings.category.reader",
      group_key: "settings.group.text",
      order: 30,
      discoverability: "advanced",
      search_keys: ["settings.search.punctuation", "settings.search.segmentation"],
    },
  },
  ...speedreaderSemanticRoles.map((role, index) => ({
    id: semanticSettingIds[role],
    metadata: {
      label_key: `settings.document.semantic.${role}.label`,
      description_key: `settings.document.semantic.${role}.description`,
      category_key: "settings.category.document",
      group_key: "settings.group.semantic_filters",
      order: 100 + index,
      discoverability: role === "content" ? "advanced" as const : "primary" as const,
      search_keys: ["settings.search.semantic", `settings.search.${role}`],
    },
  })),
];

export type SpeedreaderSettingsSnapshot = Readonly<{
  reader: ReaderSettings;
  semanticRoleModes: SemanticRoleModes;
}>;

export type SpeedreaderSettingsController = Readonly<{
  snapshot: () => SpeedreaderSettingsSnapshot;
  setReaderSettings: (settings: ReaderSettings) => SpeedreaderSettingsSnapshot;
  setSemanticRoleMode: (
    role: DocumentTextRole,
    mode: SemanticFilterMode,
  ) => SpeedreaderSettingsSnapshot;
  resetSemanticRoleModes: () => SpeedreaderSettingsSnapshot;
  persistenceAvailable: boolean;
  restoreNotice?: string;
  dispose: () => void;
}>;

let settingsModulePromise: Promise<SettingsBrowserModule> | undefined;

export async function createSpeedreaderSettingsController(
  legacyReaderSettings: ReaderSettings,
): Promise<SpeedreaderSettingsController> {
  const settingsModule = await loadSettingsBrowserModule();
  if (settingsModule.SETTINGS_BROWSER_API_VERSION !== SETTINGS_BROWSER_API_VERSION) {
    throw new Error(
      `Unsupported settings browser API ${settingsModule.SETTINGS_BROWSER_API_VERSION}`,
    );
  }

  const session = await settingsModule.createSettingsSession(
    SPEEDREADER_SETTING_DEFINITIONS,
    SPEEDREADER_SETTING_PRESENTATION,
  );
  const restore = restoreUserScope(session, legacyReaderSettings);

  const persist = () => persistUserScope(session);
  const controller: SpeedreaderSettingsController = {
    snapshot: () => snapshotFromValues(session.effectiveValues()),
    setReaderSettings(settings) {
      setReaderSettings(session, settings);
      persist();
      return snapshotFromValues(session.effectiveValues());
    },
    setSemanticRoleMode(role, mode) {
      if (mode === "default") {
        session.reset(semanticSettingIds[role]);
      } else {
        session.set(semanticSettingIds[role], { type: "choice", value: mode });
      }
      persist();
      return snapshotFromValues(session.effectiveValues());
    },
    resetSemanticRoleModes() {
      for (const role of speedreaderSemanticRoles) {
        session.reset(semanticSettingIds[role]);
      }
      persist();
      return snapshotFromValues(session.effectiveValues());
    },
    persistenceAvailable: restore.persistenceAvailable,
    restoreNotice: restore.notice,
    dispose: () => session.dispose(),
  };

  return controller;
}

export function snapshotFromValues(
  values: Readonly<Record<string, SettingValue>>,
): SpeedreaderSettingsSnapshot {
  return {
    reader: {
      wordsPerMinute: integerValue(
        values["reader.words_per_minute"],
        defaultReaderSettings.wordsPerMinute,
      ),
      chunkSize: integerValue(
        values["reader.chunk_size"],
        defaultReaderSettings.chunkSize,
      ),
      segmentation: segmentationValue(values["reader.segmentation"]),
    },
    semanticRoleModes: semanticRoleModesFromValues(values),
  };
}

export function semanticRoleModesFromValues(
  values: Readonly<Record<string, SettingValue>>,
): SemanticRoleModes {
  const roleModes: Partial<Record<DocumentTextRole, SemanticFilterMode>> = {};

  for (const role of speedreaderSemanticRoles) {
    const value = values[semanticSettingIds[role]];
    const mode = value?.type === "choice" ? value.value : "default";
    if (mode === "include" || mode === "exclude") roleModes[role] = mode;
  }

  return roleModes;
}

function setReaderSettings(session: SettingsSession, settings: ReaderSettings) {
  session.set("reader.words_per_minute", {
    type: "integer",
    value: clampInteger(settings.wordsPerMinute, 60, 1200),
  });
  session.set("reader.chunk_size", {
    type: "integer",
    value: clampInteger(settings.chunkSize, 1, 8),
  });
  session.set("reader.segmentation", {
    type: "choice",
    value: normalizeSegmentation(settings.segmentation),
  });
}

function restoreUserScope(
  session: SettingsSession,
  legacyReaderSettings: ReaderSettings,
): Readonly<{ persistenceAvailable: boolean; notice?: string }> {
  let storage: Storage;
  try {
    storage = window.localStorage;
  } catch {
    setReaderSettings(session, legacyReaderSettings);
    return {
      persistenceAvailable: false,
      notice: "Settings are available for this session, but local persistence is unavailable.",
    };
  }

  try {
    const snapshot = storage.getItem(SETTINGS_STORAGE_KEY);
    if (snapshot !== null) {
      const diagnostics = session.importScope("user", snapshot);
      if (diagnostics.length === 0) {
        return { persistenceAvailable: true };
      }
      storage.removeItem(SETTINGS_STORAGE_KEY);
    }

    setReaderSettings(session, legacyReaderSettings);
    storage.setItem(SETTINGS_STORAGE_KEY, session.exportScope("user"));
    return {
      persistenceAvailable: true,
      notice:
        snapshot === null
          ? "Existing reader preferences were migrated into the shared settings foundation."
          : "Stored settings were incompatible and were rebuilt from the reader preferences.",
    };
  } catch {
    setReaderSettings(session, legacyReaderSettings);
    return {
      persistenceAvailable: false,
      notice: "Stored settings could not be restored; reader preferences are active for this session.",
    };
  }
}

function persistUserScope(session: SettingsSession): boolean {
  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, session.exportScope("user"));
    return true;
  } catch {
    return false;
  }
}

function loadSettingsBrowserModule(): Promise<SettingsBrowserModule> {
  settingsModulePromise ??= new Promise((resolve, reject) => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      reject(new Error("The browser settings foundation is unavailable."));
      return;
    }

    if (window.speedreaderSettingsBrowser !== undefined) {
      resolve(window.speedreaderSettingsBrowser);
      return;
    }

    const handleReady = () => {
      window.removeEventListener(SETTINGS_READY_EVENT, handleReady);
      const module = window.speedreaderSettingsBrowser;
      if (module !== undefined) {
        resolve(module);
        return;
      }
      reject(
        new Error(
          window.speedreaderSettingsBrowserError ??
            "The browser settings foundation failed to initialize.",
        ),
      );
    };
    window.addEventListener(SETTINGS_READY_EVENT, handleReady);

    const existing = document.querySelector<HTMLScriptElement>(
      "script[data-speedreader-settings-browser]",
    );
    if (existing !== null) return;

    const script = document.createElement("script");
    script.type = "module";
    script.dataset.speedreaderSettingsBrowser = "true";
    script.src = new URL("vendor/settings/bridge.js", document.baseURI).href;
    script.addEventListener("error", () => {
      window.removeEventListener(SETTINGS_READY_EVENT, handleReady);
      reject(new Error("Unable to load the pinned settings browser distribution."));
    });
    document.head.append(script);
  });

  return settingsModulePromise;
}

function integerValue(value: SettingValue | undefined, fallback: number): number {
  return value?.type === "integer" ? value.value : fallback;
}

function segmentationValue(value: SettingValue | undefined): SegmentationPolicy {
  if (
    value?.type === "choice" &&
    (value.value === "whitespace" || value.value === "punctuation")
  ) {
    return value.value;
  }
  return defaultReaderSettings.segmentation;
}

function normalizeSegmentation(segmentation: SegmentationPolicy): SegmentationPolicy {
  return segmentation === "punctuation" ? "punctuation" : "whitespace";
}

function clampInteger(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Math.round(value)));
}
