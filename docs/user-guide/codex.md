# Codex Setup

> Connect Allura Memory to Codex for governed memory operations.

## Installation

### 1. Install Allura MCP Server

Codex uses `.codex/mcp.json` for MCP configuration:

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

> **Note:** Use the absolute path to the repository.

### 2. Install Allura Plugins (Optional but Recommended)

```bash
# Core Allura plugin (skills + assets)
codex plugin install ./plugins/allura

# Governance plugin — enforces invariants on every tool call
codex plugin install ./plugins/allura-governance

# Cowork plugin — shared handoff protocol with Claude
codex plugin install ./plugins/allura-cowork

# Extended capabilities
codex plugin install ./plugins/superpowers
```

### 3. Restart Codex

Reload the Codex window or restart the extension to load the MCP server.

## Verification

In Codex, ask:

```
What tools do you have available?
```

You should see Allura memory tools in the list.

## First Memory in Codex

```
Add a memory: "I work best in the morning" with group_id "allura-codex-test" and user_id "me".
```

Codex will call:
```typescript
memory_add({
  group_id: "allura-codex-test",
  user_id: "me",
  content: "I work best in the morning",
  metadata: { source: "conversation" }
})
```

Then verify:
```
Search my memories for "morning".
```

## Governance Rules in Codex

With `allura-governance` installed, Codex will:

1. **Block** `docker exec` commands
2. **Block** UPDATE/DELETE on PostgreSQL trace tables
3. **Block** direct Neo4j node mutation without `SUPERSEDES`
4. **Block** `memory_promote` without `curator_approved`
5. **Block** queries missing `group_id`
6. **Flag** deprecated `roninclaw-*` group_ids

## Cowork Protocol

With `allura-cowork` installed, Codex can:

1. Receive handoff packets from Claude via `cowork-handoff`
2. Validate claims before execution via `cowork-validate`
3. Write outcome receipts via `cowork-close`

See [cowork.md](cowork.md) for the full Claude ↔ Codex handoff protocol.

## Plugin Development

Codex plugins use the `.codex-plugin/` directory structure:

```
plugins/<name>/
├── .codex-plugin/
│   └── plugin.json          # Plugin manifest
├── skills/                   # Skill definitions
├── hooks/                    # Pre/post tool call hooks
└── README.md                 # Plugin documentation
```

See [`docs/plugins/writing-plugins.md`](../plugins/writing-plugins.md) for the full plugin authoring guide.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Tools not appearing | Check `.codex/mcp.json` path; reload Codex |
| `bun: command not found` | Ensure Bun is in PATH or use full path |
| Plugin install fails | Run `codex plugin install` from repo root |
| Skills not loading | Check `skills/` directory structure matches manifest |

---

*For the full adapter catalog, see [`catalog/adapters.md`](../../catalog/adapters.md). For plugin details, see [`catalog/plugins.md`](../../catalog/plugins.md).*
