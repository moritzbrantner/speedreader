# speedreader

Decision Atlas: `docs/DECISION-ATLAS.md` defines the owner-approved reading experience and open product Questions. Follow its Decisions before changing product behavior; ask one relevant unanswered Question at a time when it materially affects work. `[x]` means owner-approved, not implemented or verified. Keep the Atlas feature-focused and preserve its stable IDs.

Read the repository root `README.md` before changing product behavior. The shared
reader core in `packages/speed-reading/src/core.ts` is platform-neutral: never
import React, DOM, React Native, Next.js, Expo, Tauri, storage, or extraction
concerns into it. Platform applications own presentation and adapters.

Run `bun run ci` for the complete local gate. Run the narrower package check
first when changing one surface. GitHub Actions mirrors this command and should
remain runnable with `act`.
