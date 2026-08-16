"""Real Kanban DB integration smoke test for the plugin backend and tool."""

from __future__ import annotations

import importlib.util
import json
import os
from pathlib import Path
import shutil

PLUGIN = Path(__file__).resolve().parents[1]
HOME = Path(os.environ.get("HERMES_HOME", "/tmp/hermes-task-chat-integration"))


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main() -> None:
    if HOME == Path.home() / ".hermes":
        raise RuntimeError("refusing to run integration smoke test against the live Hermes home")
    shutil.rmtree(HOME, ignore_errors=True)
    HOME.mkdir(parents=True)
    os.environ["HERMES_HOME"] = str(HOME)
    # The integration subprocess may inherit orchestration markers from its
    # caller. This disposable-home test is intentionally an operator context;
    # the worker-denial case is re-enabled explicitly below.
    os.environ.pop("HERMES_DELEGATED_CHILD_CONTEXT", None)
    os.environ.pop("HERMES_KANBAN_TASK", None)

    from hermes_cli import kanban_db

    api = load_module("task_chat_plugin_api_test", PLUGIN / "dashboard/plugin_api.py")
    task_tools = load_module("task_chat_tools_test", PLUGIN / "tools.py")

    conn = kanban_db.connect(board="default")
    try:
        task_id = kanban_db.create_task(
            conn,
            title="Investigate partner report",
            body="Compare the latest attributed totals.",
            assignee="default",
            created_by="integration-test",
            triage=True,
            board="default",
        )
        kanban_db.add_comment(conn, task_id, "darren", "Check the source attribution.")
        kanban_db.add_attachment(
            conn,
            task_id,
            filename="evidence.csv",
            stored_path="/tmp/secret/path/evidence.csv",
            content_type="text/csv",
            size=123,
            uploaded_by="integration-test",
        )
    finally:
        conn.close()

    packet = api.task_context(task_id, board="default")
    serialized = json.dumps(packet, ensure_ascii=False)
    assert packet["context"]["board"] == "default"
    assert packet["context"]["task"]["id"] == task_id
    assert packet["context"]["comments"][-1]["body"] == "Check the source attribution."
    assert packet["context"]["attachments"][-1]["filename"] == "evidence.csv"
    assert "# Kanban task" in packet["context"]["canonical_worker_context"]
    assert "/tmp/secret/path" not in serialized
    assert "dedicated operator discussion" in packet["message"]

    result = json.loads(
        task_tools._handle_update(
            {
                "board": "default",
                "task_id": task_id,
                "title": "Investigate attributed partner report",
                "body": "Compare the latest attributed totals and explain the change.",
                "priority": 4,
            }
        )
    )
    assert result["ok"] is True

    conn = kanban_db.connect(board="default")
    try:
        updated = kanban_db.get_task(conn, task_id)
        assert updated is not None
        assert updated.title == "Investigate attributed partner report"
        assert updated.priority == 4
    finally:
        conn.close()

    os.environ["HERMES_KANBAN_TASK"] = "worker-owned-task"
    denied = task_tools._handle_update(
        {"board": "default", "task_id": task_id, "title": "must not apply"}
    )
    assert "operator sessions" in denied
    conn = kanban_db.connect(board="default")
    try:
        unchanged = kanban_db.get_task(conn, task_id)
        assert unchanged is not None and unchanged.title == "Investigate attributed partner report"
    finally:
        conn.close()

    print(
        json.dumps(
            {
                "status": "PASS",
                "task_id": task_id,
                "context_fingerprint_chars": len(packet["fingerprint"]),
                "stored_path_redacted": True,
                "operator_update_verified": True,
                "worker_write_denied": True,
            }
        )
    )


if __name__ == "__main__":
    main()
