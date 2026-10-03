# speedreader

Cross-platform speed-reading product for web, mobile, and desktop.

**Web app:** https://moritzbrantner.github.io/speedreader/

## Architecture direction

- **Web:** Next.js 16 App Router with a static export deployed to GitHub Pages. PDF import runs locally in a Web Worker: Rust/WASM handles PDF inspection and canonical document assembly, PDF.js renders scanned pages, and `ocrs` performs browser-side OCR.
- **Mobile:** Expo + Expo Router with native presentation.
- **Desktop:** Tauri 2 embedding the web build and adding native capabilities.
- **Shared reader:** platform-neutral TypeScript chunking, pacing, pivot/ORP, session, and React bindings.
- **Document extraction:** platform-neutral Rust orchestration for PDF text extraction and OCR. Native adapters reuse the canonical OCR contracts from `visual-analysis`; the browser binding lives in `document-extraction-wasm` rather than adding browser concerns to the core crate.

The application should keep its simplest mode permanently useful: plain text can be read locally without requiring OCR, a backend, accounts, or sync. More capable extraction and platform integrations are adapters around that core.

### Settings authority

Web and Tauri use the generated browser distribution from `moritzbrantner/settings`, pinned to browser-dist commit `1a268c485380eafb4e233a24c5803db4ff1f9ed0` (settings source `4aff7dc2dbfcae0e245269bd3fe50f6afb8e19e8`). The build vendors that immutable runtime into the static web output so Tauri stays offline-capable.

The settings foundation is authoritative for durable reader preferences and semantic-role policy on those surfaces. Speedreader still owns what each setting means and its defaults. Existing `ReaderPreferences` persistence is retained as a migration/compatibility cache while mobile remains on the earlier persistence path; it is not the authority once the settings user-scope snapshot exists. Per-document semantic region corrections remain document/session state rather than global user settings.

## Browser PDF extraction

The GitHub Pages build does not need an extraction server. PDFs with embedded text are inspected and cleaned entirely through the Rust/WASM extraction core. If a page has no embedded text, PDF.js renders only that page to an off-screen canvas and the worker runs `ocrs` against the pixels before handing the recognized text back to the canonical Rust document assembly path.

PDF bytes and rendered page pixels stay in the browser. The OCR detection and recognition models are downloaded lazily from the upstream `ocrs` model host on first scanned-PDF use, verified against pinned SHA-256 digests, and are not vendored into this repository or the Pages bundle. The current browser OCR model is intended primarily for printed Latin-script text; embedded-text PDFs do not have that limitation.

A configured `NEXT_PUBLIC_EXTRACTION_URL` remains an explicit HTTP extraction override. This keeps hosted/server deployments and the existing service contract available without making GitHub Pages depend on a backend.

## Webpage extraction

Web, Tauri, and mobile can import a public URL. Web/Tauri first fetch and
parses accessible HTML in the browser, removes page chrome, scores article/main
content candidates, and converts headings and text blocks into the same semantic
`ReadingDocument` region contract used by PDF extraction. This means webpage
imports use the existing semantic filters and reading projection rather than a
parallel reader path.

Many public sites block direct browser reads through CORS. In that case the
static web build falls back to Jina Reader by default. Mobile uses the same
platform-neutral remote-reader contract because React Native does not expose the
browser DOM parser. Obvious localhost, single-label, and private-network
addresses are never passed to the remote fallback. Set
`NEXT_PUBLIC_WEB_READER_PREFIX` on web/Tauri or
`EXPO_PUBLIC_WEB_READER_PREFIX` on mobile to a URL-prefix-compatible reader;
set the value to an empty string to disable remote extraction.

## Roadmap

1. [A0 — Scaffold monorepo and prove the shared reader](https://github.com/moritzbrantner/speedreader/issues/1)
2. [A1 — Extract a deterministic headless reading session](https://github.com/moritzbrantner/speedreader/issues/2)
3. [A2 — Add Rust PDF and OCR document extraction](https://github.com/moritzbrantner/speedreader/issues/3)
4. [A3 — Build the complete statically exportable Next.js web reader](https://github.com/moritzbrantner/speedreader/issues/4)
5. [A4 — Add the offline-first Tauri desktop application](https://github.com/moritzbrantner/speedreader/issues/5)
6. [A5 — Build the native Expo mobile reader](https://github.com/moritzbrantner/speedreader/issues/6)
7. [A6 — Add persistence, parity checks, and finish the migration](https://github.com/moritzbrantner/speedreader/issues/7)

The roadmap is implemented in this repository through A6. Keep new product and
reader work here; do not recreate reader behavior in platform-specific packages.

## Canonical ownership and migration

This `speedreader` repository is the canonical source for the product and the
`@moritzbrantner/speed-reading` reader implementation. The shared package owns
platform-neutral chunking, pacing, sessions, versioned persistence contracts,
and parity fixtures. Web, Expo, and Tauri own their storage and presentation
adapters. A corrupt, unavailable, or full persistence backend must never block
the local plain-text reader.

The older `@moritzbrantner/speed-reading` implementation in the external
`platform-packages` repository is now a migration source, not a competing source
authority. Its external deprecation handoff is:

1. migrate remaining consumers to this repository's package and verify them
   against the shared parity fixtures;
2. mark the `platform-packages` package deprecated and point its package metadata
   and README at this repository without changing its API silently;
3. retain a compatibility redirect or a final deprecated release long enough
   for consumers to move, then remove duplicate source only in separately
   authorized external-repository work.

This repository does not publish or mutate that external package as part of the
handoff.

## Local durability

Reader documents, preferences, recent documents, and validated progress use the
versioned contracts in `packages/speed-reading/src/persistence.ts`. The web app
prefers IndexedDB and falls back to local storage, Expo writes to its native
document directory, and Tauri writes to its app-local data directory. Progress
is restored paused and only when the document fingerprint and current chunking
semantics still match; incompatible or malformed state starts safely at the
beginning.

## Local development

Install JavaScript dependencies with `bun install`. Browser PDF builds also need
the Rust `wasm32-unknown-unknown` target and the matching wasm-bindgen CLI:

```sh
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.127 --locked
bun run ci
```

The GitHub Actions workflows install the same WASM toolchain before running the
full verification gate and before producing the Pages artifact. The platform-neutral
reader lives in `packages/speed-reading`. Its React hook is a binding only; web
and Expo provide their own UI while desktop is a Tauri shell around the static
web export. Native packaging requires the corresponding host libraries. When
those are unavailable locally, use `act -j verify` in addition to the focused
TypeScript and platform tests.
