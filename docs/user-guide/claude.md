# Claude Code Setup

> Connect Allura Memory to Claude Code for governed memory operations.

## Installation

### 1. Install Allura MCP Server

Add to your Claude Desktop config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "allura": {
      "command": "bun",
      "args": [
        "/absolute/path/to/Allura_Memory/src/mcp/memory-server-canonical.ts"
      ]
    }
  }
}
```

> **Note:** Use the absolute path to the repository. Claude Desktop does not resolve relative paths.

### 2. Install Allura Plugins (Optional but Recommended)

```bash
# Governance plugin — enforces invariants on every tool call
claude plugin install ./plugins/allura-governance

# Cowork plugin — shared handoff protocol with Codex
claude plugin install ./plugins/allura-cowork
```

### 3. Restart Claude

Quit and reopen Claude Desktop to load the new MCP server.

## Verification

In Claude Code, ask:

```
List your available tools.
```

You should see Allura memory tools:
- `memory_add`
- `memory_search`
- `memory_get`
- `memory_list`
- `memory_delete`

## First Memory in Claude

```
Store a memory: "I prefer dark mode interfaces" with group_id "allura-claude-test" and user_id "me".
```

Claude will call:
```typescript
memory_add({
  group_id: "allura-claude-test",
  user_id: "me",
  content: "I prefer dark mode interfaces",
  metadata: { source: "conversation" }
})
```

Then verify:
```
Search my memories for "dark mode".
```

## Governance Rules in Claude

With `allura-governance` installed, Claude will:

1. **Block** `docker exec` commands
2. **Block** UPDATE/DELETE on PostgreSQL trace tables
3. **Block** direct Neo4j node mutation without `SUPERSEDES`
4. **Block** `memory_promote` without `curator_approved`
5. **Block** queries missing `group_id`
6. **Flag** deprecated `roninclaw-*` group_ids

## Cowork Protocol

With `allura-cowork` installed, Claude can:

1. `cowork-start` — hydrate project and memory context
2. `cowork-handoff` — create structured packet for Codex
3. `cowork-validate` — check claims before calling work done
4. `cowork-close` — write outcome summary

See [cowork.md](cowork.md) for the full Claude ↔ Codex handoff protocol.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Tools not appearing | Check absolute path in config; restart Claude |
| `bun: command not found` | Ensure Bun is in PATH or use full path to `bun` binary |
| Permission errors | Check file permissions on `src/mcp/memory-server-canonical.ts` |
| Plugin install fails | Run `claude plugin install` from repo root |

---

*For the full adapter catalog, see [`catalog/adapters.md`](../../catalog/adapters.md). For plugin details, see [`catalog/plugins.md`](../../catalog/plugins.md).*
