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
  npx @electron/rebuild -w better-sqlite3 --build-from-source
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
