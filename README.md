# speedreader

Cross-platform speed-reading product for web, mobile, and desktop.

## Architecture direction

- **Web:** Next.js with a static-export-compatible product shell.
- **Mobile:** Expo + Expo Router with native presentation.
- **Desktop:** Tauri 2 embedding the web build and adding native capabilities.
- **Shared reader:** platform-neutral TypeScript chunking, pacing, pivot/ORP, session, and React bindings.
- **Document extraction:** Rust orchestration for PDF text extraction and OCR, reusing the canonical OCR implementation from `visual-analysis` rather than duplicating it here.

The application should keep its simplest mode permanently useful: plain text can be read locally without requiring OCR, a backend, accounts, or sync. More capable extraction and platform integrations are adapters around that core.

## Roadmap

1. [A0 — Scaffold monorepo and prove the shared reader](https://github.com/moritzbrantner/speedreader/issues/1)
2. [A1 — Extract a deterministic headless reading session](https://github.com/moritzbrantner/speedreader/issues/2)
3. [A2 — Add Rust PDF and OCR document extraction](https://github.com/moritzbrantner/speedreader/issues/3)
4. [A3 — Build the complete statically exportable Next.js web reader](https://github.com/moritzbrantner/speedreader/issues/4)
5. [A4 — Add the offline-first Tauri desktop application](https://github.com/moritzbrantner/speedreader/issues/5)
6. [A5 — Build the native Expo mobile reader](https://github.com/moritzbrantner/speedreader/issues/6)
7. [A6 — Add persistence, parity checks, and finish the migration](https://github.com/moritzbrantner/speedreader/issues/7)

Start with A0. Do not pull later OCR, persistence, or sync concerns into the foundation prematurely.
