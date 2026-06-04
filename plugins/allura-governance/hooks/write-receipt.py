#!/usr/bin/env python3
"""
Allura Governance — PostToolCall write receipt.
Injects a receipt reminder after any substantive memory or DB write,
prompting the agent to log the outcome to Allura Brain before closing.
"""
import json
import re
import sys

WRITE_TOOLS = re.compile(
    r"(memory_add|memory_update|memory_promote|memory_delete"
    r"|insert_data|execute_sql|create_entities|create_relations|add_observations"
    r"|Write|write_file"
    r"|allura-brain__memory_add|allura-brain__memory_update|allura-brain__memory_promote"
    r"|mcp__MCP_DOCKER__insert_data|mcp__MCP_DOCKER__execute_sql"
    r"|mcp__MCP_DOCKER__create_entities)",
    re.IGNORECASE,
)


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return 0

    tool_name = str(payload.get("tool_name") or payload.get("tool") or "")

    if not WRITE_TOOLS.search(tool_name):
        return 0

    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PostToolCall",
            "additionalContext": (
                f"[Allura Governance] Write receipt required for `{tool_name}`.\n"
                "Before closing this session:\n"
                "  1. Confirm group_id was present on the write.\n"
                "  2. Log an outcome receipt to Allura Brain (memory_add with event_type=RECEIPT).\n"
                "  3. If this was a promotion, verify curator approval trail exists.\n"
                "Append-only rule: do not edit or delete what was just written."
            ),
        }
    }))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
