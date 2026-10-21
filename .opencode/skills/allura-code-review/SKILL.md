---
name: allura-code-review
description: "Allura-governed code review with Pike/Fowler gates, Brain outcome logging, and doc impact checks. Use for governed review, allura code review, or review with gates — not generic code review."
globs: ["src/**", "docs/allura/**", "guidelines/**"]
---

# Allura Code Review — Governed Code Review

> [!NOTE]
> **AI-Assisted Documentation** — workflow corrections follow the existing project authority contract; full human document review remains pending.


> **Allura-governed code review.** Enforces Pike/Fowler review gates, Brain outcome logging, and canonical doc impact checks before and after review.

## When to Use

Use this skill when reviewing code changes in the Allura Memory repo.

Trigger phrases: `allura code review`, `governed review`, `review with gates`, `allura review`.

## Prerequisites

This skill requires `allura-team-ram` to be loaded first. It enforces all seven gates defined there.

## Review Authority

| Reviewer | Focus Area | Gate |
|----------|-----------|------|
| Pike | Interface simplicity, API surface, source-of-truth clarity | Interface Gate |
| Fowler | Maintainability, token use, component boundaries | Refactor Gate |

Both reviewers must approve before the story can be marked Done.

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
   - query: "code review {topic} blockers decisions outcomes"
3. Check Notion board for review status
4. Synthesize: what's active, what's blocking, what was decided
```

### Step 3: Documentation Impact Check (Gate 2)

Before reviewing, check whether the changes impact any canonical docs:

| Canonical Doc | Impact Signal |
|---------------|---------------|
| `BLUEPRINT.md` | Changed business requirements |
| `SOLUTION-ARCHITECTURE.md` | Changed actors, interfaces, topologies |
| `DESIGN-ALLURA.md` | Changed API contracts, state machines |
| `REQUIREMENTS-MATRIX.md` | Changed B# or F# traceability |
| `RISKS-AND-DECISIONS.md` | New architectural decisions or risks |
| `DATA-DICTIONARY.md` | Changed fields, entities, enums |

If any doc is impacted, flag it in the review. Doc updates must be in the same PR.

### Step 4: Team RAM Owner Assignment (Gate 3)

Assign review roles:

| Role | Agent | Responsibility |
|------|-------|---------------|
| Interface Review | Pike | API surface, simplicity, source-of-truth clarity |
| Refactor Review | Fowler | Maintainability, token use, component boundaries |
| Architecture Review | Brooks | Conceptual integrity (if architectural change) |

### Step 5: Execute (Gate 4)

Execute code review with Allura context loaded:

1. Gather context (files changed, diff, related tests)
2. Launch parallel review layers:
   - **Blind Hunter**: Find bugs, security issues, logic errors
   - **Edge Case Hunter**: Walk every branching path and boundary condition
   - **Acceptance Auditor**: Verify acceptance criteria are met
3. Triage findings into categories:
   - 🔴 Critical (must fix before merge)
   - 🟡 Warning (should fix, not blocking)
   - 🟢 Suggestion (nice to have)
4. Present actionable results with file:line references

### Step 6: Notion Board Update (Gate 5)

After review:

1. Follow shared Gate 5: verify the board/work-item identity and existing update authority.
2. Attach actual findings and evidence within that scope; report missing access or approval.
3. Done/Approved status moves and Notion sync retain their separate approval gates; do not equate local review with live board status.

### Step 7: Validation Evidence (Gate 6)

Collect and verify:

- [ ] All 🔴 Critical findings addressed or explicitly deferred with rationale
- [ ] Appropriate package-script Vitest lane passes for affected files with nonzero discovery, pass/fail/skip counts and exit codes; native `bun test` is not equivalent
- [ ] `bun run typecheck` clean
- [ ] No canonical doc impact without planned update
- [ ] Review approval from Pike (interface) and/or Fowler (maintainability)
- [ ] Evidence artifact created (review notes, triage results)

### Step 8: Brain Outcome Log (Gate 7)

Log the review outcome to Allura Brain:

Use the [shared governed memory contract](../allura-memory-skill/SKILL.md).
Discover the actual host schema, omit persona identity assertions and unsupported
metadata, and append one verified outcome only within authorized scope. Preserve
one server-supported idempotency key across retries; verify destination, principal,
record, content and receipt by read-back. If that contract cannot be met, report
the unmet gate and retain sanitized task evidence without claiming a Brain write.
Do not autonomously promote the result. Ordinary workflow execution grants no
production, configuration, tenant-transfer or semantic-promotion authority.

## Review-Specific Routing

| Change Type | Primary Reviewer | Supporting |
|-------------|-----------------|------------|
| API contract change | Pike | Brooks (if architectural) |
| UI/component change | Pike | Fowler |
| Database/schema change | Knuth | Pike |
| Performance change | Bellard/Carmack | Fowler |
| Security change | Pike | Brooks |
| Refactoring | Fowler | Pike |
| Documentation change | Brooks | — |

## Failure Modes

| Failure | Response |
|---------|----------|
| Brain operation unavailable or pending | Report the observed operation/layer; continue independent local work; do not infer disconnection |
| Pike/Fowler unavailable | Note in review. Do not mark as approved without review. |
| Canonical doc impact detected | Flag in review. Require doc update in same PR. |
| Critical findings | Do not approve. Require fix before merge. |

## Reflection

End every substantive final reply with this rendered Markdown footer. Fill fields
from actual evidence; no write or promotion is implied by reporting them.

**📝 Reflection**\
├─ **Action Taken:** Actual work and scope.\
├─ **Principle Applied:** The selected role's relevant judgment.\
├─ **Event Logged:** None, pending/unconfirmed, or verified event and receipt.\
├─ **Semantic Promotion:** None, pending/unconfirmed, or human-approved verified promotion.\
└─ **Confidence:** High/Medium/Low, with evidence and material limitations.
