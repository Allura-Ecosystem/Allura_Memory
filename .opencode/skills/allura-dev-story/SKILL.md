---
name: allura-dev-story
description: "Allura-governed story implementation. Loads allura-team-ram gates with Allura context, Brain search, doc impact check, and outcome logging. Use when implementing stories in the Allura Memory repo."
globs: ["src/**", "docs/allura/**", "guidelines/**"]
---

# Allura Dev Story — Governed Story Implementation

> [!NOTE]
> **AI-Assisted Documentation** — this file is maintained with AI assistance.
> Where it conflicts with the source code, schemas, or tests, defer to those.


> **Allura-governed story implementation.** This skill enforces the governance pattern defined in `allura-team-ram`.

## When to Use

Use this skill when implementing a story in the Allura Memory repo.

Trigger phrases: `allura dev story`, `implement story`, `dev story`, `allura implement`, `story implementation`.

## Prerequisites

This skill requires `allura-team-ram` to be loaded first. It enforces all seven gates defined there.

## Story readiness before implementation

Use [the canonical development gates](../../../docs/allura/REQUIREMENTS-MATRIX.md#development-slices-and-handoff-gates).
A packet must identify objective/non-goals, requirement and acceptance IDs, exact
source SHA and relevant dirty-diff digest, dependencies and approved/proposed
decisions, one writer, actual independent reviewers, authorized environment,
positive/negative/failure tests, receipts/read-back, rollback and completion gates.
Use **Ready**, **Needs a decision**, or **Blocked**, with the affected scope and
reason. Ready for inventory/preparation does not mean ready for implementation.
Do not advance unresolved AD-65–AD-68 proposals to approved decisions.

## Execution Protocol

### Step 1: Load Allura Core

Load `allura-team-ram` skill. This provides:
- Scout hydration protocol
- Documentation impact check
- Team RAM owner assignment
- Brain outcome logging
- Reflection protocol

### Step 2: Scout Hydration (Gate 1)

```
1. Read local context: CLAUDE.md, .opencode/, docs/allura/
2. Search Allura Brain:
   - group_id: "allura-system"
   - query: "{story topic} blockers decisions outcomes"
3. Check Notion board for story status
4. Synthesize: what's active, what's blocking, what was decided
```

If Scout subagent is unavailable, perform Scout protocol manually and state:
`Scout delegation unavailable; Brooks performed Scout protocol manually.`

### Step 3: Documentation Impact Check (Gate 2)

Before writing any code, check whether the story touches any of the six canonical docs:

| Canonical Doc | Impact Signal |
|---------------|---------------|
| `BLUEPRINT.md` | New/changed business requirements, core concepts |
| `SOLUTION-ARCHITECTURE.md` | New/changed actors, interfaces, topologies |
| `DESIGN-ALLURA.md` | New/changed API contracts, state machines, constraints |
| `REQUIREMENTS-MATRIX.md` | New/changed B# or F# traceability |
| `RISKS-AND-DECISIONS.md` | New architectural decisions or risks |
| `DATA-DICTIONARY.md` | New/changed fields, entities, enums |

If any doc is impacted, plan the update in the same PR.

### Step 4: Team RAM Owner Assignment (Gate 3)

Assign roles for this story:

| Role | Agent | Responsibility |
|------|-------|---------------|
| Intent Gate | Jobs | Acceptance criteria, scope |
| Architect | Brooks | Contracts, boundaries |
| Builder | Woz | Implementation |
| Interface Review | Pike | API surface, simplicity |
| Refactor Review | Fowler | Maintainability |
| Validation Execution | Ralph Loop | Bounded execution evidence; not final authority |

### Step 5: Execute (Gate 4)

Execute story implementation with Allura context loaded:

1. Read the story spec file (from Notion or local)
2. Load all context identified by Scout
3. Implement following the story spec
4. Write tests for acceptance criteria
5. Select and run the actual package-script test lane and `bun run typecheck`; verify nonzero discovery and report pass/fail/skip counts and exit codes. `bun test` is Bun’s native runner and is not the repository Vitest lane.

### Step 6: Notion Board Update (Gate 5)

After implementation:

1. Verify the actual board/work-item identity and current status; do not guess between similarly named boards.
2. Within existing authorization, attach evidence and update the relevant handoff.
3. Done/Approved transitions and Notion sync retain their separate approval gates. If access or authority is missing, report the exact pending update; local packets are not live board status.

### Step 7: Validation Evidence (Gate 6)

Collect and verify:

- [ ] Appropriate `bun run test:unit` / integration / curator / authorized live lane passes for affected tests; nonzero discovery verified
- [ ] `bun run typecheck` clean
- [ ] Acceptance criteria met (from story spec)
- [ ] Review approved (Pike for interface, Fowler for maintainability)
- [ ] No canonical doc impact without update
- [ ] Evidence artifact created

### Step 8: Brain Outcome Log (Gate 7)

Log the outcome to Allura Brain:

Use the [shared governed memory contract](../allura-memory-skill/SKILL.md).
Discover the actual host schema, omit persona identity assertions and unsupported
metadata, and append one verified outcome only within authorized scope. Preserve
one server-supported idempotency key across retries; verify destination, principal,
record, content and receipt by read-back. If that contract cannot be met, report
the unmet gate and retain sanitized task evidence without claiming a Brain write.
Do not autonomously promote the result. Ordinary workflow execution grants no
production, configuration, tenant-transfer or semantic-promotion authority.

## Story-Specific Routing

| Story | Primary Skill | Supporting |
|-------|--------------|------------|
| DASH-12 Memory Lineage | `allura-dev-story` | `allura-graph-debug` |
| 2.3 Token Alias | `allura-dev-story` | `varlock`, `frontend-craft` |
| 2.6 Memory API Dedup | `allura-dev-story` | `systematic-debugging-memory` |
| 2.8 Pike Gate / Zod | `allura-dev-story` | `allura-code-review` |
| E2.1–E2.5 Dashboard Quality | `allura-dev-story` | `frontend-craft`, `allura-health-observability` |
| E3.1–E3.5 Hardening | `allura-dev-story` | `allura-code-review` |
| E4.1–E4.5 Control Plane | `allura-dev-story` | — |
| E5.1–E5.5 Infra | `allura-dev-story` | — |

## Failure Modes

| Failure | Response |
|---------|----------|
| Brain operation unavailable or pending | Report the observed operation/layer; continue independent local work without claiming successful hydration. |
| Scout subagent unavailable | Perform Scout protocol manually. State: `Scout delegation unavailable; manual hydration.` |
| Notion MCP unavailable | Log warning. Continue with local sprint status. Flag for manual update. |
| Canonical doc impact detected | Plan doc update in same PR. Do not skip. |
| Validation fails | Do not mark story Done. Log blocker to Brain. |

## Reflection

End every substantive final reply with this rendered Markdown footer. Fill fields
from actual evidence; no write or promotion is implied by reporting them.

**📝 Reflection**\
├─ **Action Taken:** Actual work and scope.\
├─ **Principle Applied:** The selected role's relevant judgment.\
├─ **Event Logged:** None, pending/unconfirmed, or verified event and receipt.\
├─ **Semantic Promotion:** None, pending/unconfirmed, or human-approved verified promotion.\
└─ **Confidence:** High/Medium/Low, with evidence and material limitations.
