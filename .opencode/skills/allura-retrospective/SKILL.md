---
name: allura-retrospective
description: "Allura-governed retrospective. Loads allura-team-ram gates with Brooks gate, Brain outcome logging, and Notion board update. Use when running retrospectives in the Allura Memory repo."
globs: ["src/**", "docs/allura/**", "guidelines/**"]
---

# Allura Retrospective — Governed Retrospective

> [!NOTE]
> **AI-Assisted Documentation** — workflow corrections follow the existing project authority contract; full human document review remains pending.


> **Allura-governed retrospectives.** Enforces Brooks gate, Brain outcome logging, Notion board update, and canonical doc impact checks.

## When to Use

Use this skill when running retrospectives in the Allura Memory repo.

Trigger phrases: `allura retrospective`, `run retrospective`, `retro the epic`, `allura retro`.

**Important:** Run retrospective only after every story in the epic is `Done`, unless Ronin explicitly asks for a partial retrospective.

## Prerequisites

This skill requires `allura-team-ram` to be loaded first. It enforces all seven gates defined there.

## Retrospective Authority

| Role | Agent | Responsibility |
|------|-------|---------------|
| Facilitator | Brooks | Orchestration, conceptual integrity, lessons extraction |
| Builder | Woz | Implementation lessons, what worked, what didn't |
| Reviewer | Pike/Fowler | Review process lessons, what to improve |

Brooks facilitates. The retrospective is about systems and processes, not blame.

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
   - query: "retrospective {epic} lessons outcomes blockers"
3. Check Notion board for epic/story completion status
4. Verify: every story in the epic is Done (or Ronin approved partial retro)
5. Synthesize: what was accomplished, what was blocked, what was learned
```

**Critical:** Do not run retrospective until all stories in the epic are `Done` in Notion.

### Step 3: Documentation Impact Check (Gate 2)

Retrospectives often produce lessons that should update canonical docs:

| Canonical Doc | Likely Impact |
|---------------|--------------|
| `BLUEPRINT.md` | New/changed business requirements from lessons learned |
| `SOLUTION-ARCHITECTURE.md` | Topology changes from architectural lessons |
| `DESIGN-ALLURA.md` | Constraint changes from implementation lessons |
| `REQUIREMENTS-MATRIX.md` | New requirements discovered during epic |
| `RISKS-AND-DECISIONS.md` | **Always** — new risks or decisions from retrospective |
| `DATA-DICTIONARY.md` | New fields/entities discovered during implementation |

Retrospectives **should** produce at least one `RK-##` entry in `RISKS-AND-DECISIONS.md`.

### Step 4: Team RAM Owner Assignment (Gate 3)

Assign retrospective roles:

| Role | Agent | Responsibility |
|------|-------|---------------|
| Facilitator | Brooks | Orchestration, lessons extraction |
| Builder | Woz | Implementation lessons |
| Reviewer | Pike/Fowler | Review process lessons |

### Step 5: Execute (Gate 4)

Execute retrospective with Allura context loaded:

1. **Epic Review**: What was accomplished, what was blocked, what was learned
2. **Lessons Extracted**: What went well, what didn't, what to change
3. **Action Items**: Concrete, achievable, with clear ownership
4. **Next Epic Preparation**: What to carry forward

**Two-part format:**
- Part 1: Epic Review (what happened)
- Part 2: Next Epic Preparation (what to do differently)

**Psychological safety rules:**
- No blame — focus on systems and processes
- Everyone contributes with specific examples
- Action items must be achievable with clear ownership

### Step 6: Notion Board Update (Gate 5)

After retrospective:

1. Update Notion epic status
2. Create action items as new work items
3. Link retrospective findings to Decision Log
4. Update Handoff Context with lessons learned

### Step 7: Validation Evidence (Gate 6)

Collect and verify:

- [ ] All stories in the epic are `Done` in Notion
- [ ] Lessons extracted are specific and actionable
- [ ] Action items have clear ownership and timeline
- [ ] At least one `RK-##` entry created in `RISKS-AND-DECISIONS.md`
- [ ] No canonical doc impact without planned update
- [ ] Brooks approval obtained (conceptual integrity check)

### Step 8: Brain Outcome Log (Gate 7)

Log the retrospective outcome to Allura Brain:

Use the [shared governed memory contract](../allura-memory-skill/SKILL.md).
Discover the actual host schema, omit persona identity assertions and unsupported
metadata, and append one verified outcome only within authorized scope. Preserve
one server-supported idempotency key across retries; verify destination, principal,
record, content and receipt by read-back. If that contract cannot be met, report
the unmet gate and retain sanitized task evidence without claiming a Brain write.
Do not autonomously promote the result. Ordinary workflow execution grants no
production, configuration, tenant-transfer or semantic-promotion authority.

## Retrospective-Specific Routing

| Phase | Primary Owner | Supporting |
|-------|--------------|------------|
| Epic Review | Brooks | Woz (implementation), Pike (interface) |
| Lessons Extraction | Brooks | All team members |
| Action Items | Brooks | Jobs (scope), Woz (implementation) |
| Next Epic Prep | Brooks | Jobs (acceptance), Woz (feasibility) |

## Failure Modes

| Failure | Response |
|---------|----------|
| Brain operation unavailable or pending | Report the observed operation/layer; continue independent local work; do not infer disconnection |
| Stories not all Done | Do not run retrospective. Flag which stories are incomplete. |
| Brooks unavailable | Postpone retrospective. Brooks must facilitate. |
| No lessons extracted | This is a failure. Every retrospective must produce at least one lesson. |

## Reflection

End every substantive final reply with this rendered Markdown footer. Fill fields
from actual evidence; no write or promotion is implied by reporting them.

**📝 Reflection**\
├─ **Action Taken:** Actual work and scope.\
├─ **Principle Applied:** The selected role's relevant judgment.\
├─ **Event Logged:** None, pending/unconfirmed, or verified event and receipt.\
├─ **Semantic Promotion:** None, pending/unconfirmed, or human-approved verified promotion.\
└─ **Confidence:** High/Medium/Low, with evidence and material limitations.
