#!/usr/bin/env bash
# Build the wasm module + JS bindings into pkg/.
set -euo pipefail
cd "$(dirname "$0")"
source "$HOME/.cargo/env"

cargo build --release --target wasm32-unknown-unknown

# Main-thread binding (ES module), used by host.js / wt-shim.js.
wasm-bindgen --target web --out-dir pkg \
  target/wasm32-unknown-unknown/release/blox_wt.wasm

# Worker-realm binding (classic / no-modules). The engine builds its WebTransport
# inside a classic em-pthread worker, so host.js injects a classic copy of
# blox-wt there. The bundle = no-modules binding + js/worker-shim.js (the shim
# captures the binding's `wasm_bindgen` by closure). Reuses pkg/blox_wt_bg.wasm
# (identical bytes across targets).
wasm-bindgen --target no-modules --out-dir pkg-nomodules \
  target/wasm32-unknown-unknown/release/blox_wt.wasm
cat pkg-nomodules/blox_wt.js js/worker-shim.js > blox-wt-worker.js

ls -la pkg/ blox-wt-worker.js
echo "OK: pkg/blox_wt.js + pkg/blox_wt_bg.wasm + blox-wt-worker.js"
