#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WASM_OUT="$ROOT/apps/web/public/wasm"
PDFJS_OUT="$ROOT/apps/web/public/pdfjs"
TARGET_WASM="$ROOT/target/wasm32-unknown-unknown/release/document_extraction_wasm.wasm"
SETTINGS_OUT="$ROOT/apps/web/public/vendor/settings"
SETTINGS_BROWSER_DIST_COMMIT="1a268c485380eafb4e233a24c5803db4ff1f9ed0"
SETTINGS_SOURCE_COMMIT="4aff7dc2dbfcae0e245269bd3fe50f6afb8e19e8"
SETTINGS_RAW_BASE="https://raw.githubusercontent.com/moritzbrantner/settings/${SETTINGS_BROWSER_DIST_COMMIT}"

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

rm -rf "$WASM_OUT" "$PDFJS_OUT" "$SETTINGS_OUT"
mkdir -p "$WASM_OUT" "$PDFJS_OUT" "$SETTINGS_OUT/pkg"

cargo build --release --target wasm32-unknown-unknown -p document-extraction-wasm
wasm-bindgen \
  --target web \
  --no-typescript \
  --out-dir "$WASM_OUT" \
  --out-name document_extraction \
  "$TARGET_WASM"

cp "$PDFJS_DIR/build/pdf.mjs" "$PDFJS_OUT/pdf.mjs"
cp "$PDFJS_DIR/build/pdf.worker.mjs" "$PDFJS_OUT/pdf.worker.mjs"


curl --proto '=https' --tlsv1.2 -fsSL \
  "$SETTINGS_RAW_BASE/settings-browser.js" \
  -o "$SETTINGS_OUT/settings-browser.js"
curl --proto '=https' --tlsv1.2 -fsSL \
  "$SETTINGS_RAW_BASE/pkg/settings_wasm.js" \
  -o "$SETTINGS_OUT/pkg/settings_wasm.js"
curl --proto '=https' --tlsv1.2 -fsSL \
  "$SETTINGS_RAW_BASE/pkg/settings_wasm_bg.wasm" \
  -o "$SETTINGS_OUT/pkg/settings_wasm_bg.wasm"
curl --proto '=https' --tlsv1.2 -fsSL \
  "$SETTINGS_RAW_BASE/SOURCE_SHA" \
  -o "$SETTINGS_OUT/SOURCE_SHA"

if [[ "$(tr -d '\r\n' < "$SETTINGS_OUT/SOURCE_SHA")" != "$SETTINGS_SOURCE_COMMIT" ]]; then
  echo "Pinned settings browser distribution does not match expected source revision." >&2
  exit 1
fi

cat > "$SETTINGS_OUT/bridge.js" <<'EOF'
try {
  const settings = await import("./settings-browser.js");
  window.__speedreaderSettingsBrowser = settings;
} catch (error) {
  window.__speedreaderSettingsBrowserError =
    error instanceof Error ? error.message : String(error);
} finally {
  window.dispatchEvent(new CustomEvent("speedreader-settings-browser-ready"));
}
EOF

test -s "$SETTINGS_OUT/settings-browser.js"
test -s "$SETTINGS_OUT/pkg/settings_wasm.js"
test -s "$SETTINGS_OUT/pkg/settings_wasm_bg.wasm"
test -s "$SETTINGS_OUT/SOURCE_SHA"
test -s "$SETTINGS_OUT/bridge.js"
