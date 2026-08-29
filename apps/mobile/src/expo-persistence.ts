import {
  documentDirectory,
  readAsStringAsync,
  writeAsStringAsync,
} from "expo-file-system";

import {
  createReaderPersistence,
  type ReaderPersistence,
  type SerializedReaderStorage,
} from "@moritzbrantner/speed-reading/persistence";

const stateFileName = "speedreader-reader-state-v1.json";

export type ExpoPersistenceDependencies = Readonly<{
  stateFileUri?: string;
  read: (uri: string) => Promise<string>;
  write: (uri: string, serialized: string) => Promise<void>;
}>;

export function createExpoReaderPersistence(
  dependencies: ExpoPersistenceDependencies = expoDependencies(),
): ReaderPersistence {
  const storage: SerializedReaderStorage = {
    async read() {
      if (dependencies.stateFileUri === undefined) return undefined;
      try {
        return await dependencies.read(dependencies.stateFileUri);
      } catch {
        return undefined;
      }
    },
    async write(serialized) {
      if (dependencies.stateFileUri === undefined) {
        throw new Error("Expo document storage is unavailable");
      }
      await dependencies.write(dependencies.stateFileUri, serialized);
    },
  };
  return createReaderPersistence(storage);
}

function expoDependencies(): ExpoPersistenceDependencies {
  return {
    stateFileUri: documentDirectory === null ? undefined : `${documentDirectory}${stateFileName}`,
    read: readAsStringAsync,
    write: writeAsStringAsync,
  };
}
