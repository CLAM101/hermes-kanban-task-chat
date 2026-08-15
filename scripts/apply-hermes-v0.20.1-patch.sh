#!/usr/bin/env bash
set -euo pipefail

EXPECTED_COMMIT="8b58f9f68f01a96f101366b6b9a98dbd341db301"
ROOT="${1:-}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PATCH="$SCRIPT_DIR/../patches/0001-feat-desktop-add-Kanban-task-action-contributions.patch"

if [[ -z "$ROOT" ]]; then
  printf 'Usage: %s /path/to/hermes-agent\n' "$0" >&2
  exit 2
fi

if [[ ! -e "$ROOT/.git" ]]; then
  printf 'Not a Hermes git checkout: %s\n' "$ROOT" >&2
  exit 2
fi

CURRENT="$(git -C "$ROOT" rev-parse HEAD)"
if [[ "$CURRENT" != "$EXPECTED_COMMIT" && "${HERMES_PATCH_ALLOW_UNPINNED:-0}" != "1" ]]; then
  printf 'Refusing unverified Hermes commit %s. Expected %s.\n' "$CURRENT" "$EXPECTED_COMMIT" >&2
  printf 'Set HERMES_PATCH_ALLOW_UNPINNED=1 only after a manual review and git apply --check.\n' >&2
  exit 4
fi

if git -C "$ROOT" apply --reverse --check "$PATCH" >/dev/null 2>&1; then
  printf 'Patch is already applied.\n'
  exit 0
fi

if [[ -n "$(git -C "$ROOT" status --porcelain)" ]]; then
  printf 'Refusing to patch a dirty checkout: %s\n' "$ROOT" >&2
  exit 3
fi

git -C "$ROOT" apply --check "$PATCH"
git -C "$ROOT" apply "$PATCH"
git -C "$ROOT" diff --check

printf 'Patch applied to %s. Build and test Desktop before replacing the installed app.\n' "$ROOT"
