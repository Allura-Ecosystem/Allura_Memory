# RunRecord Methodology

> A neutral run journal for governed AI work: goal, policy, evidence, validation, outcome.

RunRecord is Allura's first durable orchestration pattern. It is intentionally smaller than a workflow engine. It records what happened and what proof exists, while leaving execution to your agent runtime, CLI, or application.

Use RunRecord when a task is important enough that a future agent or human should be able to answer:

- What were we trying to do?
- Who or what ran it?
- What rules applied?
- What evidence was collected?
- What validation passed or failed?
- What should happen next?

---

## When To Use

Use RunRecord for:

- multi-step agent runs;
- architecture or code-review sessions;
- production-facing changes;
- memory promotion batches;
- workflows that may need resume/replay;
- any task where "Done" needs proof.

Do **not** use RunRecord for:

- one-off notes;
- casual chat;
- raw memory capture with no action;
- replacing your existing runtime or task tracker.

---

## Minimal Contract

```yaml
run_id: run_2026_06_05_example
title: Add governed approval tests
status: planned # planned | running | blocked | review | done | cancelled
group_id: allura-myteam
owner: alice
runtime: codex

goal:
  outcome: Targeted role/SoD/audit tests pass
  scope:
    in:
      - Add missing tests for approval boundaries
      - Run targeted validation command
    out:
      - Redesign approval API

policy:
  approval_required:
    - schema changes
    - production config changes
    - semantic memory promotion
  quality_gates:
    - context loaded
    - tests pass
    - review complete
  evidence_required:
    - changed files
    - validation output
    - review note

journal:
  - time: 2026-06-05T10:00:00Z
    actor: alice-agent
    event: context_loaded
    evidence: searched prior decisions and blockers

validation:
  commands:
    - bun test src/lib/memory/__tests__/approval-audit.test.ts
  result: pending

outcome:
  summary: null
  next_action: null
  memory_receipt: null
```

---

## Phases

### 1. Define the run

Write the goal in plain language. If the goal is unclear, stop and do product intake first.

Required fields:

- `run_id`
- `title`
- `group_id`
- `owner`
- `runtime`
- `goal.outcome`
- `goal.scope`

### 2. Attach policy

Policy says what the agent is allowed to do and where it must stop.

Minimum policy questions:

| Question | Example |
|---|---|
| What actions require approval? | database migration, config mutation, production deploy |
| What evidence proves progress? | diff, test output, screenshot, log receipt |
| What validation must pass? | targeted test command, typecheck, smoke test |
| What is explicitly out of scope? | API redesign, dashboard rebuild |

### 3. Run and journal

Append journal entries as the run proceeds. Do not rewrite history. If something changes, add a new entry.

Good journal entries are short:

```yaml
- time: 2026-06-05T10:15:00Z
  actor: codex
  event: validation_failed
  evidence: bun test failed on approval audit fixture setup
  next: inspect fixture factory before patching
```

### 4. Validate

Run the commands listed in `validation.commands`. If validation changes, journal why.

Validation is evidence, not decoration. Do not mark a run `done` without a passing check or an explicit accepted exception.

### 5. Close out

At closeout, write:

- summary;
- final status;
- validation result;
- remaining blockers;
- memory receipt or trace ID;
- next action.

---

## Governance Levels

| Level | Required RunRecord Fields |
|---|---|
| **Light** | goal, journal, outcome |
| **Review-gated** | goal, policy, journal, validation, reviewer note |
| **Evidence packet** | full contract, validation output, approval receipts, rollback notes |

Start light. Add stricter fields when the run can affect users, production, public docs, or canonical memory.

---

## First Example Prompt

Use this with any MCP-capable agent after Allura is connected:

```text
Create a RunRecord for this task:
- Goal: add targeted approval audit tests
- Scope: tests only; no API redesign
- Validation: bun test src/lib/memory/__tests__/approval-audit.test.ts
- Governance: stop for approval before schema/config changes

Search Allura memory first for prior blockers, then keep a short journal and write a closeout memory when done.
```

---

## Relationship To Allura Memory

RunRecord is not a second memory store.

```text
RunRecord = the run journal and policy wrapper
PostgreSQL = append-only raw traces and receipts
Neo4j = curated long-term knowledge after review/promotion
Notion/task tracker = planning source of truth when your team uses one
```

The rule is simple: a RunRecord may cite memory, and memory may store a RunRecord outcome, but raw memory alone does not prove Done.

---

## Status

This methodology follows AD-35: **RunRecord template before methodology runtime**.

Current maturity: template and documentation pattern. A full runtime, doctor command, resume engine, or marketplace is intentionally out of scope until real builder use cases prove the need.
