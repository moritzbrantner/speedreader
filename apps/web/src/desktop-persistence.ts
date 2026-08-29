import {
  createReaderPersistence,
  type ReaderPersistence,
  type SerializedReaderStorage,
} from "@moritzbrantner/speed-reading/persistence";

export type DesktopPersistenceBridge = Readonly<{
  load: () => Promise<string | null>;
  save: (serialized: string) => Promise<void>;
}>;

export function createDesktopReaderPersistence(
  bridge: () => DesktopPersistenceBridge | undefined = desktopBridge,
): ReaderPersistence {
  const storage: SerializedReaderStorage = {
    async read() {
      const value = await requiredBridge(bridge).load();
      return value ?? undefined;
    },
    write(serialized) {
      return requiredBridge(bridge).save(serialized);
    },
  };
  return createReaderPersistence(storage);
}

function requiredBridge(
  bridge: () => DesktopPersistenceBridge | undefined,
): DesktopPersistenceBridge {
  const value = bridge();
  if (value === undefined) throw new Error("Desktop persistence is unavailable");
  return value;
}

function desktopBridge(): DesktopPersistenceBridge | undefined {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return undefined;
  return {
    async load() {
      const { invoke } = await import("@tauri-apps/api/core");
      return invoke<string | null>("load_reader_state");
    },
    async save(serialized) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("save_reader_state", { serialized });
    },
  };
}
