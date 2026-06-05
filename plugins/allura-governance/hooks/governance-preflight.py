#!/usr/bin/env python3
"""
Allura Governance — PreToolCall enforcement.
Blocks the 5 non-negotiable invariants before any tool call executes.

Invariants enforced:
1. No docker exec  — use mcp__MCP_DOCKER__* tools only
2. Append-only events — no UPDATE/DELETE on events/traces tables
3. Neo4j SUPERSEDES — no direct node mutation without versioning
4. HITL for promotion — memory_promote requires curator_approved flag
5. group_id required — all DB queries must include group_id
"""
import json
import re
import sys

# ── Pattern library ────────────────────────────────────────────────────────────

DOCKER_EXEC = re.compile(r"docker\s+exec\b", re.IGNORECASE)

APPEND_ONLY_VIOLATION = re.compile(
    r"\b(UPDATE|DELETE)\b[^;]*\b(events|traces|event_log)\b",
    re.IGNORECASE | re.DOTALL,
)

# Matches direct SET/REMOVE/DELETE on a node var — without SUPERSEDES in the query
NEO4J_MUTATION_OPS = re.compile(
    r"\b(SET\s+\w+\.\w+|REMOVE\s+\w+:\w+|DELETE\s+\w+)\b",
    re.IGNORECASE,
)

# group_id check: SELECT/INSERT/UPDATE/DELETE without group_id anywhere in query
MISSING_GROUP_ID = re.compile(
    r"\b(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\b(?:(?!group_id).)*$",
    re.IGNORECASE | re.DOTALL,
)

BASH_TOOLS = {"Bash", "bash", "shell", "run_command", "computer"}
SQL_TOOL_HINTS = {
    "execute_sql",
    "query_database",
    "insert_data",
    "MCP_DOCKER_execute_sql",
    "MCP_DOCKER_query_database",
    "mcp__MCP_DOCKER__execute_sql",
    "mcp__MCP_DOCKER__query_database",
}
NEO4J_WRITE_TOOLS = {
    "create_entities", "create_relations", "add_observations",
    "mcp__MCP_DOCKER__create_entities", "mcp__MCP_DOCKER__add_observations",
}
PROMOTE_TOOLS = {"memory_promote", "allura-brain__memory_promote"}


# ── Checkers ───────────────────────────────────────────────────────────────────

def check_bash(tool_input: dict) -> tuple[bool, str]:
    cmd = str(tool_input.get("command") or tool_input.get("cmd") or "")

    if DOCKER_EXEC.search(cmd):
        return True, (
            "BLOCKED — `docker exec` is banned.\n"
            "Use mcp__MCP_DOCKER__* tools for all DB operations.\n"
            "Reference: .claude/rules/mcp-integration.md"
        )

    if APPEND_ONLY_VIOLATION.search(cmd):
        return True, (
            "BLOCKED — UPDATE/DELETE on events/traces is banned.\n"
            "PostgreSQL event traces are append-only. Never mutate historical rows.\n"
            "Reference: .claude/rules/postgres-best-practices.md"
        )

    return False, ""


def check_sql(tool_input: dict) -> tuple[bool, str]:
    query = str(
        tool_input.get("query") or tool_input.get("sql") or
        tool_input.get("statement") or ""
    )
    if not query:
        return False, ""

    if APPEND_ONLY_VIOLATION.search(query):
        return True, (
            "BLOCKED — UPDATE/DELETE on events/traces is banned.\n"
            "PostgreSQL event traces are append-only.\n"
            "Reference: .claude/rules/postgres-best-practices.md"
        )

    # Only warn on missing group_id for non-trivial queries
    if MISSING_GROUP_ID.search(query) and "group_id" not in query.lower():
        return True, (
            "BLOCKED — group_id missing from DB query.\n"
            "Every read/write must filter by group_id (pattern: allura-[a-z0-9-]+).\n"
            "Reference: .claude/rules/postgres-best-practices.md"
        )

    return False, ""


def is_sql_tool(tool_name: str, tool_input: dict) -> bool:
    """Return true only for actual SQL/DB tools or SQL-looking payloads.

    Claude Code discovery tools such as ToolSearch can carry a `query` field,
    but that query is natural-language tool discovery, not a database read.
    Blocking those calls prevents agents from discovering the very tools needed
    to form valid scoped DB calls.
    """
    lowered = tool_name.lower()
    if tool_name in SQL_TOOL_HINTS:
        return True
    if any(hint.lower() in lowered for hint in SQL_TOOL_HINTS):
        return True

    query = str(
        tool_input.get("query") or tool_input.get("sql") or
        tool_input.get("statement") or ""
    ).lstrip()
    return bool(re.match(r"^(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\b", query, re.IGNORECASE))


def check_neo4j_write(tool_name: str, tool_input: dict) -> tuple[bool, str]:
    if tool_name not in NEO4J_WRITE_TOOLS:
        return False, ""

    cypher = str(
        tool_input.get("query") or tool_input.get("cypher") or
        tool_input.get("statement") or ""
    )
    if not cypher:
        return False, ""

    if NEO4J_MUTATION_OPS.search(cypher) and "SUPERSEDES" not in cypher.upper():
        return True, (
            "BLOCKED — Direct Neo4j node mutation without SUPERSEDES versioning.\n"
            "All updates must create a new node and link: (v2)-[:SUPERSEDES]->(v1).\n"
            "Reference: .claude/rules/neo4j-best-practices.md"
        )

    return False, ""


def check_promote(tool_name: str, tool_input: dict) -> tuple[bool, str]:
    if tool_name not in PROMOTE_TOOLS:
        return False, ""

    if not tool_input.get("curator_approved"):
        return True, (
            "BLOCKED — memory_promote requires HITL curator approval.\n"
            "Agents cannot autonomously promote to Neo4j.\n"
            "Run: bun run curator:approve  then retry with curator_approved=true.\n"
            "Reference: CLAUDE.md § Non-Negotiable Invariants"
        )

    return False, ""


def check_group_id_drift(tool_name: str, tool_input: dict) -> tuple[bool, str]:
    """Flag deprecated roninclaw-* group_ids."""
    raw = json.dumps(tool_input)
    if re.search(r"roninclaw-", raw):
        return True, (
            "BLOCKED — Deprecated `roninclaw-*` group_id detected.\n"
            "Use `allura-*` namespace only.\n"
            "Reference: CLAUDE.md § Non-Negotiable Invariants"
        )
    return False, ""


# ── Main ───────────────────────────────────────────────────────────────────────

def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return 0

    tool_name = str(payload.get("tool_name") or payload.get("tool") or "")
    tool_input: dict = payload.get("tool_input") or payload.get("input") or {}

    checks = []

    if tool_name in BASH_TOOLS:
        checks.append(check_bash(tool_input))

    if is_sql_tool(tool_name, tool_input):
        checks.append(check_sql(tool_input))
    checks.append(check_neo4j_write(tool_name, tool_input))
    checks.append(check_promote(tool_name, tool_input))
    checks.append(check_group_id_drift(tool_name, tool_input))

    for blocked, reason in checks:
        if blocked:
            print(json.dumps({"decision": "block", "reason": reason}))
            return 0

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
