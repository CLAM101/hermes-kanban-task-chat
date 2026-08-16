# Hermes Kanban Task Chat

Open a persistent, context-rich operator discussion directly from a Hermes Kanban card.

> Compatibility: the included Desktop patch is pinned to **Hermes Agent v0.20.1 (2026.8.13)** at commit `8b58f9f68f01a96f101366b6b9a98dbd341db301`.

## What it does

- Adds a **Discuss task** button to each built-in Kanban card.
- Adds **Discuss task** and **Start new task discussion** to the card and drawer menus.
- Maintains one discussion session per `profile + board + task`.
- Creates the session on first use and resumes it later.
- Replaces the mapping only when Hermes confirms that the stored session was deleted.
- Injects a bounded context refresh when the card changes.
- Keeps operator discussions separate from dispatched worker sessions.
- Provides `kanban_task_update` for explicit operator edits to title, body, assignee, priority, and workflow-safe statuses.
- Reuses the existing Kanban tools for comments, blocking, unblocking, linking, and related task creation.

Opening a discussion never changes the card. Writes require an explicit request inside the discussion.

## Why a Desktop patch is included

Hermes Desktop v0.20.1 has no supported external contribution point inside its built-in Kanban cards. The plugin handles all discussion behaviour; the small core patch only adds a generic `kanban.task.actions` contract and renders native controls in the card and drawer.

Patch: [`patches/0001-feat-desktop-add-Kanban-task-action-contributions.patch`](patches/0001-feat-desktop-add-Kanban-task-action-contributions.patch)

## Installation topology

A unified plugin has two halves:

1. `desktop/plugin.js` runs on the computer running Hermes Desktop.
2. `dashboard/plugin_api.py` and `tools.py` run in the gateway profile.

When Desktop connects to a remote gateway, install the repository on **both machines**. The remote VPS plugin folder cannot provide Desktop UI to the local Electron app.

## Install the plugin

On the gateway host and on the Desktop host, target the appropriate Hermes profile:

```bash
hermes plugins install CLAM101/hermes-kanban-task-chat
hermes plugins enable hermes-kanban-task-chat
```

The Python half is controlled by `plugins.enabled` in the gateway profile. The Desktop half is separately controlled in **Settings → Plugins** on the Desktop host. Enable **Kanban task chat** there and use **Reload desktop plugins** if the app is already open.

## Apply the v0.20.1 Desktop patch

Use a clean Hermes source checkout at the pinned commit. The helper refuses unknown commits by default:

```bash
./scripts/apply-hermes-v0.20.1-patch.sh /path/to/hermes-agent
```

Then build Desktop using the repository's normal pinned dependency path:

```bash
cd /path/to/hermes-agent
npm ci
cd apps/desktop
npm run typecheck
npx vitest run --project ui src/plugins/kanban/task-actions.test.ts
npm run build
```

Package or launch the built app using the same method used for your existing Desktop installation. Restart/reload Desktop only after the build succeeds.

### Revert

From the same clean source checkout:

```bash
git apply -R /path/to/hermes-kanban-task-chat/patches/0001-feat-desktop-add-Kanban-task-action-contributions.patch
```

Disable or remove the plugin separately if desired:

```bash
hermes plugins disable hermes-kanban-task-chat
hermes plugins remove hermes-kanban-task-chat
```

## Verification

Run from this repository:

```bash
./scripts/test.sh
```

The test runner performs:

- Hermes Plugin Doctor against a disposable profile.
- JavaScript and Python syntax compilation.
- Desktop session-logic smoke tests for create, resume, refresh, deleted-session replacement, and fresh discussion.
- A real temporary Kanban database test proving bounded context, path redaction, operator updates, and worker write denial.
- `git apply --check` against the exact v0.20.1 source commit when that checkout is supplied through `HERMES_SOURCE`.

## Current limitation

This repository cannot install or visually verify the patch on a different computer. Source build and automated behaviour are verified; final visual verification must run on the machine hosting Hermes Desktop.
