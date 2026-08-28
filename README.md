# speedreader

Cross-platform speed-reading product for web, mobile, and desktop.

## A0

A0 proves one shared reading implementation across three platform shells before PDF/OCR is introduced.

```text
apps/web       Next.js, static export
apps/mobile    Expo + Expo Router
apps/desktop   Tauri 2 shell around the web build
apps/server    minimal Rust server seam
packages/speed-reading
               platform-neutral reader logic + React binding
```

The simple mode is permanent: paste text and read it locally without OCR, a backend, accounts, or sync.

### Commands

```bash
bun install
bun run dev:web
bun run dev:mobile
bun run dev:desktop

bun run test
bun run typecheck
bun run build:web
bun run build:mobile
bun run rust:check
```

`dev:desktop` starts Tauri; its Tauri configuration starts the Next.js development server automatically. Desktop packaging is intentionally a separate check because native system dependencies vary by host.

## Architecture direction

- **Web:** Next.js with `output: "export"` so the product shell remains statically deployable and embeddable by Tauri.
- **Mobile:** Expo + Expo Router with native presentation. It shares behavior, not DOM components.
- **Desktop:** Tauri 2 consumes the web build and later adds local Rust document extraction.
- **Shared reader:** `@moritzbrantner/speed-reading` owns chunking, pacing, pivot/ORP behavior and the cross-platform React hook.
- **Document extraction:** later Rust orchestration for PDF text extraction and OCR will reuse the canonical OCR implementation from `visual-analysis` rather than duplicating it here.

See [docs/architecture.md](docs/architecture.md) for the seams.

## Roadmap

1. [A0 — Scaffold monorepo and prove the shared reader](https://github.com/moritzbrantner/speedreader/issues/1)
2. [A1 — Extract a deterministic headless reading session](https://github.com/moritzbrantner/speedreader/issues/2)
3. [A2 — Add Rust PDF and OCR document extraction](https://github.com/moritzbrantner/speedreader/issues/3)
4. [A3 — Build the complete statically exportable Next.js web reader](https://github.com/moritzbrantner/speedreader/issues/4)
5. [A4 — Add the offline-first Tauri desktop application](https://github.com/moritzbrantner/speedreader/issues/5)
6. [A5 — Build the native Expo mobile reader](https://github.com/moritzbrantner/speedreader/issues/6)
7. [A6 — Add persistence, parity checks, and finish the migration](https://github.com/moritzbrantner/speedreader/issues/7)
