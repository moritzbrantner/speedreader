import type { ReaderPersistence } from "@moritzbrantner/speed-reading/persistence";

import { createBrowserReaderPersistence } from "./browser-persistence";
import { createDesktopReaderPersistence } from "./desktop-persistence";
import { isDesktopShell } from "./desktop-extraction";

export function createPlatformReaderPersistence(): ReaderPersistence {
  const browser = createBrowserReaderPersistence();
  const desktop = createDesktopReaderPersistence();
  return {
    load: () => isDesktopShell() ? desktop.load() : browser.load(),
    save: (state) => isDesktopShell() ? desktop.save(state) : browser.save(state),
  };
}
