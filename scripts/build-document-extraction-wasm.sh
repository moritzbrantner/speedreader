#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WASM_OUT="$ROOT/apps/web/public/wasm"
PDFJS_OUT="$ROOT/apps/web/public/pdfjs"
TARGET_WASM="$ROOT/target/wasm32-unknown-unknown/release/document_extraction_wasm.wasm"

if ! command -v wasm-bindgen >/dev/null 2>&1; then
  echo "wasm-bindgen CLI is required (expected 0.2.127)." >&2
  exit 1
fi

PDFJS_DIR="$ROOT/node_modules/pdfjs-dist"
if [[ ! -d "$PDFJS_DIR" ]]; then
  PDFJS_DIR="$ROOT/apps/web/node_modules/pdfjs-dist"
fi
if [[ ! -f "$PDFJS_DIR/build/pdf.mjs" || ! -f "$PDFJS_DIR/build/pdf.worker.mjs" ]]; then
  echo "pdfjs-dist is not installed; run bun install first." >&2
  exit 1
fi

rm -rf "$WASM_OUT" "$PDFJS_OUT"
mkdir -p "$WASM_OUT" "$PDFJS_OUT"

cargo build --release --target wasm32-unknown-unknown -p document-extraction-wasm
wasm-bindgen \
  --target web \
  --no-typescript \
  --out-dir "$WASM_OUT" \
  --out-name document_extraction \
  "$TARGET_WASM"

cp "$PDFJS_DIR/build/pdf.mjs" "$PDFJS_OUT/pdf.mjs"
cp "$PDFJS_DIR/build/pdf.worker.mjs" "$PDFJS_OUT/pdf.worker.mjs"
