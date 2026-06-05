# allura-governance Plugin

> Hard enforcement of Allura's 6 non-negotiable invariants on every tool call.

## Purpose

The `allura-governance` plugin blocks invariant violations before they reach the database or knowledge graph. It runs on **every tool call** in both Claude Code and Codex, making governance enforcement automatic rather than policy-dependent.

## The 6 Invariants

| # | Invariant | Hook | Action |
|---|-----------|------|--------|
| 1 | `group_id` on every DB read/write | `preToolCall` | BLOCK if missing |
| 2 | PostgreSQL events are append-only | `preToolCall` | BLOCK UPDATE/DELETE on `events`/`traces` |
| 3 | Neo4j versioning via `SUPERSEDES` | `preToolCall` | BLOCK direct node mutation |
| 4 | HITL required for promotion | `preToolCall` | BLOCK `memory_promote` without `curator_approved` |
| 5 | DB ops via MCP_DOCKER tools only | `preToolCall` | BLOCK `docker exec` |
| 6 | `allura-*` tenant namespace | `preToolCall` | BLOCK `roninclaw-*` group_ids |

## What It Injects

| Trigger | Hook | Output |
|---------|------|--------|
| Prompt contains DB/memory/agent keywords | `userPromptSubmit` | Governance rules as context |
| Any memory or DB write tool completes | `postToolCall` | Write receipt reminder |

## Runtime Support

| Runtime | Status | Install Path |
|---------|--------|--------------|
| Claude Code | ✅ Supported | `.claude-plugin/plugin.json` |
| Codex | ✅ Supported | `.codex-plugin/plugin.json` |

## Hook Files

```
plugins/allura-governance/hooks/
├── hooks.json                # Hook event wiring manifest
├── governance-preflight.py   # PreToolCall — blocks invariant violations
├── write-receipt.py         # PostToolCall — receipt injection after writes
└── governance-context.py    # UserPromptSubmit — always-on context injection
```

## Installation

```bash
# Claude Code
claude plugin install ./plugins/allura-governance

# Codex
codex plugin install ./plugins/allura-governance
```

## Validation

```bash
# If validate_plugin.py exists
python3 plugins/allura-governance/scripts/validate_plugin.py plugins/allura-governance
```

## Configuration

No runtime configuration required. The plugin reads invariants from:

1. Hardcoded rules in `governance-preflight.py`
2. `CLAUDE.md` / `.opencode/` context files (for context injection)
3. `docs/allura/RISKS-AND-DECISIONS.md` (for risk awareness)

## Blocking Behavior

When a violation is detected:

1. Tool call is **blocked** before execution
2. Agent receives **clear error message** with the violated invariant
3. **Audit record** is written to PostgreSQL events table
4. Agent is **prompted to correct** the call

## Context Injection

When prompts contain keywords like "database", "memory", "Neo4j", "PostgreSQL", "promote", or "curator":

1. Governance rules are **prepended** to the prompt context
2. Agent sees the 6 invariants before responding
3. This reduces violations by making rules visible, not just enforceable

## Write Receipts

After any memory or DB write tool completes:

1. Plugin **reminds** the agent to write a receipt
2. Receipt format: `memory_add` with outcome summary
3. This creates an **audit trail** of what was done and why

## See Also

- [`catalog/gates.md`](../../catalog/gates.md) — Public governance gates reference
- [`docs/allura/RISKS-AND-DECISIONS.md`](../allura/RISKS-AND-DECISIONS.md) — Canonical risk register
- [`docs/user-guide/troubleshooting.md`](../user-guide/troubleshooting.md) — If governance plugin is not blocking

---

*Implementation: [`plugins/allura-governance/`](../../plugins/allura-governance/). For the canonical invariants, see [`CLAUDE.md`](../../CLAUDE.md).*
