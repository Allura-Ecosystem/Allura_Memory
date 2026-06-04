#!/usr/bin/env python3
"""
Allura Governance — UserPromptSubmit context injection.
Fires whenever the prompt touches DB, memory, or agent work.
Injects the 6 non-negotiable invariants as always-on system context.
"""
import json
import re
import sys

DB_SIGNALS = re.compile(
    r"\b(database|db|sql|query|neo4j|postgres|memory|event|trace"
    r"|insert|write|update|delete|schema|migration"
    r"|curator|promote|group_id|brain|allura"
    r"|docker|mcp|agent|brooks|woz|scout)\b",
    re.IGNORECASE,
)

GOVERNANCE_RULES = (
    "Allura Governance — active invariants:\n"
    "1. group_id on every DB read/write  →  pattern ^allura-[a-z0-9-]+$\n"
    "2. PostgreSQL events are append-only  →  no UPDATE/DELETE on event/trace rows\n"
    "3. Neo4j versioning via SUPERSEDES  →  (v2)-[:SUPERSEDES]->(v1), never edit nodes\n"
    "4. HITL required for promotion  →  route through curator:approve, not autonomous\n"
    "5. DB ops via MCP_DOCKER tools only  →  never docker exec\n"
    "6. allura-* tenant namespace only  →  flag any roninclaw-* as drift"
)


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return 0

    prompt = str(payload.get("prompt") or "")

    if not DB_SIGNALS.search(prompt):
        return 0

    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "UserPromptSubmit",
            "additionalContext": GOVERNANCE_RULES,
        }
    }))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
