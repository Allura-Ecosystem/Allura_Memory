# Allura Library

> Public workflow chooser for builders who want governed AI memory, evidence, and repeatable agent processes.

Allura's library is not an internal Team RAM manual. It is where an outside builder chooses a workflow, connects it to their runtime, and decides how strict the governance should be.

Use it when raw `memory_add` / `memory_search` calls are not enough and you need a repeatable process with receipts.

---

## Choose Your Path

| I want to build… | Start with | Output |
|---|---|---|
| **A low-token context packet** | [Allura Scout](../plugins/allura-scout/README.md) | Relevant files, memories, risks, and route under a token budget |
| **A memory-enabled agent** | [Memory Operations](#memory-operations) | Searchable episodic memories with tenant isolation |
| **A feature/story workflow** | [Governed Story](#governed-story) | Story evidence packet, review notes, validation receipt |
| **An architecture decision process** | [Governed Architecture](#governed-architecture) | ADR, rationale, alternatives, Brain trace |
| **A code review gate** | [Governed Review](#governed-review) | Findings, severity, review evidence |
| **A product intake flow** | [Product Intake](#product-intake) | Goal, scope, acceptance criteria |
| **A repeatable run journal** | [RunRecord](./methodologies/runrecord.md) | Goal, policy, journal, evidence, outcome |
| **A promotion queue** | [Promotion Pipeline](#promotion-pipeline) | Raw trace → reviewed knowledge candidate |

---

## The Builder Recipe

Every Allura workflow follows the same small shape:

```text
1. Pick a workflow
2. Pick an adapter/runtime
3. Pick a governance level
4. Run the workflow
5. Store the outcome as memory + evidence
```

### 1. Pick a workflow

Choose from the methodology list below. Each workflow says what it is for, what evidence it produces, and which internal Allura skill can power it if you are using this repo's Team RAM setup.

If you are unsure what context matters, run **Allura Scout** first. Scout creates a small `ContextPacket` so the next agent does not waste tokens reading the whole repo.

### 2. Pick an adapter/runtime

Allura is MCP-native. You can use it from any runtime that can call MCP tools or HTTP endpoints.

| Runtime | Public guide |
|---|---|
| Claude Code | [`docs/user-guide/claude.md`](../docs/user-guide/claude.md) |
| Codex | [`docs/user-guide/codex.md`](../docs/user-guide/codex.md) |
| Claude + Codex cowork | [`docs/user-guide/cowork.md`](../docs/user-guide/cowork.md) |
| Cursor / MCP clients | [`catalog/adapters.md`](../catalog/adapters.md) |
| HTTP gateway | [`docs/reference/mcp-tools.md`](../docs/reference/mcp-tools.md) |

### 3. Pick a governance level

| Level | Use when | Rules |
|---|---|---|
| **Local receipts** | You are prototyping | Write memory + validation note; no promotion required |
| **Review-gated** | The memory may guide future agents | Queue or mark candidate knowledge for human review |
| **Evidence packet** | You are changing code, docs, policy, or public claims | Include goal, source, validation, reviewer, outcome, and rollback notes |

### 4. Run the workflow

Use your agent, CLI, or MCP client to execute the steps. Keep every important action tied to a `group_id`, `user_id`, and evidence note.

### 5. Store the outcome

At the end, write a short trace back to Allura Brain. Raw traces are evidence. Curated knowledge requires review/promotion.

---

## Methodologies

### Memory Operations

**Best for:** giving an agent durable context across sessions.

**Core tools:** `memory_add`, `memory_search`, `memory_get`, `memory_list`, `memory_delete`.

**Evidence produced:** who wrote the memory, tenant scope, source, timestamp, score, and retrieval result.

**Public example:** [`examples/README.md`](./examples/README.md)

**Internal support skill:** `.opencode/skills/allura-memory-skill/`

---

### Governed Story

**Best for:** implementing a feature without losing acceptance criteria, review evidence, or validation proof.

**Flow:**

1. Hydrate context and search prior memory.
2. Confirm story goal and acceptance criteria.
3. Implement the smallest useful slice.
4. Review interface and maintainability.
5. Run validation.
6. Store an evidence packet and closeout trace.

**Evidence produced:** story receipt, implementation summary, review findings, validation command output, outcome memory.

**Internal support skill:** `.opencode/skills/allura-dev-story/`

---

### Governed Architecture

**Best for:** decisions that affect contracts, data model, runtime boundaries, or public promises.

**Flow:**

1. Search prior decisions and blockers.
2. Separate essential complexity from accidental complexity.
3. Compare alternatives.
4. Write the decision and tradeoffs.
5. Update impacted canonical docs.
6. Store an architecture outcome trace.

**Evidence produced:** ADR, alternatives, tradeoffs, doc-impact list, memory receipt.

**Internal support skill:** `.opencode/skills/allura-architecture/`

---

### Governed Review

**Best for:** reviewing code changes before merge or handoff.

**Flow:**

1. Load diff and related decisions.
2. Check interface simplicity.
3. Check maintainability and reversibility.
4. Check tests and acceptance criteria.
5. Report findings first, then recommendations.
6. Store the review outcome.

**Evidence produced:** findings by severity, checked files, validation gaps, reviewer receipt.

**Internal support skill:** `.opencode/skills/allura-code-review/`

---

### Product Intake

**Best for:** turning an idea into a clear goal before building.

**Flow:**

1. Define the real user outcome.
2. Name what is in scope.
3. Name what is out of scope.
4. Write testable acceptance criteria.
5. Ask for sign-off before implementation.

**Evidence produced:** goal, scope, kill list, acceptance criteria, sign-off note.

**Internal support skill:** `.opencode/skills/allura-product-intake/`

---

### RunRecord

**Best for:** a repeatable run that should be resumed, audited, or reviewed later.

RunRecord is the bridge between raw memory and a full workflow engine. It records the run's goal, policy, evidence, runtime state, and outcome without making Allura depend on a foreign runtime.

**Start here:** [`methodologies/runrecord.md`](./methodologies/runrecord.md)

---

### Promotion Pipeline

**Best for:** deciding which raw traces are trustworthy enough to guide future agents.

**Flow:**

1. Capture raw evidence in PostgreSQL.
2. Score or mark the memory as promotion-worthy.
3. Review source, confidence, and conflicts.
4. Approve, reject, or request more evidence.
5. Promote approved knowledge to the semantic graph when the runtime supports it.

**Evidence produced:** proposal, reviewer rationale, approval/rejection receipt, lineage.

**Internal support skills:** `.opencode/skills/allura-propose-promotion/`, `.opencode/skills/allura-approve-promotion/`

---

## Shared Governance Gates

All workflows can use the same seven gates:

| Gate | Question |
|---|---|
| Context | Did the agent load relevant project and memory context? |
| Scope | Is the goal clear enough to execute? |
| Authority | Is this action allowed for this actor/runtime? |
| Evidence | What proves the claim? |
| Review | Does this need human or specialist approval? |
| Validation | What command/check proves it works? |
| Closeout | Was the result written back as a trace? |

See [`processes/shared/team-ram-gates.md`](./processes/shared/team-ram-gates.md) for the Allura repo's stricter internal gate form.

---

## Extend the Library

When adding your own methodology:

1. Name the user problem, not the internal skill.
2. Define the required evidence.
3. Define approval breakpoints.
4. Define validation commands or checks.
5. Add a short example.
6. Keep raw memory, curated knowledge, and Done evidence separate.

Community drafts can start in [`cradle/`](./cradle/). Stable workflows can move into `methodologies/` once they have examples and validation.

---

## Related Docs

- [`catalog/README.md`](../catalog/README.md) — public catalog and adapter index
- [`docs/user-guide/getting-started.md`](../docs/user-guide/getting-started.md) — install and first memory
- [`docs/reference/mcp-tools.md`](../docs/reference/mcp-tools.md) — tool reference
- [`docs/allura/BLUEPRINT.md`](../docs/allura/BLUEPRINT.md) — canonical architecture
