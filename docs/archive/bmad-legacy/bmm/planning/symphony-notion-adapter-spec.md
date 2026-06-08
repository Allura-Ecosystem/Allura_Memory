# Symphony × Notion × Team RAM — Adapter Spec

> **Status:** Draft
> **Date:** 2026-06-06
> **Author:** Brooks (orchestrator) for Sabir
> **Purpose:** Use Notion as the Symphony Task Source until the Allura app Kanban surface is built.
> **Renumber note (2026-06-06):** UX Polish stories are **Epic 11** (not Epic 8 — Epic 8 is the completed live-Brain-wiring epic). Seed backlog below updated accordingly.

---

## 1. Notion Database Schema

Create a Notion database called **"Allura Symphony Board"** with these properties:

| Property | Type | Values / Format | Maps to Symphony |
|---|---|---|---|
| **Title** | Title | Task name | `task.title` |
| **Status** | Status | Backlog → Ready → In Progress → Review → Done → Rejected | `task.status` |
| **Agent** | Select | Brooks, Woz, Knuth, Bellard, Carmack, Fowler, Hightower, Pike, Scout, Jobs | `task.assignee` |
| **Priority** | Select | P0-Critical, P1-High, P2-Medium, P3-Low | `task.priority` |
| **Epic** | Select | Epic 9–Truthfulness, Epic 10–Orchestration, Epic 11–UX Polish, Infra, Brain | `task.epic` |
| **Repo** | Select | allura-memory, allura-app, brand-maker | `task.repo` |
| **Branch** | Rich Text | auto-generated branch name | `task.branch` |
| **PR URL** | URL | GitHub PR link | `proof.pr_url` |
| **CI Status** | Select | Passing, Failing, Running, None | `proof.ci_status` |
| **Proof Summary** | Rich Text | What changed, which files, impact | `proof.summary` |
| **Complexity** | Select | Trivial, Small, Medium, Large, XL | `proof.complexity` |
| **Brain Receipt** | Rich Text | Allura Brain memory ID | `proof.brain_receipt` |
| **Blocked By** | Relation | Self-relation to this database | `task.blocked_by` |
| **Due Date** | Date | Optional deadline | `task.due_date` |
| **Session ID** | Rich Text | Allura session ID that worked this task | `task.session_id` |
| **Governance Gate** | Checkbox | Requires HITL approval before merge | `task.hitl_required` |

### Status State Machine

```
Backlog ──→ Ready ──→ In Progress ──→ Review ──→ Done
                          │              │
                          │              └──→ Rejected ──→ Ready (rework)
                          │
                          └──→ Blocked (set via Blocked By relation)
```

**Rules:**
- Only tasks in **Ready** are picked up by the orchestrator
- **In Progress** means an agent has claimed it — `Agent` property is set
- **Review** requires proof artifacts (PR URL, CI Status, Proof Summary)
- **Done** requires human approval (HITL gate)
- **Rejected** cycles back to Ready with feedback in Proof Summary

---

## 2. Adapter Interface

The adapter translates between Notion's API and Symphony's task model.

### Core Methods

```typescript
interface NotionTaskSource {
  getNextTask(agentFilter?: string): Promise<SymphonyTask | null>;
  claimTask(taskId: string, agent: string, sessionId: string): Promise<void>;
  updateStatus(taskId: string, status: TaskStatus): Promise<void>;
  submitProof(taskId: string, proof: ProofOfWork): Promise<void>;
  listByStatus(status: TaskStatus): Promise<SymphonyTask[]>;
}

type TaskStatus = 'Backlog' | 'Ready' | 'In Progress' | 'Review' | 'Done' | 'Rejected';

interface SymphonyTask {
  id: string;               // Notion page ID
  title: string;
  status: TaskStatus;
  agent: string | null;
  priority: string;
  epic: string;
  repo: string;
  branch: string | null;
  blockedBy: string[];       // Notion page IDs
  dueDate: string | null;
  governanceGate: boolean;
}

interface ProofOfWork {
  prUrl: string;
  ciStatus: 'Passing' | 'Failing' | 'Running';
  summary: string;
  complexity: string;
  brainReceipt: string;
}
```

### Implementation via MCP

All Notion operations use the existing `MCP_DOCKER` Notion tools:

| Method | MCP Tool | Operation |
|---|---|---|
| `getNextTask()` | `notion-query-database-view` | Filter: Status = "Ready", Sort: Priority ASC |
| `claimTask()` | `notion-update-page` | Set Agent, Status → "In Progress", Session ID |
| `updateStatus()` | `notion-update-page` | Set Status property |
| `submitProof()` | `notion-update-page` | Set PR URL, CI Status, Proof Summary, Brain Receipt |
| `listByStatus()` | `notion-query-database-view` | Filter by Status value |

### Polling Loop

```
every 60s:
  task = getNextTask()
  if task:
    agent = routeToAgent(task)        # Brooks routing logic
    claimTask(task.id, agent, sessionId)
    spawnAgent(agent, task)           # Claude Code / Codex run
```

---

## 3. Team RAM → Symphony Agent Mapping

| Task Signal | Routes To | Symphony Runner Config |
|---|---|---|
| Title contains "schema", "migration", "query" | Knuth | `model: sonnet`, read DB docs first |
| Title contains "implement", "build", "feature" | Woz | `model: sonnet`, full write access |
| Title contains "CI", "deploy", "docker", "infra" | Hightower | `model: opus`, IaC only |
| Title contains "refactor", "tech debt", "cleanup" | Fowler | `model: opus`, incremental changes |
| Title contains "perf", "latency", "optimize" | Carmack | `model: sonnet`, benchmark first |
| Title contains "debug", "fix", "broken" | Bellard | `model: sonnet`, reproduce first |
| Title contains "design", "architecture", "ADR" | Brooks | `model: opus`, plan only (no impl) |
| Title contains "scope", "requirements", "accept" | Jobs | `model: opus`, gate only |
| Default / unclear | Scout → Brooks | Recon first, then route |

**Routing override:** The `Agent` property in Notion can be pre-set manually to force routing.

---

## 4. Governance Integration

| Invariant | How Enforced |
|---|---|
| `group_id` on every DB op | Agent CLAUDE.md / CODEX.md includes the rule |
| Append-only PostgreSQL | Agent cannot UPDATE/DELETE — CI test catches violations |
| SUPERSEDES versioning | Agent rules include the Neo4j pattern |
| HITL for promotion | Tasks with `Governance Gate = true` require human Review before Done |
| Brain receipt required | `submitProof()` must include `brainReceipt` — adapter validates |

### Proof Validation Rules

```typescript
function validateProof(proof: ProofOfWork): string[] {
  const errors: string[] = [];
  if (!proof.prUrl) errors.push('PR URL required');
  if (!proof.ciStatus) errors.push('CI status required');
  if (proof.ciStatus === 'Failing') errors.push('CI must be passing');
  if (!proof.summary || proof.summary.length < 20) errors.push('Proof summary too short');
  if (!proof.brainReceipt) errors.push('Brain receipt required');
  return errors;
}
```

---

## 5. Migration Path: Notion → Allura App Kanban

1. **Same interface** — `NotionTaskSource` becomes `BrainTaskSource`, same methods
2. **Data migration** — One-time script reads all Notion tasks, writes to Brain as episodic memories with kanban metadata
3. **Dual-write period** — Both sources stay in sync for 1 week while validating
4. **Cutover** — Swap the adapter, archive the Notion database

The adapter pattern means zero orchestrator changes at cutover.

---

## 6. Quick Start

### Step 1: Create Notion Database
Use the schema in Section 1. Set up a "Board" view grouped by Status.

### Step 2: Seed with Reprioritized Backlog (governance-first order)

| Title | Status | Priority | Epic | Story |
|---|---|---|---|---|
| Build governance MCP API surface | Ready | P0-Critical | Epic 9 | 9.1 |
| Build audit MCP API surface | Ready | P0-Critical | Epic 9 | 9.2 |
| Build integration test harness (DoD enforcement) | Ready | P1-High | Epic 9 | 9.3 |
| Wire Memory Add modal to memory_add | Ready | P1-High | Epic 9 | 9.4 |
| Wire Settings capabilities to config store | Ready | P1-High | Epic 9 | 9.5 |
| Implement Notion Symphony adapter | Ready | P1-High | Epic 10 | 10.1 |
| Wire Kanban surface to Notion task source | Backlog | P2-Medium | Epic 10 | 10.2 |
| Wire Dreams/scheduled tasks backend | Backlog | P2-Medium | Epic 10 | 10.3 |
| Build chat runtime (streaming, history, model select) | Backlog | P2-Medium | Epic 10 | 10.4 |
| Command Palette (Cmd+K) | Backlog | P3-Low | Epic 11 | 11.1 |
| Toast notification system | Backlog | P3-Low | Epic 11 | 11.2 |
| Dark mode (CSS custom properties) | Backlog | P3-Low | Epic 11 | 11.3 |
| Kanban drag-drop polish | Backlog | P3-Low | Epic 11 | 11.4 |
| UX motion & transitions | Backlog | P3-Low | Epic 11 | 11.5 |
| Mobile polish | Backlog | P3-Low | Epic 11 | 11.6 |

### Step 3: Write the Adapter
Implement `NotionTaskSource` in TypeScript using MCP_DOCKER Notion tools. Location: `src/integrations/symphony/notion-task-source.ts` (Story 10.1).

### Step 4: Wire the Polling Loop
Create `src/integrations/symphony/orchestrator.ts` with the 60s polling loop from Section 2.

### Step 5: Test with One Task
Move "Build governance MCP API surface" to Ready. Verify the orchestrator picks it up, routes to the right agent, and proof flows back to Notion.

---

## References

- [Team RAM Routing](/.claude/rules/agent-routing.md)
- [Allura Governance Invariants](/CLAUDE.md)
- [Epic 9 — Truthfulness Infrastructure](epic-9-truthfulness-infrastructure.md)
- [Epic 10 — Orchestration & Runtime](epic-10-orchestration-runtime.md)
- [Epic 11 — UX Polish](epic-11-ux-polish.md)

---

> **Provenance:** Relocated from `docs/archive/allura/symphony-notion-adapter-spec.md` into `_bmad/bmm/planning/` on 2026-06-06; UX Polish renumbered Epic 8 → Epic 11.

---

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model.
> Content has been reviewed against architectural principles and should be kept in sync with source-of-truth docs.
> When in doubt, defer to code, schemas, and team consensus.
