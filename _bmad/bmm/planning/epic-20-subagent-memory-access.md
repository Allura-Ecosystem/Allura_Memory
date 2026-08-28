# Epic 20 — Subagent Memory Access — Hermes ↔ Allura Wiring

> [!NOTE]
> **AI-Assisted Documentation**
> This historical planning record was split from the prior combined epic rollup without changing its stated scope or acceptance content.
> Current delivery status is controlled by [`sprint-status.yaml`](../stories/sprint-status.yaml).
> When in doubt, defer to code, schemas, tests, and the authoritative sprint record.

**Lifecycle status:** Done — authoritative sprint status (retrospective complete)
**Owner:** Brooks (historical delivery record)
**group_id:** `allura-system`
**Migration note:** Source-preserving split from `epics.md` on 2026-08-28 to give every epic one planning file.

**Date:** 2026-07-26
**Status:** Approved
**Owner:** Brooks (orchestrator)
**group_id:** allura-system

**Goal:** Hermes subagents (via `delegate_task`) and external agents (Troy on laptop, OpenWork on desktop) must query Allura Brain before starting work and write outcomes back after completing. The infrastructure exists — the SONA trajectory engine records what happened, the MCP gateway exposes memory_add/search, and the control plane enforces group_id. What's missing is the wiring: subagent briefs don't include "query Allura first," and agent configs don't declare their group_id.

**Why now:** The memory plane has the engines (trajectory, genesis, curator, coherence) but they're fed only by direct MCP calls from Gilliam. Subagents and external agents are blind — they don't read prior work, don't write outcomes, and don't carry tenant identity. This makes the brain Gilliam's brain, not the crew's brain.

**Stories:**

- **20.1** Create `group_id` registry — a config file mapping agents to their default tenant (`allura-system`, `allura-faithmeats`, `allura-difference-driven`, `allura-coding`). File: `.opencode/config/group-id-registry.yaml`. Each agent entry has `default_group_id` and optional `allowed_group_ids` for cross-tenant agents.
- **20.2** Wire `delegate_task` brief template — update the BRIEF.md template (AGENTS.md §4) to include "Query Allura Brain for prior work on this topic" as step 1 and "Write your outcome to Allura Brain" as the final step. Add `group_id` to the delegate_task context payload so subagents inherit tenant identity.
- **20.3** Add `memory_search` + `memory_add` to subagent tool allowlists — the Hermes config `mcp_servers.allura_brain.tools.include` currently only allows Gilliam. Subagents need their own tool access or inherited access via `inherit_mcp_toolsets: true` (already set in delegation config). Verify this actually propagates to children.
- **20.4** Build a lightweight "memory brief" helper — a script or skill that an agent calls before starting work: `allura-brain memory_search --query "<task topic>" --group_id <tenant>`. Returns prior work, decisions, and blockers. Reduces token cost by filtering to relevant memories only.
- **20.5** Build a "memory writeback" helper — after task completion, an agent calls `allura-brain memory_add` with a structured payload: task summary, files changed, outcome (pass/fail), and key decisions. This feeds the trajectory engine and curator pipeline automatically.

**Exit gate:**
- Every `delegate_task` subagent queries Allura before starting and writes back after completing
- `group_id` is passed through the delegation chain — children inherit parent's tenant
- A subagent working on `allura-faithmeats` cannot read `allura-difference-driven` memories
- The trajectory engine records subagent work, not just Gilliam's direct calls
- Evidence: a delegate_task run shows memory_search before work and memory_add after completion
