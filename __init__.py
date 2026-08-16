"""Hermes Kanban task-chat plugin registration."""

from .tools import register_tools


def register(ctx) -> None:
    register_tools(ctx)
