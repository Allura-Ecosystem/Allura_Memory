---
name: allura-architecture
description: "Allura-governed architecture creation. Loads allura-team-ram gates with Brooks gate, Brain search, doc impact check, and ADR logging. Use when creating architecture decisions in the Allura Memory repo."
globs: ["src/**", "docs/allura/**", "guidelines/**"]
---

# Allura Architecture — Governed Architecture Creation

> [!NOTE]
> **AI-Assisted Documentation** — workflow corrections follow the existing project authority contract; full human document review remains pending.


> **Allura-governed architecture decisions.** Enforces Brooks gate, Brain search for prior decisions, canonical doc impact checks, and ADR logging to Allura Brain.

## When to Use

Use this skill when creating architecture decisions in the Allura Memory repo.

Trigger phrases: `allura architecture`, `create architecture`, `architecture decision`, `ADR`, `design decision`.

## Prerequisites

This skill requires `allura-team-ram` to be loaded first. It enforces all seven gates defined there.

## Architecture Authority

| Role | Agent | Responsibility |
|------|-------|---------------|
| Architect | Brooks | Conceptual integrity, contract boundaries, route approval |
| Data Architect | Knuth | Schema correctness, data integrity |
| Interface Review | Pike | API surface, simplicity |
| Intent Gate | Jobs | Scope control, acceptance criteria |

Brooks owns the final architecture decision. No architectural change proceeds without Brooks approval.

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
   - query: "ARCHITECTURE_DECISION {topic} blockers decisions outcomes"
3. Check for existing ADRs on the same topic
4. Synthesize: what's been decided, what's blocking, what alternatives were rejected
```

**Critical:** Before creating any new ADR, search Allura Brain for existing decisions on the same topic. Do not create duplicates.

### Step 3: Documentation Impact Check (Gate 2)

Architecture decisions almost always impact canonical docs. Check each:

| Canonical Doc | Likely Impact |
|---------------|--------------|
| `BLUEPRINT.md` | New/changed business requirements, core concepts |
| `SOLUTION-ARCHITECTURE.md` | New/changed actors, interfaces, topologies |
| `DESIGN-ALLURA.md` | New/changed API contracts, state machines, constraints |
| `REQUIREMENTS-MATRIX.md` | New/changed B# or F# traceability |
| `RISKS-AND-DECISIONS.md` | **Always** — new AD-## entry required |
| `DATA-DICTIONARY.md` | New/changed fields, entities, enums |

Architecture decisions **must** produce an `AD-##` entry in `RISKS-AND-DECISIONS.md`.

### Step 4: Team RAM Owner Assignment (Gate 3)

Assign architecture roles:

| Role | Agent | Responsibility |
|------|-------|---------------|
| Architect | Brooks | Conceptual integrity, final approval |
| Intent Gate | Jobs | Scope, acceptance criteria |
| Data Architect | Knuth | Schema correctness (if data model changes) |
| Interface Review | Pike | API surface (if interface changes) |

### Step 5: Execute (Gate 4)

Execute architecture creation with Allura context loaded:

1. **Init**: Gather context, define scope, identify stakeholders
2. **Discovery**: Collaborative step-by-step exploration of the problem space
3. **Decision**: Make architectural decisions with rationale, alternatives, consequences
4. **Document**: Produce ADR with all required fields:
   - Status (Decided/Proposed/Superseded/Deferred)
   - Decision
   - Rationale
   - Alternatives considered
   - Consequences
   - Owner
   - References

### Step 6: Operational Status and Planning Documents (Gate 5)

After architecture decision:

1. Read/update the related Allura work item only through an actual supported status capability; if unavailable, report status unknown and any intended transition unperformed.
2. Maintain the ADR reference and decision context in Notion only as separately authorized planning-document updates.
3. Do not infer operational status from Notion, Brain, the ADR, or local files.

### Step 7: Validation Evidence (Gate 6)

Collect and verify:

- [ ] ADR entry created in `RISKS-AND-DECISIONS.md` with all required fields
- [ ] ADR has a unique `AD-##` identifier
- [ ] ADR references affected canonical docs
- [ ] Brooks approval obtained (conceptual integrity check)
- [ ] No duplicate ADR exists in Allura Brain
- [ ] Canonical doc updates planned in same PR (if impacted)

### Step 8: Brain Outcome Log (Gate 7)

Log the architecture decision to Allura Brain:

Use the [shared governed memory contract](../allura-memory-skill/SKILL.md).
Discover the actual host schema, omit persona identity assertions and unsupported
metadata, and append one verified outcome only within authorized scope. Preserve
one server-supported idempotency key across retries; verify destination, principal,
record, content and receipt by read-back. If that contract cannot be met, report
the unmet gate and retain sanitized task evidence without claiming a Brain write.
Do not autonomously promote the result. Ordinary workflow execution grants no
production, configuration, tenant-transfer or semantic-promotion authority.

## ADR Template

Every architecture decision must follow this structure:

```markdown
### AD-##: {Title}

- **Status**: Decided | Proposed | Superseded | Deferred
- **Decision**: {What was decided}
- **Rationale**: {Why this decision was made}
- **Alternatives Considered**: {What other options were evaluated}
- **Consequences**: {What happens as a result}
- **Owner**: {Who owns this decision}
- **References**: {Links to related docs, ADRs, or discussions}
```

## Architecture-Specific Routing

| Decision Type | Primary Reviewer | Supporting |
|---------------|-----------------|------------|
| API contract change | Brooks | Pike |
| Data model change | Brooks | Knuth |
| Topology change | Brooks | Hightower |
| Security boundary | Brooks | Pike |
| Performance trade-off | Brooks | Bellard/Carmack |
| Integration pattern | Brooks | Hightower |

## Failure Modes

| Failure | Response |
|---------|----------|
| Brain operation unavailable or pending | Report the observed operation/layer; continue independent local work without claiming successful hydration. |
| Duplicate ADR found | Reference existing ADR. Do not create a duplicate. |
| Brooks unavailable | Architecture decision is Proposed, not Decided. Requires Brooks approval to become Decided. |
| Canonical doc impact | Plan doc update in same PR. Architecture decisions always impact RISKS-AND-DECISIONS.md. |

## Reflection

End every substantive final reply with this rendered Markdown footer. Fill fields
from actual evidence; no write or promotion is implied by reporting them.

**📝 Reflection**\
├─ **Action Taken:** Actual work and scope.\
├─ **Principle Applied:** The selected role's relevant judgment.\
├─ **Event Logged:** None, pending/unconfirmed, or verified event and receipt.\
├─ **Semantic Promotion:** None, pending/unconfirmed, or human-approved verified promotion.\
└─ **Confidence:** High/Medium/Low, with evidence and material limitations.
