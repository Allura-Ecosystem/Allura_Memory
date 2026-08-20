
> [!NOTE]
> **AI-Assisted Documentation** — this file is maintained with AI assistance.
> Where it conflicts with the source code, schemas, or tests, defer to those.

<!-- Context: project-intelligence/technical | Priority: critical | Version: 1.3 | Updated: 2026-05-16 -->

# Technical Domain

**Purpose**: Tech stack, architecture, development patterns for Allura Memory.
**Last Updated**: 2026-05-16

## Quick Reference
**Update Triggers**: Tech stack changes | New patterns | Architecture decisions
**Audience**: Developers, AI agents

## Primary Stack
| Layer | Technology | Version | Rationale |
|-------|-----------|---------|-----------|
| Framework | Next.js | 16 | App Router, Server Components |
| Language | TypeScript | 5.9 strict | Type safety for memory operations |
| Runtime | Bun | 1.3.11 | Faster than Node for scripts |
| Database (Events) | PostgreSQL | 16 | Append-only raw traces |
| Database (Knowledge) | Neo4j | 5.26 + APOC | Versioned knowledge graph |
| Database (Vectors) | RuVector | latest | Vector embeddings |
| Styling | Tailwind | v4 | Utility-first CSS |
| UI Components | shadcn/ui | latest | Accessible, composable |
| State | Zustand | latest | Client state management |
| Validation | Zod | latest | Runtime type validation |
| Agent Framework | OpenCode | 1.4.3 | AI agent runtime |
| Graph Visualization | react-force-graph-2d | latest | MIT, canvas-based, Neo4j graph view — dynamic import `{ssr:false}` |
| Font | IBM Plex Sans (@fontsource) | latest | Canonical brand font — replaces Outfit/Inter |

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

### API Route Handler
```typescript
export async function GET(request: NextRequest): Promise<NextResponse> {
  const roleCheck = requireRole(request, "viewer")
  if (!roleCheck.user) return unauthorizedResponse()
  if (!roleCheck.allowed) return forbiddenResponse(roleCheck)

  const { searchParams } = new URL(request.url)
  const group_id = validateGroupId(searchParams.get("group_id"))
  const parsed = schema.safeParse({ group_id, limit: searchParams.get("limit") })
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 })
  return NextResponse.json(await queryService(parsed.data))
}
```

### React Component
```typescript
export interface InsightCardProps {
  insight: Insight
  actions?: React.ReactNode
  compact?: boolean
  className?: string
}

export function InsightCard({ insight, actions, compact = false, className }: InsightCardProps) {
  return <article className={cn("rounded-xl border p-4", compact && "gap-1", className)}>
    <h3 className="text-sm font-semibold text-[var(--dashboard-text-primary)]">{insight.title}</h3>
    {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
  </article>
}
```

**Pattern Rules**: Use `NextRequest`/`NextResponse` route handlers, `requireRole`, `validateGroupId`, and Zod `safeParse`. Components use named exports, explicit Props interfaces, `className?: string`, `cn(...)`, and design-token CSS variables.

## Naming Conventions
| Type | Convention | Example |
|------|-----------|---------|
| Files | kebab-case | `memory-card.tsx` |
| Components | PascalCase | `MemoryCard` |
| Functions | camelCase | `getMemoryById` |
| Schemas | PascalCase + Schema suffix | `PermissionProfileSchema` |
| API Routes | route folders + `route.ts` | `api/memory/[id]/route.ts` |
| DB Tables | snake_case | `promotion_proposals` |
| DB/Event Fields | snake_case | `group_id`, `agent_id`, `event_type` |
| Tenant IDs | allura-{org} | `allura-faith-meats` |
| Agents | real-person names / role IDs | `brooks`, `woz`, `scout-recon` |

## Code Standards
- Treat documentation as a first-class artifact: Blueprint before design work.
- Defer source-of-truth conflicts in order: schema/code > Blueprint > team consensus > AI suggestion.
- Update Requirements Matrix and Data Dictionary in the same PR as schema/API changes.
- Record architectural decisions and risks in `RISKS-AND-DECISIONS.md`; no orphan decisions.
- Include AI-assisted documentation disclosure until human review signs off.

**Reference**: `.opencode/rules/AI-GUIDELINES.md`

## Security Requirements
- API routes MUST require auth/role checks via `requireRole`; return 401/403 helpers.
- Every DB and graph operation MUST validate and filter by `group_id` (`^allura-[a-z0-9-]+$`).
- PostgreSQL events are append-only; use parameterized queries and never string interpolation.
- Neo4j knowledge changes MUST be approval-gated and versioned with `SUPERSEDES`.
- Do not log or document secrets, credentials, clear PII, or raw tokens.
- AI/security-boundary changes require human review; AI must not decide auth, redaction, or breaking schemas alone.

## 📂 Codebase References
**API**: `src/app/api/memory/route.ts`, `src/app/api/audit/events/route.ts`, `src/app/api/permission-profiles/[id]/route.ts`
**Components**: `src/components/dashboard/InsightCard.tsx`, `src/components/ui/button.tsx`, `src/components/memory/memory-card.tsx`
**Security**: `src/lib/auth/api-auth.ts`, `src/lib/validation/group-id.ts`, `src/lib/memory/approval-audit.ts`
**Config/Docs**: `package.json`, `docker-compose.yml`, `.opencode/rules/AI-GUIDELINES.md`

## Related Files
- `business-domain.md` - Business context
- `decisions-log.md` - Decision history
- `memory-bank/systemPatterns.md` - Architecture patterns
