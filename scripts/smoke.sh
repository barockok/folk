#!/usr/bin/env bash
# Smoke runner — orchestrates the workflow described in docs/how-to-smoke.md.
#
#   1. Rebuild better-sqlite3 against system Node so vitest can load it.
#   2. Run the vitest unit suite (46 tests across 4 files).
#   3. Rebuild better-sqlite3 against Electron for the dev/build runtime.
#   4. Build the Electron bundle (out/main, out/renderer).
#   5. Run the Playwright Electron smoke spec at tests/e2e/smoke.spec.ts.
#
# Usage:
#   npm run smoke            # full pipeline
#   npm run smoke:unit       # just step 1+2 (and step 3 to restore)
#   npm run smoke:e2e        # just step 4+5 (skips unit tests)
#
# Requires: npm install + `npx playwright install chromium` (the Playwright
# Electron driver bundles Chromium even though we never launch a browser —
# the install ensures the driver binary is fetched).

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

MODE="${1:-full}"

step() { printf '\n\033[1;35m▸ %s\033[0m\n' "$1"; }

run_unit() {
  step "rebuild better-sqlite3 (system Node)"
  npm rebuild better-sqlite3

  step "vitest run"
  npx vitest run
}

restore_electron_binding() {
  step "rebuild better-sqlite3 (Electron) — restore"
  local elec_ver
  elec_ver="$(npx --no-install electron --version 2>/dev/null | sed 's/^v//')"
  if [[ -z "$elec_ver" ]]; then
    echo "could not detect electron version" >&2
    exit 3
  fi
  npx @electron/rebuild -w better-sqlite3 --version "$elec_ver" --build-from-source

  # @electron/rebuild drops the ABI-tagged binary at
  # node_modules/better-sqlite3/bin/<platform>-<arch>-<abi>/better-sqlite3.node,
  # but better-sqlite3's runtime loader uses `bindings` which only searches
  # build/Release. After `npm rebuild` (system Node) the build/Release file is
  # the wrong ABI, so we must copy the Electron-built one back into place.
  local elec_abi
  elec_abi="$(ELECTRON_RUN_AS_NODE=1 npx --no-install electron -e 'process.stdout.write(process.versions.modules)')"
  local platform_arch
  platform_arch="$(node -p 'process.platform + "-" + process.arch')"
  local src="node_modules/better-sqlite3/bin/${platform_arch}-${elec_abi}/better-sqlite3.node"
  local dst="node_modules/better-sqlite3/build/Release/better_sqlite3.node"
  if [[ -f "$src" ]]; then
    cp "$src" "$dst"
    echo "  · synced $src → $dst (ABI $elec_abi)"
  else
    echo "  · warning: expected $src after rebuild, not found" >&2
  fi
}

run_e2e() {
  step "electron-vite build"
  npm run build

  step "playwright (electron) smoke"
  npx playwright test --config tests/e2e/playwright.config.ts
}

case "$MODE" in
  unit)
    run_unit
    restore_electron_binding
    ;;
  e2e)
    restore_electron_binding
    run_e2e
    ;;
  full)
    run_unit
    restore_electron_binding
    run_e2e
    ;;
  *)
    echo "unknown mode: $MODE  (expected: full | unit | e2e)" >&2
    exit 2
    ;;
esac

step "smoke complete"
