# allura-scout Plugin

> Low-token context discovery for Allura workflows.

## Purpose

The `allura-scout` plugin helps agents avoid expensive, unfocused context loading.
It searches relevant files and Allura memory, then returns a compact
`ContextPacket` for the next agent.

**What it does not do:** implement work, approve decisions, or mutate state.
**What it does do:** reduce token cost, context drift, stale memory reuse, and duplicate research.

## Runtime Support

| Runtime | Status | Install Path |
|---------|--------|--------------|
| Claude Code | Supported | `.claude-plugin/plugin.json` |
| Codex | Supported | `.codex-plugin/plugin.json` |
| OpenCode | Planned | `.opencode-plugin/` (future) |

## Command

### scout-context

Create a compact context packet before planning, building, reviewing, or handing off work.

**What happens:**

1. Restate the user goal.
2. Search Allura memory for decisions, blockers, and outcomes.
3. Inspect only likely files.
4. Include every file or memory with a reason.
5. Flag stale, conflicting, or untrusted context.
6. Recommend next route.

## ContextPacket

Schema: [`plugins/allura-scout/schemas/context-packet.schema.json`](../../plugins/allura-scout/schemas/context-packet.schema.json)

Required fields:

- `goal`
- `summary`
- `token_budget`
- `recommended_route`

Optional fields:

- `relevant_files`
- `relevant_memories`
- `decisions`
- `risks`

## Token Budget Defaults

| Budget | Value |
|--------|-------|
| Target | 5,000 context tokens |
| Hard limit | 8,000 context tokens |

The agent may exceed the hard limit only after explicit user approval.

## Installation

```bash
# Claude Code
claude plugin install ./plugins/allura-scout

# Codex
codex plugin install ./plugins/allura-scout
```

## Validation

```bash
python3 plugins/allura-scout/scripts/validate_plugin.py plugins/allura-scout
```

## See Also

- [`catalog/plugins.md`](../../catalog/plugins.md) — public plugin index
- [`library/README.md`](../../library/README.md) — workflow chooser
- [`docs/reference/mcp-tools.md`](../reference/mcp-tools.md) — MCP memory tools
