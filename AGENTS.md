# speedreader

Read the repository root `README.md` before changing product behavior. The shared
reader core in `packages/speed-reading/src/core.ts` is platform-neutral: never
import React, DOM, React Native, Next.js, Expo, Tauri, storage, or extraction
concerns into it. Platform applications own presentation and adapters.

Run `bun run ci` for the complete local gate. Run the narrower package check
first when changing one surface. GitHub Actions mirrors this command and should
remain runnable with `act`.
