#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON="${HERMES_PYTHON:-/usr/local/lib/hermes-agent/venv/bin/python}"
TEST_HOME="${TMPDIR:-/tmp}/hermes-task-chat-test-home"

node --check "$ROOT/desktop/plugin.js"
"$PYTHON" -m py_compile \
  "$ROOT/__init__.py" \
  "$ROOT/dashboard/plugin_api.py" \
  "$ROOT/tools.py" \
  "$ROOT/tests/integration_smoke.py"
HERMES_HOME="$TEST_HOME" hermes plugins doctor --ci "$ROOT"
node "$ROOT/tests/desktop_plugin_smoke.mjs"
HERMES_HOME="$TEST_HOME" "$PYTHON" "$ROOT/tests/integration_smoke.py"

if [[ -n "${HERMES_SOURCE:-}" ]]; then
  git -C "$HERMES_SOURCE" apply --check \
    "$ROOT/patches/0001-feat-desktop-add-Kanban-task-action-contributions.patch"
fi

printf 'ALL_TESTS_PASS\n'
