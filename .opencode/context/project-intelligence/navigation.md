<!-- Context: project-intelligence/nav | Priority: critical | Version: 1.2 | Updated: 2026-05-16 -->

# Project Intelligence Navigation

> This section is an Allura-specific project intelligence overlay. It documents the Allura memory system and related repo context; it is not the generic harness identity.

## Quick Routes

| What You Need | File | Key Content |
|---------------|------|-------------|
| **Start here** | `navigation.md` | This file - quick overview |
| **How to build** | `technical-domain.md` | Stack, patterns, conventions |
| **API patterns** | `technical-domain.md#api-route-handler` | Route handlers, role gates, group_id validation |
| **Component patterns** | `technical-domain.md#react-component` | Props, `cn(...)`, design-token classes |
| **Security rules** | `technical-domain.md#security-requirements` | Auth, tenant isolation, audit, no secrets |
| **Why this exists** | `business-domain.md` | Positioning vs mem0 |
| **Architecture** | `business-tech-bridge.md` | Business → tech mapping |
| **Decisions** | `decisions-log.md` | Why decisions were made |
| **Current state** | `living-notes.md` | Active issues, debt |
| **Repo truth** | `informant.md` | Maintainer field manual |

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
npm run dev              # Start dev server
npm test                 # Run tests (85% passing)
npm run typecheck        # TypeScript check
docker compose up -d     # Start infrastructure
```

## Integration

Referenced from:
- `memory-bank/systemPatterns.md` - Architecture patterns
- `AGENTS.md` - Agent operating handbook
- `docs/allura/` - Human documentation canon

## Maintenance

- Update when tech stack changes
- Document decisions as made
- Review `living-notes.md` weekly
