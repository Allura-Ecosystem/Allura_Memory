<!-- Context: project-intelligence/nav | Priority: critical | Version: 1.2 | Updated: 2026-04-17 -->

# Project Intelligence — Allura Memory

> Memory layer for Allura Agent-OS with provable governance, tenant isolation, and auditable promotion.

> **Reading order:** `system-authority.md` first (it overrides all defaults), then `informant.md` for field manual.

## Quick Routes

| What You Need       | File                      | Key Content                  |
| ------------------- | ------------------------- | ---------------------------- |
| **Start here**      | `navigation.md`           | This file - quick overview   |
| **System authority**| `system-authority.md`     | SYSTEM — overrides all agent defaults |
| **v1 blockers**     | `v1-blockers.md`           | Active — must resolve before v1 GO |
| **How to build**    | `technical-domain.md`     | Stack, patterns, conventions |
| **Why this exists** | `business-domain.md`      | Positioning vs mem0          |
| **Architecture**    | `business-tech-bridge.md` | Business → tech mapping      |
| **Decisions**       | `decisions-log.md`        | Why decisions were made      |
| **Current state**   | `living-notes.md`         | Active issues, debt          |
| **Repo truth**      | `informant.md`            | Maintainer field manual      |

## Tech Stack at a Glance

```
Next.js 16 + TypeScript 5.9 (strict) + Bun 1.3
PostgreSQL 16 (events + `graph_memories` knowledge) + RuVector (vectors, hybrid search)
OpenCode 1.4.3 (agent runtime) + MCP (tool protocol)
```

## Key Invariants

- ✅ `group_id` on every database write (tenant isolation)
- ✅ PostgreSQL = append-only raw traces
- ✅ Semantic layer = curated knowledge with SUPERSEDES (`graph_supersedes`)
- ✅ No agent writes to the semantic layer without human approval

## Quick Commands

```bash
bun install              # Install dependencies
bun run dev              # Start dev server
bun test                 # Run tests
bun run typecheck        # TypeScript check
docker compose up -d     # Start infrastructure
```

## Integration

Referenced from:

- `docs/allura/RISKS-AND-DECISIONS.md` - Architecture decisions
- `AGENTS.md` - Agent operating handbook
- `docs/allura/` - Human documentation canon

## Maintenance

- Update when tech stack changes
- Document decisions as made
- Review `living-notes.md` weekly
