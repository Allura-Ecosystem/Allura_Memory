# GitHub Copilot Instructions

> [!IMPORTANT]
> This file configures GitHub Copilot behavior in this repository.

## AI-Assisted Documentation Policy

All code and documentation generated with AI assistance (GitHub Copilot, Claude, etc.) must:

1. **Include disclosure block** (see AI-GUIDELINES.md)
   - Added at top of file after title
   - Removed only after full human review

2. **Follow Brooksian principles**
   - AI assists implementation, not architecture
   - One human architect owns conceptual integrity
   - Never let AI decide system design alone

3. **Validate against source of truth**
   - Code is authoritative (not documentation)
   - JSON schemas are definitive
   - Team consensus overrides AI output

## When Copilot Should Help

✅ Drafting initial document structure
✅ Generating field tables from schemas
✅ Cross-referencing existing documentation
✅ Formatting and spell-checking
✅ Naming conventions (following established patterns)

## When Copilot Should NOT Decide

❌ Architecture decisions (APIs, data models, system design)
❌ Security constraints or threat models
❌ Performance trade-offs
❌ Governance rules (HITL, curator approval gates)
❌ Naming conventions (must match existing patterns)

## Required Artifacts (Before Coding)

Canonical location: `docs/allura/`

- **BLUEPRINT.md** — Service purpose, concepts, requirements
- **SOLUTION-ARCHITECTURE.md** — Design decisions, trade-offs
- **DESIGN-ALLURA.md** (or approved **DESIGN-\*.md**) — Component-level designs
- **REQUIREMENTS-MATRIX.md** — B# → code mapping
- **RISKS-AND-DECISIONS.md** — Architectural decisions and tradeoffs
- **DATA-DICTIONARY.md** — All entities and fields

Canonical surface rule: Do not create net-new files in `docs/allura/` beyond the canonical six. Route reports, deliverables, prompts, validation snapshots, and benchmarks to `docs/archive/allura/` or Allura Brain.

See `AI-GUIDELINES.md` for complete guidance.

## Review & Sign-Off

Every AI-assisted document requires:

1. PR review (human eyes on output)
2. Architectural sign-off (architect approves design intent)
3. Disclosure removal (only after sign-off)

Copilot output is a draft, not a final specification.

## Agent Harness Integration

This repository uses three AI harnesses:

- **Claude Code** (primary) — `.claude/` configuration
- **GitHub Copilot** — This file
- **OpenCode** — `.opencode/` configuration

All harnesses must reference AI-GUIDELINES.md and enforce disclosure requirements.

## Allura Brain

This project uses **Allura Brain** (PostgreSQL + RuVector) for persistent context. The Brain is the source of truth — not flat files.

### Startup Protocol

At session start:

1. Dispatch Scout to search PostgreSQL events for recent activity and blockers
2. Query the semantic layer (PostgreSQL `graph_memories`, RuVector hybrid search) for architecture insights and decisions
3. Synthesize: what's active, what's blocking, what was decided

### Data Stores

- **PostgreSQL** — Append-only events, temporal traces
- **PostgreSQL semantic layer** — Versioned insights in `graph_memories`, SUPERSEDES edges in `graph_supersedes`
- **RuVector** — 768d embeddings and hybrid search (pgvector, same PostgreSQL instance, port 5432)

## Brooks as Architect

Frederick Brooks (the persona) serves as the architectural authority:

- Reviews all AI-assisted architecture decisions
- Maintains conceptual integrity across harnesses
- Approves removal of disclosure blocks
- Validates against Brooksian principles

When in doubt, defer to Brooks.

## Key Patterns to Follow

### Steel Frame Versioning

All Insights are immutable. Create new versions with SUPERSEDES relationships:

```
graph_supersedes: (v2-insight-id) supersedes (v1-insight-id, deprecated)
```

### group_id Enforcement

Every row MUST have a `group_id` value. The schema CHECK constraint rejects rows without it.

### HITL Knowledge Promotion

Agents CANNOT autonomously promote to the canonical semantic layer/Notion. Human approval required.

### ADR 5-Layer Framework

Every architectural decision captured with:

1. Action Logging
2. Decision Context
3. Reasoning Chain
4. Alternatives Considered
5. Human Oversight Trail

## Memory Retrieval Order

When working on this project, dispatch Scout to hydrate from Allura Brain:

1. Scout recon on PostgreSQL events — recent activity and blockers
2. Query the semantic layer (PostgreSQL `graph_memories`, RuVector hybrid search) for architecture insights and decisions
3. Synthesize: what's active, what's blocking, what was decided
4. `docs/allura/` — canonical architecture and design docs

## Project-Specific Rules

1. **Use Zustand** for client state management (existing pattern in `src/stores/`)
2. **Use shadcn/ui** for UI components
3. **Use server actions** for state persistence (pattern in `src/server/`)
4. **Use group_id** in all database operations for tenant isolation
5. **Use append-only** for PostgreSQL traces - never mutate
6. **Use SUPERSEDES** (`graph_supersedes`) for semantic versioning - never edit Insights
7. **Prefer premade MCP servers from `MCP_DOCKER`**; avoid custom wrappers when a catalog server already exists
8. **Use Bun exclusively** for all package operations — never use `npm` or `npx` (supply chain security)

## Important Files

| File                 | Purpose                                               |
| -------------------- | ----------------------------------------------------- |
| `docker-compose.yml` | PostgreSQL (with RuVector) container                  |
| `docs/allura/`       | Canonical architecture, design, and requirements docs |

## Verification Commands

```bash
# Check PostgreSQL
docker exec knowledge-postgres pg_isready -U $POSTGRES_USER -d memory

# Check the semantic layer (PostgreSQL graph_memories)
psql "$DATABASE_URL" -c "SELECT count(*) FROM graph_memories"
```

## Updating Memory Bank

When making significant changes:

1. **After completing a story**: Update `progress.md`
2. **When starting new work**: Update `activeContext.md`
3. **Making architectural decisions**: Update `systemPatterns.md`
4. **Adding new dependencies**: Update `techContext.md`
5. **Major scope changes**: Update `projectbrief.md`

## References

- [Memory Bank System - Tweag Agentic Coding Handbook](https://tweag.github.io/agentic-coding-handbook/WORKFLOW_MEMORY_BANK/)
- [How to Use a Memory Bank in Copilot](https://www.loom.com/share/152cea77575148b8af9fe8538ed30c30)
- [10x your Cursor Workflow with Memory Bank](https://www.youtube.com/watch?v=Uufa6flWid4)
