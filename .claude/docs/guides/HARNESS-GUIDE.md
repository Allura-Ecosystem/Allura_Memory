# Claude Code Harness Guide

This guide explains how to use the Allura plugin harness from Claude Code.

---

## Quick Start

The harness consists of 6 slash commands:

| Command | Purpose |
|---------|---------|
| `/mcp-discover [keyword]` | List available MCP servers |
| `/mcp-approve <server-id>` | Request approval for pending servers |
| `/mcp-load <server-id>` | Activate an approved MCP server |
| `/skill-propose <skill-name>` | Show skill details + executor |
| `/skill-load <skill-name>` | Execute a skill with assigned executor |
| `/harness-status` | Show harness health + loaded servers |

---

## Workflow 1: Discover & Load MCP Servers

### Scenario: You want to search the web

```
User:
  /mcp-discover search

Harness:
  Approved servers:
    - perplexica (self-hosted AI search, no API key)
    - exa (neural/semantic search)
  
  Pending approval:
    None

User:
  /mcp-load perplexica

Harness:
  ✅ Loaded: mcp__MCP_DOCKER__perplexica_search
  ✅ Loaded: mcp__MCP_DOCKER__perplexica_search


Next step: Use the tools in your prompt
```

### Scenario: You want to query the database

```
User:
  /mcp-discover database

Harness:
  Approved servers:
    None yet

  Pending approval:
    - postgresql (Direct PostgreSQL client)

User:
  /mcp-approve postgresql

Harness:
  ✅ MCP_APPROVED event logged
  Next step: /mcp-load postgresql

User:
  /mcp-load postgresql

Harness:
  ✅ Loaded: mcp__MCP_DOCKER__query_database
  ✅ Loaded: mcp__MCP_DOCKER__execute_sql
  ✅ Loaded: mcp__MCP_DOCKER__insert_data

Next step: Use the tools
```

---

## Workflow 2: Propose & Execute Skills

### Scenario: You need a code review

```
User:
  /skill-propose code-review

Harness:
  Skill: code-review
  Executor: @Pike (read-only consultant)
  Description: Code review and architecture feedback
  
  Next step: /skill-load code-review

User:
  /skill-load code-review

Harness:
  ✅ SKILL_LOADED event logged
  Routing to: @Pike
  Permissions: read, grep, lsp
  
  @Pike is now reviewing your code...
```

### Scenario: You want strategic planning

```
User:
  /skill-propose system-design

Harness:
  Skill: system-design
  Executor: @Fowler (strategic planning)
  Description: System architecture and planning
  
User:
  /skill-load system-design

Harness:
  ✅ Routed to @Fowler
  Mode: Interview-based planning
```

---

## Commands Reference

### /mcp-discover

**Lists approved & pending MCP servers.**

```
/mcp-discover                   # All servers
/mcp-discover database          # Filter by keyword
```

**Result:** JSON with approved[] and pending[] arrays

**Next steps:**
- Approve pending: `/mcp-approve <server-id>`
- Load approved: `/mcp-load <server-id>`

---

### /mcp-approve

**Approve a pending MCP server (Brooks only).**

```
/mcp-approve postgresql         # Approve PostgreSQL
```

**Prerequisites:** Server must be in pending list

**Result:** Logged to PostgreSQL (append-only audit trail)

**Next step:** `/mcp-load <server-id>`

---

### /mcp-load

**Load an approved MCP server and activate its tools.**

```
/mcp-load perplexica           # Load Perplexica (self-hosted AI search)
/mcp-load postgresql            # Load PostgreSQL (if approved)
```

**Prerequisites:**
- Server must be approved
- Environment variables set (if required)
- Perplexica is self-hosted — no API key required

**Result:** Tools available immediately

**Note:** Idempotent (safe to repeat)

---

### /skill-propose

**Show skill details and assigned executor.**

```
/skill-propose code-review          # Code review
/skill-propose postgres-optimization # Database optimization
/skill-propose system-design        # Architecture planning
```

**Result:** Skill metadata + preferred executor + next step

**Next step:** `/skill-load <skill-name>`

---

### /skill-load

**Execute a skill by routing to specialist executor.**

```
/skill-load code-review                       # Use default (@Pike)
/skill-load code-review --executor pike-interface-review     # Explicit routing
/skill-load postgres-optimization --executor woz-builder
```

**Prerequisites:** Skill must exist and be available

**Result:** Executor receives skill context + permissions

**Executors:**
- `@Pike` — Architecture review (read-only)
- `@Woz` — Deep implementation
- `@Fowler` — Strategic planning
- `@ux` — Design + accessibility
- `@Scout` — Documentation search
- `@Scout` — Codebase patterns
- `@Brooks` — Todo coordination
- `@Brooks` — Orchestration (planning only)

---

### /harness-status

**Show harness health and loaded servers.**

```
/harness-status
```

**Result:**
- Harness configuration (group_id, agent_id, postgres available)
- Loaded MCP servers
- Pending approvals
- Available skills with executors
- Recent event count

**Use case:** Verify harness health before operations

---

## Brooksian Principles

The harness follows four Brooksian design principles:

### 1. Explicit Approval

No auto-discovery, auto-loading, or auto-promotion. Everything requires explicit Brooks approval:

```
/mcp-discover → /mcp-approve → /mcp-load
```

### 2. Surgical Delegation

Skills are routed to specialist agents with specific permissions:

- `@Pike` — read-only architecture consultation
- `@Woz` — autonomous deep work
- `@ux` — accessibility-first design

No generalist agents. Each specialist owns their domain completely.

### 3. Manual Curation

The MCP registry is YAML — manually curated, no auto-fetch from external sources. All changes are reviewed by Brooks before approval.

### 4. Append-Only Audit

Every operation logged to PostgreSQL (immutable). No mutations, full compliance trail by design:

```
/mcp-discover → MCP_DISCOVERED event logged
/mcp-approve  → MCP_APPROVED event logged
/mcp-load     → MCP_LOADED event logged
/skill-load   → SKILL_LOADED event logged
```

---

## Architecture

```
Claude Code IDE
    ↓
Slash Commands (.claude/commands/)
    ↓
Harness Router (.claude/scripts/harness-router.sh)
    ↓
Harness Orchestrator (.opencode/harness/index.ts)
    ↓
Event Logger → PostgreSQL (append-only)
    ↓
Canonical Promotion (curator approval only)
```

---

## Files

### Commands (User-Facing)

```
.claude/commands/
├── mcp-discover.md        # Discover MCP servers
├── mcp-approve.md         # Request approval
├── mcp-load.md            # Activate server
├── skill-propose.md       # Show skill details
├── skill-load.md          # Execute skill
└── harness-status.md      # Health check
```

### Scripts (Routing)

```
.claude/scripts/
└── harness-router.sh      # Routes to harness orchestrator
```

### Harness Implementation

```
.opencode/harness/
├── index.ts                    # Main orchestrator
├── event-logger.ts            # Postgres logging
├── mcp-plugin-loader.ts       # MCP discovery/approval
├── skill-loader.ts            # Skill registry
└── test-logging-integration.ts # Tests (✅ passing)
```

### Documentation

```
.opencode/
├── HARNESS-LOGGING-INTEGRATION.md    # Logging architecture
├── HARNESS-TO-CLAUDE-CODE.md         # Integration spec
├── HARNESS-COMPLETION-SUMMARY.md     # Full summary
└── HARNESS-QUICKSTART.md             # Quick reference
```

---

## Troubleshooting

### "Server not found"

```bash
/mcp-discover             # List all servers first
/mcp-approve <server-id>  # Then approve if pending
/mcp-load <server-id>     # Then load
```

### "Environment variable missing"

Some servers require environment variables. Perplexica is self-hosted and needs no API key:

```bash
/mcp-load perplexica
```

### "Postgres unavailable"

Logging fails gracefully if Postgres is down. Harness operations continue; just won't be logged.

Verify:
```bash
/harness-status    # Shows postgres_available: true/false
```

### "Permission denied"

Only Brooks (orchestrator) can approve servers and route skills. Non-Brooks users can:
- Discover servers (`/mcp-discover`)
- Propose skills (`/skill-propose`)
- Load already-approved servers (`/mcp-load`)
- Execute loaded skills (`/skill-load`)

---

## Next Steps

1. **Try a discover:** `/mcp-discover`
2. **Load Perplexica:** `/mcp-load perplexica`
3. **Propose a skill:** `/skill-propose code-review`
4. **Execute:** `/skill-load code-review`

---

**Questions?** See `.opencode/HARNESS-LOGGING-INTEGRATION.md` or `.opencode/PLUGIN-ARCHITECTURE.md`.
