# allura-governance

Hard enforcement of Allura's 6 non-negotiable invariants. Runs on every tool call in both Claude Code and Codex.

## What it blocks

| Invariant | Hook | Action |
|-----------|------|--------|
| `docker exec` in any bash command | PreToolCall | BLOCK |
| UPDATE/DELETE on `events`/`traces` tables | PreToolCall | BLOCK |
| Neo4j node mutation without `SUPERSEDES` | PreToolCall | BLOCK |
| `memory_promote` without `curator_approved` | PreToolCall | BLOCK |
| `group_id` missing from DB query | PreToolCall | BLOCK |
| `roninclaw-*` group_id (deprecated namespace) | PreToolCall | BLOCK |

## What it injects

| Trigger | Hook | Output |
|---------|------|--------|
| Prompt contains DB/memory/agent keywords | UserPromptSubmit | Governance rules as context |
| Any memory or DB write tool completes | PostToolCall | Write receipt reminder |

## Hook files

```
hooks/
├── hooks.json                # Hook event wiring
├── governance-preflight.py  # PreToolCall — blocks invariant violations
├── write-receipt.py         # PostToolCall — receipt injection after writes
└── governance-context.py    # UserPromptSubmit — always-on context injection
```

## Installation

**Claude Code:**
```bash
# From allura-memory root
claude plugin install ./plugins/allura-governance
```

**Codex:**
```bash
codex plugin install ./plugins/allura-governance
```

## The 6 invariants (from CLAUDE.md)

1. `group_id` on every DB read/write — pattern `^allura-[a-z0-9-]+$`
2. PostgreSQL events are append-only — no UPDATE/DELETE on trace rows
3. Neo4j versioning via SUPERSEDES — never edit existing nodes
4. HITL required for promotion — route through `curator:approve`
5. DB ops via MCP_DOCKER tools only — never `docker exec`
6. `allura-*` tenant namespace — flag any `roninclaw-*` as drift
