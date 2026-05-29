# Solution Architecture: Allura

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model.
> Content has not yet been fully reviewed. This is a working design reference, not a final specification.
> When in doubt, defer to the source code, schemas, and team consensus.

This document covers Allura's deployment topologies, integration interfaces, and architectural constraints. The data model and API surface are defined in [BLUEPRINT.md](./BLUEPRINT.md).

---

## Table of Contents

- [1. Architectural Positioning](#1-architectural-positioning)
- [2. System Boundary and External Actors](#2-system-boundary-and-external-actors)
- [3. Logical Topologies](#3-logical-topologies)
- [4. Interface Catalogue](#4-interface-catalogue)
- [5. Risk-Architecture Traceability](#5-risk-architecture-traceability)
- [6. Key Architectural Constraints](#6-key-architectural-constraints)
- [7. References](#7-references)

---

## 1. Architectural Positioning

Allura is a **memory data plane** — it holds no business logic about what an agent does, only what an agent remembers. It is the authoritative source of truth for all agent memory within a tenant namespace.

| Consumer Class | Interaction Mode | Notes |
|---|---|---|
| AI Agents (Claude, GPT, etc.) | Brooks / Team RAM + skills | Skills enforce memory-first routing to packaged MCP servers |
| BMAD / Team RAM Planning | `_bmad/` + `_bmad-output/` | BMAD artifacts map intent, PRDs, architecture, epics, and stories to Team RAM owners |
| Dashboard UI | Sync REST | Next.js server actions → `/api/memory/` routes |
| DevOps / Admin | Docker Compose + MCP_DOCKER config | Deployment, configuration, and packaged MCP server activation |

Allura does **not** orchestrate agents, run workflows, or make decisions. It stores and retrieves memory. Period.

---

## 2. System Boundary and External Actors

```mermaid
graph TD
    subgraph Agents["AI Agents"]
        A1[Claude]
        A2[GPT / Any MCP Client]
    end

    subgraph Dashboard["Dashboard"]
        B1[Memory Viewer UI<br/>/memory]
    end

    subgraph Orchestration["Brooks / Team RAM"]
        C1[Brooks]
        C2[Memory Skills]
    end

    subgraph MCPServers["Packaged MCP Servers"]
        C3[neo4j-memory]
        C4[database-server]
        C5[neo4j-cypher<br/>(fallback)]
    end

    subgraph Allura["Allura"]
        C6[Next.js API<br/>api/memory/]
        C7[Memory Engine<br/>lib/memory/]
        C8[(PostgreSQL 16<br/>Episodic)]
        C9[(Neo4j 5.26<br/>Semantic)]
    end

    A1 --> C1
    A2 --> C1
    C1 --> C2
    C2 --> C3
    C2 --> C4
    C2 --> C5
    B1 -->|REST| C6
    C6 --> C7
    C7 --> C8
    C7 --> C9
    C3 --> C9
    C4 --> C8
    C5 --> C9
```

---

## 3. Logical Topologies

### 3.1 Agent Memory Recall (Primary Path)

An AI agent needs prior context. Brooks routes to the memory skill, which queries `neo4j-memory` first.

```mermaid
sequenceDiagram
    actor Agent
    participant Brooks as Brooks / Team RAM
    participant Skill as Memory Skill
    participant Memory as neo4j-memory
    participant N4J as Neo4j

    Agent->>Brooks: need context for task
    Brooks->>Skill: memory-first routing
    Skill->>Memory: recall approved insights
    Memory->>N4J: MATCH current Insight nodes
    N4J-->>Memory: ranked approved knowledge
    Memory-->>Brooks: current scoped context
    Brooks-->>Agent: approved memory context
```

**Key constraints:**
- `neo4j-memory` is the default first hop for reusable context
- Retrieval remains tenant-scoped via `group_id`
- No raw Cypher is needed when approved memory recall is sufficient

---

### 3.2 Evidence Escalation (Trace Verification)

If the agent needs provenance, audit detail, or incident evidence, Brooks adds `database-server` after memory recall.

```mermaid
sequenceDiagram
    actor Agent
    participant Brooks as Brooks / Team RAM
    participant Memory as neo4j-memory
    participant DB as database-server
    participant PG as PostgreSQL

    Agent->>Brooks: explain why / show evidence
    Brooks->>Memory: recall approved insight
    Brooks->>DB: query traces for same tenant/window
    DB->>PG: SELECT append-only events
    PG-->>DB: raw evidence rows
    Memory-->>Brooks: approved context
    DB-->>Brooks: trace evidence
    Brooks-->>Agent: merged context + provenance
```

**Key constraints:**
- `database-server` is for evidence and trace validation, not as the default memory interface
- PostgreSQL remains append-only and tenant-scoped
- Raw evidence may refine or contradict approved memory, but does not silently mutate it

---

### 3.3 Graph Escalation (Cypher Fallback)

If approved memory recall is insufficient and targeted graph traversal is required, Brooks adds `neo4j-cypher` as a read-only fallback.

```mermaid
sequenceDiagram
    actor Agent
    participant Brooks as Brooks / Team RAM
    participant Memory as neo4j-memory
    participant Cypher as neo4j-cypher
    participant N4J as Neo4j

    Agent->>Brooks: inspect lineage / relationships / schema
    Brooks->>Memory: try approved memory recall first
    Brooks->>Cypher: execute read-only scoped query
    Cypher->>N4J: MATCH / SHOW / traversal query
    N4J-->>Cypher: shaped graph results
    Cypher-->>Brooks: lineage or schema detail
    Brooks-->>Agent: memory context + graph detail
```

**Key constraints:**
- `neo4j-cypher` is never the first-choice memory interface
- Cypher queries are read-only and must remain tenant-scoped unless schema inspection is explicit
- Hand-written Cypher is reserved for targeted inspection, not normal memory recall

---

### 3.4 Governed Memory Write Path

```mermaid
sequenceDiagram
    actor Agent
    participant API as Next.js API / controlled endpoint
    participant Engine as Memory Engine
    participant PG as PostgreSQL
    participant N4J as Neo4j

    Agent->>API: memory_add / governed write request
    API->>Engine: validate scope and content
    Engine->>PG: INSERT append-only event
    Engine->>Engine: score content and check policy
    alt approved / auto path
        Engine->>N4J: create immutable insight node
    else gated path
        Engine->>PG: INSERT proposal pending review
    end
    API-->>Agent: write accepted with status metadata
```

**Key constraints:**
- Agents do not write through packaged MCP inspection servers
- Controlled service endpoints remain the only write path for governed memory changes
    - Neo4j writes preserve immutable lineage and approval policy
    - The Curator Approve CLI (`src/curator/approve-cli.ts`) is an alternative entry point to the same governed write path — it uses the same `createInsight()` code path as the API route, enforces the same invariants (group_id validation, SHAKE-256 witness hash, append-only events), and emits `notion_sync_pending` events for async Notion sync

---

### 3.4.1 RuVix Kernel Governance Contract

The RuVix kernel is the governance contract for Allura Brain. Every operation carries identity, scope, authority, evidence, and audit.

**Kernel invariant:** Every operation carries identity, scope, authority, evidence, and audit.

**The five questions:**

| Question | Required answer |
|---|---|
| who | `agent_id` + `session_id` |
| what scope | `group_id` + operation scope |
| what authority | mode, role, and approval state |
| what evidence | trace row, proposal, witness hash, or source event |
| what audit trail | append-only event record + lineage edge |

**12-rule summary**

| Rule | Invariant |
|---|---|
| RULE-001 Identity Scoping | Every operation is bound to `group_id`, `agent_id`, and `session_id`. |
| RULE-002 Mutation Provenance | Every mutation records who initiated it and why. |
| RULE-003 Append-Only Episodic | Raw traces are append-only; no in-place overwrite. |
| RULE-004 Semantic Promotion Gate | Semantic writes require promotion policy evaluation. |
| RULE-005 SUPERSEDES Versioning | Changed knowledge creates a new node linked by `SUPERSEDES`. |
| RULE-006 Root Cause Before Fix | Debugging must identify root cause before any fix is written. |
| RULE-007 Evidence Before Completion | Completion requires evidence, not assertion. |
| RULE-008 Secret Isolation | Secrets never leak into logs, traces, or semantic memory. |
| RULE-009 Governed Tool Surface | Only approved tools and routes may mutate governed state. |
| RULE-010 Fail Closed | Unknown, unsafe, or degraded states block mutation. |
| RULE-011 Tenant Isolation | `group_id` remains the hard namespace boundary. |
| RULE-012 HITL Gate | Human-in-the-loop approval is required where policy demands it. |

**Promotion mode architecture**

| Mode | Behavior | Threshold |
|---|---|---|
| `soc2` | Queue eligible memories for human approval; never auto-promote. | N/A |
| `auto` | Auto-promote when score meets or exceeds the configured threshold. | `AUTO_APPROVAL_THRESHOLD` (default `0.85`) |

The canonical kernel contract is stored as `RUVIX_KERNEL_CONTRACT_v1` in Neo4j, with 12 individual rule entries plus one anchor ADR in PostgreSQL.

### 3.4.2 Brand Governance Layer

The dashboard brand layer is a RuVix-enforced contract, not a design preference. It governs Allura Dashboard surfaces only.

| Brand Rule | Invariant |
|---|---|
| BRAND-001 | Durham token exclusivity: dashboard CSS may use only `--durham-*` custom properties; DD tokens (`dark-green`, `brand-gold`, `Poppins`, `Inter`, `Montserrat`) are forbidden. |
| BRAND-002 | Dashboard voice stays mission-control: no fake certainty, no marketing fluff, no DD voice patterns. |
| BRAND-003 | Claims are evidence-gated: no dashboard work is marked done until the screenshot packet, mobile pass, accessibility pass, and anti-drift audit exist. |
| BRAND-004 | Accessibility is mandatory: AA contrast, visible focus rings, and keyboard-operable flows are required with Durham tokens. |
| BRAND-005 | Component consistency is required: reuse `agency-card`, `metric-card`, `agency-badge`, and curator table patterns with Durham spacing rhythm. |
| BRAND-006 | Durham gate before ship: Aaker + Glaser + Munari must pass before the dashboard is released. |

**Enforcement pipeline:**

`Aaker review → Glaser review → Munari review → evidence collector → ship decision`

**Enforcement details:**

- Token enforcement rejects any dashboard style rule that is not expressed through the Durham token set.
- Voice enforcement rejects copy that reads like advertising, certainty theater, or unsupported claims.
- Completion enforcement requires evidence artifacts before any dashboard claim is promoted to done.
- Accessibility enforcement checks contrast, focus visibility, and keyboard navigation before merge.
- Component enforcement prefers the established Durham patterns over ad hoc variants.

Canonical brand policy artifact: [BRAND-RULES-dashboard-v2.md](./BRAND-RULES-dashboard-v2.md)

### 3.5 Dashboard Memory Viewer

Human operator uses the `/memory` page to inspect, search, and delete memories.

```mermaid
sequenceDiagram
    actor Human
    participant UI as Memory Viewer (/memory)
    participant API as Next.js API
    participant Engine as Memory Engine
    participant PG as PostgreSQL
    participant N4J as Neo4j

    Human->>UI: load /memory
    UI->>API: GET /api/memory?userId=&groupId=
    API->>Engine: list(userId, groupId)
    Engine->>PG: SELECT recent events
    Engine->>N4J: MATCH Memory nodes
    API-->>UI: merged memory list

    Human->>UI: delete memory
    UI->>API: DELETE /api/memory/[id]
    API->>Engine: delete(id, groupId)
    Engine->>PG: INSERT event (memory_delete)
    Engine->>N4J: SET deprecated = true
    API-->>UI: 200 OK
    ```

---

### 3.6 Mission Control Dashboard Rebuild and Cutover

The Mission Control rebuild combines the existing Allura memory dashboard experience with a cockpit-style operator shell before replacing the current Docker dashboard.

| Surface | Architectural Role | Constraint |
|---------|--------------------|------------|
| `localhost:6420` | Visual/reference memory dashboard | Preserve memory search, insights, traces, provenance, extracted facts, agents, approvals, and settings behavior |
| `localhost:3334` | Mission Control development integration target | Build and validate combined cockpit + memory surface here first |
| `localhost:3100` | Current Docker dashboard | Do not replace until cutover gates pass |

```mermaid
flowchart LR
    A[6420 Reference<br/>Memory dashboard UX] --> C[3334 Mission Control<br/>Development integration]
    B[Native Allura Kanban<br/>Planning truth] --> C
    D[Allura Brain APIs<br/>Memory truth] --> C
    E[Resource Manifest<br/>Inventory truth] --> C
    C -->|validated cutover only| F[3100 Docker Dashboard<br/>Replacement target]
```

**Route ownership:**

| Mission Control Route | Backing Source of Truth | Write Policy |
|-----------------------|-------------------------|--------------|
| `/command` | Aggregated adapter summaries | Read-only first version |
| `/work-board` | Native Allura Kanban | Governed board writes only; external sync adapters optional |
| `/agents` | OpenClaw/Symphony/TALON/IRIS/Team RAM runtime adapters | Runtime actions only through approved adapter actions |
| `/telemetry` | Runtime/tool/model telemetry adapters | No mutation |
| `/allura` | Allura Brain APIs | Governed memory actions only; no direct substrate writes |
| `/resources` | `RESOURCE-MANIFEST.md` or generated manifest endpoint | Read-only inventory and drift warnings |

**Cutover gates for replacing `3100`:** route parity, visual parity, source-of-truth parity, adapter declarations, no fabricated live data, authenticated/unauthenticated validation, smoke tests, and rollback command documentation.

---

## 4. Interface Catalogue

| Interface | Direction | Channel | Payload / Contract | Risk / Decision |
|---|---|---|---|---|
| AI Agent via Brooks / Team RAM | Inbound | Skills + packaged MCP servers | `neo4j-memory` first, `database-server` for evidence, `neo4j-cypher` only when needed | AD-23, AD-03 |
| Dashboard UI | Inbound | REST HTTP | JSON — memory records | AD-05 |
| Mission Control UI | Inbound | REST HTTP + adapter contracts | Route-scoped cockpit, work-board, agent, telemetry, Allura, and resource contracts | AD-29, RK-19 |
| Native Allura Kanban | Inbound | REST HTTP + PostgreSQL-backed service contract | Default planning/work item source of truth | F43, AD-31 |
| Board Sync Adapters | Outbound | Provider APIs | Optional Notion, Linear, and GitHub Projects projections of native board state | F43, AD-31 |
| Resource Manifest Adapter | Outbound | File or generated endpoint | Skills, agents, MCP servers, containers, cron jobs, drift warnings | F44, AD-29 |
| Curator Approve CLI | Inbound | CLI (`bun run curator:approve`) | Processes pending proposals from PostgreSQL, promotes approved ones to Neo4j via `createInsight()` | F6, B18, B19 |
| PostgreSQL 16 | Outbound | TCP (pg driver) | SQL — append-only INSERTs + SELECTs | AD-01, RK-02 |
| Neo4j 5.26 | Outbound | Bolt (neo4j driver) | Approved memory recall + read-only Cypher fallback + governed writes | AD-02, RK-01, AD-23 |

---

## 5. Risk-Architecture Traceability

| Section | Risks and Decisions Addressed |
|---|---|
| §3.1 Primary Memory Recall | AD-23 (skills-first packaged MCP), AD-19 (controlled retrieval intent) |
| §3.2 Evidence Escalation | AD-01 (Postgres for episodic), RK-02 (tenant isolation in queries) |
| §3.3 Graph Escalation | AD-02 (Neo4j for semantic), AD-23 (read-only graph fallback) |
| §3.4 Governed Memory Write Path | AD-04 (promotion mode), RK-01 (dedup), RK-03 (low-quality promotion) |
| §3.5 Dashboard Viewer | AD-05 (5-tool surface) |
| §3.6 Mission Control Dashboard Rebuild and Cutover | AD-29 (dashboard rebuild cutover), RK-19 (route/source-of-truth drift) |

---

## 6. Key Architectural Constraints

| Constraint | Rationale |
|---|---|
| Every operation MUST include a valid `group_id` matching `^allura-` | Tenant isolation enforced at schema level — AD-06 |
| Postgres rows MUST NOT be updated or deleted | Append-only audit trail — AD-01 |
| Neo4j nodes MUST NOT be edited in place | SUPERSEDES versioning preserves full lineage — AD-02 |
| Neo4j writes MUST be preceded by a dedup check | Prevents knowledge graph bloat — RK-01 |
| `PROMOTION_MODE=soc2` MUST prevent all autonomous Neo4j writes | Regulatory compliance gate — AD-04 |
| Circuit breaker MUST trip before budget exhaustion | Prevents agent runaway — kernel/circuit-breaker |
| Mission Control MUST NOT replace `3100` until cutover gates pass | Prevents production dashboard regression and preserves rollback path — AD-29 |
| Mission Control routes MUST declare source of truth and degraded behavior | Prevents silent drift, fabricated data, and competing planning/memory surfaces — RK-19 |

---

## 7. References

### Dashboard v2 condensed topology

`/dashboard` consumes existing dashboard API/query/mapper boundaries rather than raw database shapes:

```text
Next.js route
  → src/lib/dashboard/query helper
  → controlled API endpoint
  → PostgreSQL / Neo4j through application service
  → mapper + Zod validation
  → DashboardResult<T>
  → UI state
```

Authoritative implementation boundary: `src/lib/dashboard/api.ts`, `src/lib/dashboard/queries.ts`, `src/lib/dashboard/mappers.ts`, `src/lib/dashboard/schemas.ts`, and `src/lib/dashboard/types.ts`.

Curator action topology:

```text
approveProposal → POST /api/curator/approve
denyProposal    → POST /api/curator/reject
needsEvidence   → POST /api/curator/reject with rationale prefix "Needs evidence: "
```

Native Kanban direction: PostgreSQL owns operational board state; Neo4j may project semantic relationships; Allura Brain stores durable decisions/evidence receipts. Notion, Linear, and GitHub Projects are optional sync adapters; Native Allura Kanban is default upstream.

Cutover topology: `6420` is historical visual/reference only, `3334` is retired development integration evidence, and `3100` is the canonical local dashboard target. Replacing `3100` requires route, visual, adapter/source-of-truth, auth, smoke, no-fabricated-data, review, rollback, and Captain approval evidence.

- [BLUEPRINT.md](./BLUEPRINT.md) — Core data model, API surface, execution rules
- [DATA-DICTIONARY.md](./DATA-DICTIONARY.md) — Field-level definitions
- [RISKS-AND-DECISIONS.md](./RISKS-AND-DECISIONS.md) — AD-## and RK-## entries
- [TEAM-RAM-BMAD-INTEGRATION.md](./TEAM-RAM-BMAD-INTEGRATION.md) — Team RAM, BMAD, and Allura Brain operating contract
- `.opencode/skills/allura-memory-skill/` — memory workflow rules
- `.opencode/skills/memory-client/` — default retrieval behavior
- `.opencode/skills/mcp-docker-memory-system/` — packaged MCP server discovery/configuration guidance
- `src/lib/memory/` — Memory engine
- `src/lib/dedup/` — Deduplication logic

---

## 8. Integration Plan

### 8.1 Deployment Scenarios

#### Scenario 1: Local Development (Packaged MCP Servers)

```bash
# Terminal 1: API server
bun run api

# Attach packaged MCP servers through MCP_DOCKER as needed:
# - neo4j-memory
# - database-server
# - neo4j-cypher (only if needed)
```

#### Scenario 2: Skills + External MCP Server Activation

```bash
Use `MCP_DOCKER_mcp-find`, `MCP_DOCKER_mcp-config-set`, and `MCP_DOCKER_mcp-add`
to activate the packaged server set required for the current task.
```

#### Scenario 3: Containerized Core Stack

```yaml
# docker-compose.yml
services:
  web:
    build: .
    command: bun run start
    environment:
      - POSTGRES_DB=...
      - NEO4J_URI=...
```

### 8.2 Runtime Layers

**Brooks orchestrates. Skills decide. Packaged MCP servers execute.**

```
Brooks / Team RAM
├─ memory-client
├─ allura-memory-skill
└─ mcp-docker-memory-system
    ↓
    ├─ neo4j-memory      (primary approved-memory recall)
    ├─ database-server   (trace and audit evidence)
    └─ neo4j-cypher      (read-only fallback)
```

### 8.3 Implementation Phases

| Phase | Component | Status |
|-------|-----------|--------|
| 1 | Skills-first runtime contract | ✅ Complete |
| 2 | Packaged `neo4j-memory` + `database-server` integration | ✅ Complete |
| 3 | Read-only `neo4j-cypher` fallback | ✅ Complete |
| 4 | Brooks staged routing (memory first, evidence second, Cypher last) | In Progress |
| 5 | Legacy custom MCP removal from runtime docs and config | Planned |
| 6 | Phase 6 deliverables (DLQ, Notion sync, auth, CSV, Sentry, CORS) | ✅ Complete (AD-25) |
| 7 | Curator pipeline E2E validation | Planned (RK-14) |
| 8 | Graph-Notion sync hardening | Planned (RK-16) |
| 9 | Dashboard API shape validation (Zod + mapper tests) | Planned (RK-17) |

### 8.4 Success Metrics

- ✓ Skills route normal recall to `neo4j-memory` first
- ✓ `database-server` is used for evidence, not default recall
- ✓ `neo4j-cypher` is reserved for read-only graph fallback
- ✓ Core stack remains deployable independently of a custom monolithic MCP runtime

---

## 9. Validation Topology (merged)

This section carries forward the essential validation topology from the retired standalone validation diagrams artifact.

### 9.1 Validation slice architecture

```mermaid
graph TD
    subgraph "Validation Slice"
        A[RalphLoop] --> B[Validation Feature Set]
        B --> C[Auto Mode Check]
        B --> D[SOC2 Mode Check]
        B --> E[Evidence Collection]
        C --> F[Next.js API]
        D --> F
        F --> G[(PostgreSQL)]
        F --> H[RuVixKernel]
        H --> G
        E --> G
        E --> I[(Neo4j)]
        E --> J[Validation Report]
        J --> K[Human Judge]
    end
```

### 9.2 Validation state machine

```mermaid
stateDiagram-v2
    [*] --> Start
    Start --> AutoMode
    AutoMode --> AutoVerify
    AutoVerify --> SOC2Mode: pass
    AutoVerify --> Fail: fail
    SOC2Mode --> SOC2Verify
    SOC2Verify --> Evidence: pass
    SOC2Verify --> Fail: fail
    Evidence --> Report
    Report --> Complete: all checks pass
    Report --> Fail: any check fails
    Complete --> [*]
    Fail --> [*]
```

### 9.3 Validation constraints

| Constraint | Enforcement |
|---|---|
| `group_id` required | PostgreSQL schema check + request validation |
| Append-only traces | No UPDATE/DELETE contract on events |
| `trace_ref` integrity in SOC2 | FK and numeric verification |
| Human gate per slice | Explicit reviewer sign-off before progression |
