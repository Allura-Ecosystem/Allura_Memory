# Team RAM Governance Gates

> Shared by all Allura methodologies. Every workflow must pass these 7 gates in order.

## Gate 1: Scout Hydration

**Before any action:**

1. Load local context files: `CLAUDE.md`, `.opencode/`, `.claude/`, `docs/allura/`
2. Search Allura Brain with `group_id=allura-system` for:
   - Recent Brooks events and blockers
   - Architecture decisions (AD-##)
   - Prior outcomes and lessons
3. Synthesize: what's active, what's blocking, what was decided

If Scout is unavailable, state: `Scout-style hydration only (no subagent).`

## Gate 2: Documentation Impact Check

**Before touching any code**, check whether the change impacts any of the six canonical docs:

1. `BLUEPRINT.md` — business requirements, core concepts
2. `SOLUTION-ARCHITECTURE.md` — topology, interfaces, actors
3. `DESIGN-ALLURA.md` — API contracts, state machines, constraints
4. `REQUIREMENTS-MATRIX.md` — B# → F# traceability
5. `RISKS-AND-DECISIONS.md` — AD-## and RK-## entries
6. `DATA-DICTIONARY.md` — field names, types, enums

If the change touches any canonical doc, update it in the same PR.

## Gate 3: Owner Assignment

| Phase | Owner | Role |
|-------|-------|------|
| Intent/Scope | Jobs | Acceptance criteria, scope control |
| Architecture | Brooks | Contracts, boundaries, route approval |
| Implementation | Woz | Build with loaded context |
| Interface Review | Pike | Simplicity, API surface |
| Refactor Review | Fowler | Maintainability, token use, boundaries |
| Diagnostics | Bellard | Performance, measurement |
| Data/Schema | Knuth | Schema correctness, query optimization |
| Infra/Deploy | Hightower | CI/CD, deployment, observability |
| Discovery | Scout | Recon, pattern discovery, Brain search |

## Gate 4: Workflow Execution

Execute the methodology with loaded context:

- `allura-dev-story` → full governance-gated story implementation
- `allura-code-review` → Pike/Fowler review gates
- `allura-architecture` → Brooks gate + ADR logging
- `allura-product-intake` → Jobs intent gate + scope control
- `allura-retrospective` → Brooks-facilitated post-epic review

## Gate 5: Notion Board Update

After any status change:

1. Update the relevant Notion work item (Status, Decision Log, Handoff Context)
2. Notion is the source of truth for sprint status
3. Local files are evidence only

## Gate 6: Validation Evidence

Before marking any story `Done`:

- [ ] Targeted tests pass (`bun test`, `bun run typecheck`)
- [ ] Acceptance criteria met (from Notion work item)
- [ ] Review approved (Pike for interface, Fowler for maintainability)
- [ ] Evidence artifact created (test output, review notes, screenshots)
- [ ] No canonical doc impact without update

## Gate 7: Brain Outcome Log

After completing any significant action:

```
allura-brain_memory_add({
  group_id: "allura-system",
  user_id: "brooks-architect",
  content: "EVENT_TYPE: what was done; evidence=...",
  metadata: { source: "conversation", agent_id: "brooks-architect" }
})
```

Event types: `ADR_CREATED`, `INTERFACE_DEFINED`, `TECH_STACK_DECISION`, `TASK_COMPLETE`, `BLOCKED`, `LESSON_LEARNED`

## Invariants (Never Violate)

- ✅ `group_id = 'allura-system'` on every DB operation
- ✅ `agent_id = 'brooks'` for all architectural decisions
- ✅ PostgreSQL events are append-only (no UPDATE/DELETE)
- ✅ Neo4j uses SUPERSEDES for versioning (never edit nodes)
- ✅ Scout before build. Skills before Ralph. Validation before done.
- ✅ Notion Kanban is source of truth; local files are support artifacts
- ✅ Memory supplements context; it does not replace it
