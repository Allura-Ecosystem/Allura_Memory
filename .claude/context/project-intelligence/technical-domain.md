<!-- Context: project-intelligence/technical | Priority: critical | Version: 1.1 | Updated: 2026-04-11 -->

# Technical Domain

**Purpose**: Tech stack, architecture, development patterns for Allura Memory.
**Last Updated**: 2026-04-11

## Quick Reference

**Update Triggers**: Tech stack changes | New patterns | Architecture decisions
**Audience**: Developers, AI agents

## Primary Stack

| Layer                | Technology | Version     | Rationale                         |
| -------------------- | ---------- | ----------- | --------------------------------- |
| Framework            | Next.js    | 16          | App Router, Server Components     |
| Language             | TypeScript | 5.9 strict  | Type safety for memory operations |
| Runtime              | Bun        | 1.3.11      | Faster than Node for scripts      |
| Database (Events)    | PostgreSQL | 16          | Append-only raw traces            |
| Database (Knowledge) | Neo4j      | 5.26 + APOC | Versioned knowledge graph         |
| Database (Vectors)   | RuVector   | latest      | Vector embeddings                 |
| Styling              | Tailwind   | v4          | Utility-first CSS                 |
| UI Components        | shadcn/ui  | latest      | Accessible, composable            |
| State                | Zustand    | latest      | Client state management           |
| Validation           | Zod        | latest      | Runtime type validation           |
| Agent Framework      | OpenCode   | 1.4.3       | AI agent runtime                  |

## Architecture: 5-Layer Agent-OS

```
┌─────────────────────────────────────────────┐
│ Layer 5: Allura Dashboard (Human UI)          │
├─────────────────────────────────────────────┤
│ Layer 4: Workflow / DAGs / A2A Bus           │
├─────────────────────────────────────────────┤
│ Layer 3: Agent Runtime (OpenCode)            │
├─────────────────────────────────────────────┤
│ Layer 2: PostgreSQL + Neo4j + RuVector       │
├─────────────────────────────────────────────┤
│ Layer 1: RuVix Control Plane (Proof-gated mutation)│
└─────────────────────────────────────────────┘
```

## Project Structure

```
src/
├── app/           # Next.js App Router pages
├── components/    # React components (shadcn/ui)
├── lib/
│   ├── memory/    # Embedding providers, config
│   ├── postgres/  # PostgreSQL connection
│   ├── neo4j/     # Neo4j connection
│   ├── ruvector/  # Vector DB connection
│   └── dedup/     # Duplicate detection
├── mcp/           # MCP tools and server
├── control plane/        # RuVix control plane (proof system)
└── stores/        # Zustand stores
```

## Code Patterns

### Server Action

```typescript
"use server"
import { z } from "zod"

const schema = z.object({
  group_id: z.string().startsWith("allura-"),
  content: z.string().min(1),
})

export async function createMemory(input: unknown) {
  const validated = schema.parse(input) // Zod validation
  await db.insert(events).values({ ...validated, event_type: "memory_add" })
  return { success: true }
}
```

### React Component

```typescript
interface MemoryCardProps { content: string; confidence: number }
export function MemoryCard({ content, confidence }: MemoryCardProps) {
  return <div className="rounded-lg border p-4">{content}</div>;
}
```

## Naming Conventions

| Type       | Convention   | Example               |
| ---------- | ------------ | --------------------- |
| Files      | kebab-case   | `memory-card.tsx`     |
| Components | PascalCase   | `MemoryCard`          |
| Functions  | camelCase    | `getMemoryById`       |
| DB Tables  | snake_case   | `promotion_proposals` |
| Tenant IDs | allura-{org} | `allura-faith-meats`  |

## Security Requirements

- TypeScript `strict: true`
- Zod validation at all boundaries
- `group_id` on EVERY database operation
- PostgreSQL events are append-only
- Neo4j uses SUPERSEDES (never edit)
- Server guards on DB modules

## 📂 Codebase References

**Core**: `src/lib/memory/`, `src/mcp/canonical-tools.ts`
**Config**: `package.json`, `docker-compose.yml`
**Tests**: `src/**/*.test.ts`

## Related Files

- `business-domain.md` - Business context
- `decisions-log.md` - Decision history
- `docs/allura/RISKS-AND-DECISIONS.md` - Architecture decisions (canonical)
