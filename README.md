# speedreader

Cross-platform speed-reading product for web, mobile, and desktop.

**Web app:** https://moritzbrantner.github.io/speedreader/

## Architecture direction

- **Web:** Next.js 16 App Router with a static export deployed to GitHub Pages.
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

Install JavaScript dependencies with `bun install`, then run `bun run ci` for the
full verification gate. The GitHub Actions workflow has the same commands and
can be exercised locally with `act -j verify`.

The platform-neutral reader lives in `packages/speed-reading`. Its React hook is
a binding only; web and Expo provide their own UI while desktop is a Tauri shell
around the static web export. Native packaging requires the corresponding host
libraries. When those are unavailable locally, use `act -j verify` in addition
to the focused TypeScript and platform tests.
