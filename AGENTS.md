# AGENTS.md

## Product rule

Keep the smallest useful reader working permanently. Plain text reading must not become dependent on PDF extraction, OCR, a server, authentication, sync, or platform-native capabilities.

## Architecture boundaries

- `packages/speed-reading/src/core.ts` is platform-neutral. It must not import React, DOM, React Native, Next.js, Expo, Tauri, storage, networking, or OCR code.
- `packages/speed-reading/src/react.ts` may depend on React but must not render DOM or React Native UI.
- `apps/web` owns browser/Next.js presentation.
- `apps/mobile` owns React Native presentation. Do not import web components into it.
- `apps/desktop` is a thin Tauri shell around the statically exportable web app. Native capabilities enter through explicit adapters/commands.
- `apps/server` is only the backend boundary. Do not move reader state into it.
- Future `crates/document-extraction` owns PDF-to-reading-document orchestration, not OCR engines. Reuse the canonical OCR owner from `visual-analysis`.

## Progressive enhancement

Add sophisticated behavior through adapters and explicit capabilities. Do not make an enhanced strategy the only path when a simpler mode can remain useful as a fallback.

Implementation strategy details must not leak upward. Consumers should depend on stable product contracts such as reader chunks, sessions, and reading documents rather than Tesseract/ONNX/PDF engine specifics.

## A0 scope

Issue #1 is the active slice. Do not implement PDF parsing, OCR, persistence, accounts, synchronization, EPUB, cloud jobs, or native Expo Rust FFI as part of A0.

A0 should prove:

1. one TypeScript reader core,
2. one React behavior binding,
3. independent web and native presentations,
4. a Tauri seam around the web build,
5. a Rust backend seam without premature backend architecture.

## Code conventions

- TypeScript is strict.
- Prefer `type` over `interface`.
- Use semicolons.
- Keep public contracts small and explicit.
- Keep tests next to the package behavior they protect.
- Avoid abstractions that have only one caller unless they establish an intentional platform boundary.
