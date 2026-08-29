import {
  createReaderPersistence,
  type ReaderPersistence,
  type SerializedReaderStorage,
} from "@moritzbrantner/speed-reading/persistence";

const databaseName = "speedreader";
const objectStoreName = "reader-state";
const stateKey = "current";
const localStorageKey = "speedreader.reader-state.v1";

export type BrowserPersistenceEnvironment = Readonly<{
  indexedDB?: IDBFactory;
  localStorage?: Storage;
}>;

export function createBrowserReaderPersistence(
  environment: () => BrowserPersistenceEnvironment = browserEnvironment,
): ReaderPersistence {
  const indexedDb = createIndexedDbStorage(environment);
  const local = createLocalStorage(environment);
  return createReaderPersistence({
    async read() {
      const primary = await indexedDb.read().catch(() => undefined);
      return primary ?? local.read();
    },
    async write(serialized) {
      try {
        await indexedDb.write(serialized);
      } catch {
        await local.write(serialized);
      }
    },
  });
}

function createIndexedDbStorage(
  environment: () => BrowserPersistenceEnvironment,
): SerializedReaderStorage {
  return {
    async read() {
      const database = await openDatabase(environment().indexedDB);
      return new Promise<string | undefined>((resolve, reject) => {
        const transaction = database.transaction(objectStoreName, "readonly");
        const request = transaction.objectStore(objectStoreName).get(stateKey);
        request.onsuccess = () => resolve(typeof request.result === "string" ? request.result : undefined);
        request.onerror = () => reject(request.error ?? new Error("Could not read browser persistence"));
        transaction.oncomplete = () => database.close();
      });
    },
    async write(serialized) {
      const database = await openDatabase(environment().indexedDB);
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(objectStoreName, "readwrite");
        transaction.objectStore(objectStoreName).put(serialized, stateKey);
        transaction.oncomplete = () => {
          database.close();
          resolve();
        };
        transaction.onerror = () => {
          database.close();
          reject(transaction.error ?? new Error("Could not write browser persistence"));
        };
        transaction.onabort = transaction.onerror;
      });
    },
  };
}

function createLocalStorage(
  environment: () => BrowserPersistenceEnvironment,
): SerializedReaderStorage {
  return {
    async read() {
      const value = environment().localStorage?.getItem(localStorageKey);
      return value ?? undefined;
    },
    async write(serialized) {
      const storage = environment().localStorage;
      if (storage === undefined) throw new Error("Browser storage is unavailable");
      storage.setItem(localStorageKey, serialized);
    },
  };
}

function openDatabase(indexedDB: IDBFactory | undefined): Promise<IDBDatabase> {
  if (indexedDB === undefined) return Promise.reject(new Error("IndexedDB is unavailable"));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(objectStoreName)) {
        request.result.createObjectStore(objectStoreName);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open browser persistence"));
    request.onblocked = () => reject(new Error("Browser persistence upgrade is blocked"));
  });
}

function browserEnvironment(): BrowserPersistenceEnvironment {
  if (typeof window === "undefined") return {};
  let indexedDB: IDBFactory | undefined;
  let localStorage: Storage | undefined;
  try {
    indexedDB = window.indexedDB;
  } catch {
    // Access can be denied independently for each browser persistence API.
  }
  try {
    localStorage = window.localStorage;
  } catch {
    // The IndexedDB path can still remain available.
  }
  return { indexedDB, localStorage };
}
