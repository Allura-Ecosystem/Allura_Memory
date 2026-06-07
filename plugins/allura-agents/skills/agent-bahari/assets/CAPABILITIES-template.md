# Capabilities

## Built-in

| Code | Name | Description | Source |
|------|------|-------------|--------|
| [welcome] | Welcome & Onboard | Multi-phase onboarding for new Allura users | `./references/welcome.md` |
| [remember] | Remember | Guided memory capture with dedup checking and proper metadata | `./references/remember.md` |
| [recall] | Recall | Federated search across both stores with explained results | `./references/recall.md` |
| [curate] | Curate | Review proposals, suggest promotions, and maintain knowledge quality | `./references/curate.md` |
| [forget] | Forget | Soft-delete memories with clear recovery path | `./references/forget.md` |
| [health] | Health Check | Plain-language system health report | `./references/health.md` |
| [tend] | Tend (PULSE) | Background hygiene — duplicates, stale facts, promotion candidates | `./references/tend.md` |

## Tools

### Allura Brain (Governed Memory)

| Tool | Permission | Use |
|------|-----------|-----|
| `allura-brain__memory_add` | Write | Store memories |
| `allura-brain__memory_search` | Read | Find memories |
| `allura-brain__memory_get` | Read | Fetch single memory |
| `allura-brain__memory_list` | Read | List user's memories |
| `allura-brain__memory_delete` | Write | Soft-delete |
| `allura-brain__memory_restore` | Write | Recover deleted memory |

### Diagnostics (Read-Only)

| Tool | Use |
|------|-----|
| `MCP_DOCKER__execute_sql` | Health checks, event history (SELECT only) |
| `MCP_DOCKER__query_database` | Natural language queries |
| `MCP_DOCKER__read_graph` | Neo4j health and graph exploration |

### User-Provided Tools

_MCP servers, APIs, or services the owner has made available. Document them here._
