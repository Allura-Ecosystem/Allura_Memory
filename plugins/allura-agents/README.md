# Allura Agents

The product agent team for Allura Memory. These agents ship with Allura to help people use the system — onboarding, memory management, curation, and health monitoring.

## How This Differs from Other Teams

| Team | Purpose | Users | Namespace |
|------|---------|-------|-----------|
| **Team RAM** | Build Allura | Developers | `allura-system` |
| **Team Durham** | Brand Allura | Design team | `allura-team-durham` |
| **Allura Agents** | Help people use Allura | Open source community | User's own `group_id` |

## Agents

| Agent | Role | Description |
|-------|------|-------------|
| **Bahari** | Memory Curator | The companion — onboarding, capture, search, curation, hygiene |

## Architecture

Allura Agents use a single-agent model with invisible sub-agents. Users interact with one companion (Bahari). Internal sub-agents handle specialized work (search, health checks) but are never exposed to users.

```
User
  ↕
Bahari (the only face)
  ├── Scout (internal: fast federated search)
  └── Sentinel (internal: health checks, hygiene audits)
```

## Key Differences from Internal Agents

- **group_id**: Allura Agents use the user's configured `group_id`, never `allura-system`
- **MCP only**: All operations through governed `allura-brain__memory_*` tools
- **No direct DB**: Never `insert_data`, `create_entities`, or `docker exec`
- **HITL**: Suggest promotions but never auto-promote — user approves
- **Warm voice**: Product-facing, not engineering-facing
