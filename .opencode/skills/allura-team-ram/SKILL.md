---
name: allura-team-ram
description: "Allura Team RAM operating core — shared governance, routing, memory, and validation gates for all Allura wrapper skills. Load this skill before any allura-* wrapper."
globs: ["src/**", ".opencode/**", "docs/allura/**", "guidelines/**"]
---

# Allura Team RAM — Shared Operating Core

> [!NOTE]
> **AI-Assisted Documentation** — this file is maintained with AI assistance.
> Where it conflicts with the source code, schemas, or tests, defer to those.


> **Allura decides. Team RAM owns. Guidelines constrain docs. RuVix validates. Brain remembers.**

This skill is the shared foundation for all `allura-*` wrapper skills. It defines the gates, routing, memory, and validation rules that every Allura workflow must follow.

## When to Use

Load this skill before any `allura-*` wrapper. It is the mandatory first step for Allura Memory repo work.

Trigger phrases: `allura dev story`, `allura code review`, `allura architecture`, `allura product intake`, `allura retrospective`, `team ram`, `brooks route`, `allura workflow`.

## Architecture

```
Allura Skill Layer (project-specific governance gates)
  ├── allura-dev-story       → Scout + Brain + Notion + validation
  ├── allura-code-review     → Pike/Fowler gates + Brain
  ├── allura-architecture    → Brooks gate + Brain
  ├── allura-product-intake  → Jobs gate + Brain
  └── allura-retrospective   → Brooks + Brain

Allura Core Layer (shared governance)
  └── allura-team-ram (THIS SKILL)
```

## Mandatory Gates (Every Allura Workflow)

### Gate 1: Scout Hydration

Before any implementation or review:

1. Load local context files: `CLAUDE.md`, `.opencode/`, `.claude/`, `docs/allura/`
2. Search Allura Brain with `group_id=allura-system` for:
   - Recent Brooks events and blockers
   - Architecture decisions (AD-##)
   - Prior outcomes and lessons
3. Synthesize: what's active, what's blocking, what was decided

If Scout is unavailable, state: `Scout-style hydration only (no subagent).`

### Gate 2: Documentation Impact Check

Before touching any code, check whether the change impacts any of the six canonical docs:

1. `BLUEPRINT.md` — business requirements, core concepts
2. `SOLUTION-ARCHITECTURE.md` — topology, interfaces, actors
3. `DESIGN-ALLURA.md` — API contracts, state machines, constraints
4. `REQUIREMENTS-MATRIX.md` — B# → F# traceability
5. `RISKS-AND-DECISIONS.md` — AD-## and RK-## entries
6. `DATA-DICTIONARY.md` — field names, types, enums

If the change touches any canonical doc, update it in the same PR.

### Gate 3: Team RAM Owner Assignment

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

### Gate 4: Workflow Execution

Execute the Allura skill workflow with loaded context:

- `allura-dev-story` → loads this skill, then executes story implementation
- `allura-code-review` → loads this skill, then executes code review
- `allura-architecture` → loads this skill, then executes architecture creation
- `allura-product-intake` → loads this skill, then executes PRD creation
- `allura-retrospective` → loads this skill, then executes retrospective

### Gate 5: Notion Board Update

After any status change:

1. Verify the actual board/work item before an authorized update (Status, Decision Log, Handoff Context).
2. Existing Notion sprint tracking does not settle the unresolved operational-board choice DOC-09.
3. Local packets are preparation evidence, not live board status. Done/Approved moves and sync retain their approval gates; report pending updates when access or authorization is absent.

### Gate 6: Validation Evidence

Before marking any story `Done`:

- [ ] Appropriate package-script test lane has nonzero discovery and passes; `bun run typecheck` passes
- [ ] Acceptance criteria met (from Notion work item)
- [ ] Review approved (Pike for interface, Fowler for maintainability)
- [ ] Evidence artifact created (test output, review notes, screenshots)
- [ ] No canonical doc impact without update

### Gate 7: Brain Outcome Log

After completing any significant action:

Use the [shared governed memory contract](../allura-memory-skill/SKILL.md).
Discover the actual host schema, omit persona identity assertions and unsupported
metadata, and append one verified outcome only within authorized scope. Preserve
one server-supported idempotency key across retries; verify destination, principal,
record, content and receipt by read-back. If that contract cannot be met, report
the unmet gate and retain sanitized task evidence without claiming a Brain write.
Do not autonomously promote the result. Ordinary workflow execution grants no
production, configuration, tenant-transfer or semantic-promotion authority.

Event types: `ADR_CREATED`, `INTERFACE_DEFINED`, `TECH_STACK_DECISION`, `TASK_COMPLETE`, `BLOCKED`, `LESSON_LEARNED`

## Skill Routing Map

| Task | Primary Skill | Supporting |
|------|--------------|------------|
| DASH-12 Memory Lineage | `allura-dev-story` | `allura-graph-debug` |
| Story 2.3 Token Alias | `allura-dev-story` | `varlock`, `frontend-craft` |
| Story 2.4 Brand Polish | `frontend-craft` | `figma-use` |
| Story 2.6 Memory API Dedup | `allura-dev-story` | `systematic-debugging-memory` |
| Story 2.8 Pike Gate / Zod | `allura-dev-story` | `allura-code-review` |
| E2.1 WCAG Contrast | `frontend-craft` | — |
| E2.2 Promote Button | `allura-dev-story` | — |
| E2.3 Theme Switcher | `frontend-craft` | — |
| E2.4 Graph Targeting | `allura-graph-debug` → `allura-dev-story` | — |
| E2.5 LCP/FID Baseline | `allura-health-observability` | — |
| E3.1–E3.5 Hardening | `allura-dev-story` | `allura-code-review`, `allura-health-observability` |
| E4.1–E4.5 Control Plane | `allura-dev-story` (per syscall) | — |
| E5.1–E5.5 Infra | `allura-dev-story` | — |
| CARD-SHOWCASE-A | `figma-generate-design` → `allura-dev-story` | — |

## Allura Skill Routing

For Allura Memory repo work, use the `allura-*` skills — they are the canonical workflow skills for this repo.

| Task | Allura Skill | Notes |
|------|-------------|-------|
| Story implementation | `allura-dev-story` | Full governance gates |
| Code review | `allura-code-review` | Pike/Fowler review gates |
| Architecture decisions | `allura-architecture` | Brooks gate + ADR logging |
| PRD creation | `allura-product-intake` | Jobs intent gate |
| Retrospective | `allura-retrospective` | Brooks facilitation |
| Party/parallel work | `party-mode` / `team-ram-cowork` | Allura-native |
| Sprint status | Notion board | Notion source of truth |

## Canonical Documentation Rule

The six canonical docs in `docs/allura/` are the only authoritative documentation surface:

1. `BLUEPRINT.md`
2. `SOLUTION-ARCHITECTURE.md`
3. `DESIGN-ALLURA.md`
4. `REQUIREMENTS-MATRIX.md`
5. `RISKS-AND-DECISIONS.md`
6. `DATA-DICTIONARY.md`

No new Markdown files may be added to `docs/allura/` without an approved `AD-##` entry. Evidence, reports, and scratchpads go to `docs/archive/allura/` or Allura Brain.

## Reflection

End every substantive final reply with this rendered Markdown footer. Fill fields
from actual evidence; no write or promotion is implied by reporting them.

**📝 Reflection**\
├─ **Action Taken:** Actual work and scope.\
├─ **Principle Applied:** The selected role's relevant judgment.\
├─ **Event Logged:** None, pending/unconfirmed, or verified event and receipt.\
├─ **Semantic Promotion:** None, pending/unconfirmed, or human-approved verified promotion.\
└─ **Confidence:** High/Medium/Low, with evidence and material limitations.
