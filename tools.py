"""Operator-only mutation tool for Kanban task discussion sessions."""

from __future__ import annotations

import json
import os
from typing import Any

from fastapi import HTTPException
from plugins.kanban.dashboard import plugin_api as kanban_api
from tools.registry import tool_error

_MUTABLE_FIELDS = (
    "title",
    "body",
    "assignee",
    "priority",
    "status",
    "result",
    "block_reason",
    "summary",
    "metadata",
)


def _operator_available() -> bool:
    if os.environ.get("HERMES_KANBAN_TASK") or os.environ.get("HERMES_DELEGATED_CHILD_CONTEXT"):
        return False
    try:
        from agent.delegation_context import is_delegated_child_process_context

        return not is_delegated_child_process_context()
    except Exception:
        return True


def _handle_update(args: dict[str, Any], **_kwargs: Any) -> str:
    if not _operator_available():
        return tool_error("kanban_task_update is available only in operator sessions, not workers or delegated children")

    task_id = str(args.get("task_id") or "").strip()
    board = str(args.get("board") or "default").strip() or "default"
    if not task_id:
        return tool_error("task_id is required")

    changes = {field: args[field] for field in _MUTABLE_FIELDS if field in args}
    if not changes:
        return tool_error(f"at least one mutable field is required: {', '.join(_MUTABLE_FIELDS)}")

    try:
        payload = kanban_api.UpdateTaskBody(**changes)
        result = kanban_api.update_task(task_id, payload, board=board)
        task = result.get("task") if isinstance(result, dict) else None
        return json.dumps(
            {
                "ok": True,
                "board": board,
                "task_id": task_id,
                "changed_fields": list(changes),
                "task": task,
            },
            ensure_ascii=False,
        )
    except HTTPException as exc:
        return tool_error(f"kanban_task_update: {exc.detail}", status_code=exc.status_code)
    except (TypeError, ValueError, RuntimeError, PermissionError) as exc:
        return tool_error(f"kanban_task_update: {exc}")
    except Exception as exc:
        return tool_error(f"kanban_task_update failed: {type(exc).__name__}: {exc}")


_SCHEMA = {
    "type": "function",
    "function": {
        "name": "kanban_task_update",
        "description": (
            "Update editable fields on an existing Hermes Kanban task from an operator discussion. "
            "Re-read the task first, pass the exact board and task_id, and change only fields the operator explicitly requested. "
            "Use the existing kanban_comment/block/unblock/link/create tools for those dedicated operations."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "board": {
                    "type": "string",
                    "description": "Exact board slug. Defaults to default when omitted.",
                },
                "task_id": {"type": "string", "description": "Exact existing task id."},
                "title": {"type": "string", "description": "Replacement title; cannot be empty."},
                "body": {"type": "string", "description": "Replacement task body; empty string clears it."},
                "assignee": {
                    "type": "string",
                    "description": "Replacement assignee profile; empty string clears assignment.",
                },
                "priority": {"type": "integer", "description": "Replacement integer priority."},
                "status": {
                    "type": "string",
                    "enum": ["triage", "todo", "ready", "review", "blocked", "scheduled", "done", "archived"],
                    "description": "Workflow-safe destination. Running is dispatcher-owned and cannot be set directly.",
                },
                "result": {"type": "string", "description": "Completion result when moving to done."},
                "block_reason": {"type": "string", "description": "Reason when moving to blocked or scheduled."},
                "summary": {"type": "string", "description": "Handoff/review/completion summary for transitions that accept one."},
                "metadata": {"type": "object", "description": "Structured handoff metadata."},
            },
            "required": ["task_id"],
            "additionalProperties": False,
        },
    },
}


def register_tools(ctx) -> None:
    ctx.register_tool(
        name="kanban_task_update",
        toolset="kanban-task-chat",
        schema=_SCHEMA,
        handler=_handle_update,
        check_fn=_operator_available,
        description=_SCHEMA["function"]["description"],
        emoji="💬",
    )
