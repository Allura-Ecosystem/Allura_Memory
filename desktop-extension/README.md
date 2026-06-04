# Allura Memory — Claude Desktop / Cowork Extension

A one-click `.mcpb` extension that gives **Claude Desktop** and **Cowork** a persistent,
governed memory backed by your hosted **Allura Brain**.

## Why this exists (and why it's shaped this way)

Claude Desktop has **no plugin system** — no agents, skills, hooks, or slash commands.
Its only extensibility is **MCP servers**. And the `.mcpb` Desktop Extension format
(`manifest_version` 0.3) supports **local stdio servers only** — it cannot package a
remote HTTP server directly.

So this extension bundles a tiny **stdio proxy** (`server/index.js`) that forwards every
memory call to your hosted Allura Brain over HTTPS. The memory itself lives in the cloud
Brain; the bundle is just the local bridge Desktop requires.

```
Claude Desktop / Cowork
        │  stdio (MCP)
        ▼
  allura-memory.mcpb  ──HTTPS (Bearer API key)──▶  Hosted Allura Brain (PG + Neo4j)
   (this proxy)                                      governance enforced server-side
```

**Governance travels for free.** group_id tenancy, append-only traces, and HITL
promotion are enforced *inside the Brain*, not in client hooks — so they apply in Desktop
automatically. The proxy additionally auto-attaches your `group_id` to any tool whose
schema declares it.

## What does NOT port from the Claude Code plugins

| Claude Code plugin construct | In Desktop |
| --- | --- |
| `agents/*.md` (Brooks, Woz, …)   | ❌ no subagent system — surface as Brain MCP **prompts** instead |
| `skills/`                        | ❌ no skill engine |
| `hooks/hooks.json`               | ❌ no hook engine — governance moves server-side |
| `commands/`                      | ⚠️ approximate with MCP **prompts** |
| MCP server (Allura Brain)        | ✅ this extension |

## Build

```bash
bun install
bunx @anthropic-ai/mcpb pack . allura-memory.mcpb
```

Produces `allura-memory.mcpb`. See [INSTALL.md](INSTALL.md) for install + config.

## Required backend (your remaining work)

This extension is a **client**. "For the world" requires a **publicly reachable,
multi-tenant Allura Brain** that:

1. speaks streamable-HTTP MCP at the configured `base_url` (default
   `https://brain.allura.dev/mcp` — change to your real host),
2. authenticates requests via `Authorization: Bearer <api_key>`,
3. isolates tenants by `group_id`.

Until that backend is live and issuing API keys, the extension installs but cannot connect.
