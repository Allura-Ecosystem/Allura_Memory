<p align="center">
  <img src="public/readme/allura-wordmark.png" alt="Allura Memory" width="190" />
</p>

<h1 align="center">Governed Memory Infrastructure for AI Agents</h1>

<p align="center">
  <a href="https://github.com/Allura-Ecosystem/Allura_Memory/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/Allura-Ecosystem/Allura_Memory/ci.yml?branch=main&label=CI&style=flat-square&color=0D47A1" alt="CI" /></a>
  <a href="https://github.com/Allura-Ecosystem/Allura_Memory/actions/workflows/check.yml"><img src="https://img.shields.io/github/actions/workflow/status/Allura-Ecosystem/Allura_Memory/check.yml?branch=main&label=Check&style=flat-square&color=0D47A1" alt="Check" /></a>
  <a href="https://github.com/Allura-Ecosystem/Allura_Memory/actions/workflows/integration-tests.yml"><img src="https://img.shields.io/github/actions/workflow/status/Allura-Ecosystem/Allura_Memory/integration-tests.yml?branch=main&label=Integration&style=flat-square&color=0D47A1" alt="Integration Tests" /></a>
  <a href="https://github.com/Allura-Ecosystem/Allura_Memory/blob/main/LICENSE"><img src="https://img.shields.io/github/license/Allura-Ecosystem/Allura_Memory?style=flat-square&color=14BA4B" alt="MIT license" /></a>
</p>

<p align="center">
  <strong>Self-hosted memory, review-gated knowledge, and auditable retrieval.</strong><br/>
  Allura captures what agents do, preserves the evidence, and returns approved context with provenance.
</p>

<p align="center">
  <a href="#why-allura-memory">Why Allura</a> ·
  <a href="#product-walkthrough">Product walkthrough</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="#getting-started">Getting started</a> ·
  <a href="#mcp-api">MCP API</a> ·
  <a href="#operations">Operations</a> ·
  <a href="#documentation">Documentation</a>
</p>

---

<p align="center">
  <a href="docs/portfolio/allura-agentic-framework-harness/assets/product-visuals/framework-and-harness.png"><img src="docs/portfolio/allura-agentic-framework-harness/assets/product-visuals/framework-and-harness.png" alt="Allura Agentic AI Framework and Harness: governed memory, controlled workflows, MCP tools, and evidence plus evaluation on PostgreSQL." width="860" /></a>
</p>

## Product walkthrough

The deployed [Epic 25 interactive demo](https://allura-governed-demo.vercel.app) is the visual walkthrough for this repository. It uses synthetic specimen data and explicitly does not claim a live connection, production authorization, or an automated decision.

- **Command Center** — inspect a review packet before a qualified person acts.
- **Framework & Harness** — show fail-closed boot, database-enforced boundaries, deterministic replay, and the measured evaluation surface.
- **Governance** — show the separation between context, policy, a human decision, and a recorded receipt.

## Why Allura Memory

Agent memory is easy to demo and difficult to trust. A production system must answer more than “did search return something?”:

- Where did this memory come from?
- Which agent and runtime recorded it?
- Which tenant owns it?
- Has anyone reviewed it?
- Is it current, superseded, disputed, or deleted?
- Can an operator reconstruct the decision later?
- Does a degraded dependency change the answer?

Allura Memory is built around those questions. It separates **episodic evidence** from **semantic knowledge**, then places a governance boundary between them.

> **Logs are not knowledge. A trace becomes canonical only through an explicit promotion path.**

<p align="center">
  <a href="docs/portfolio/allura-agentic-framework-harness/assets/product-visuals/every-action-leaves-proof.png"><img src="docs/portfolio/allura-agentic-framework-harness/assets/product-visuals/every-action-leaves-proof.png" alt="Every action leaves proof: source, review, and result connect to an immutable evidence record." width="760" /></a>
</p>

### At a glance

| Capability | Current implementation |
|---|---|
| Runtime | Bun + TypeScript |
| Protocol | Model Context Protocol over stdio and Streamable HTTP |
| Episodic layer | PostgreSQL 16, append-only events, pgvector embeddings |
| Semantic layer | PostgreSQL graph tables through the RuVector adapter |
| Search | Hybrid semantic and full-text retrieval |
| Governance | RuVix policy gate, tenant scoping, and governed promotion |
| Versioning | Immutable history with `SUPERSEDES` lineage |
| Operations | Health, readiness, audit, benchmark, recovery, and curator tools |
| Deployment | Docker Compose or direct Bun runtime |

## Core model

Allura uses one PostgreSQL engine with two governed logical layers.

| Layer | Stores | Purpose | Authority |
|---|---|---|---|
| **Episodic** | events, traces, proposals, audit metadata | Preserve what happened and what was observed | Evidence, not final truth |
| **Semantic** | `graph_memories`, `graph_supersedes`, structural nodes and edges | Serve curated, versioned knowledge | Canonical after approved materialization |

### Governed lifecycle

1. An agent calls `memory_add` with content, `group_id`, and actor identity.
2. Allura writes an append-only episodic event.
3. The content is scored and embedded.
4. Eligible content may be queued as a proposal.
5. Governance review records the decision, actor, rationale, and source reference. Human approval is the accountable boundary; automated curator behavior remains under review.
6. Approval authorizes or queues a canonical semantic version; materialization is not universally instantaneous.
7. After materialization, `memory_search` can return approved, tenant-scoped context with lifecycle metadata.
8. Updates create a new version that supersedes the old one.

<p align="center">
  <a href="docs/portfolio/allura-agentic-framework-harness/assets/product-visuals/agent-runtime-request-flow.png"><img src="docs/portfolio/allura-agentic-framework-harness/assets/product-visuals/agent-runtime-request-flow.png" alt="One request through the Allura agent runtime: intent, workflow, tools plus memory, and an evidence-backed response under policy checkpoints." width="820" /></a>
</p>

Rejected or low-confidence content can remain useful evidence without becoming canonical knowledge.

<p align="center">
  <a href="docs/portfolio/allura-agentic-framework-harness/assets/product-visuals/memory-keeps-its-history.png"><img src="docs/portfolio/allura-agentic-framework-harness/assets/product-visuals/memory-keeps-its-history.png" alt="Memory keeps its history: new versions supersede old ones without erasing evidence." width="760" /></a>
</p>

## Architecture

```text
MCP client
    │
    ▼
Canonical stdio server or HTTP gateway
    │
    ▼
RuVix governance boundary
    ├── validate identity + group_id
    ├── enforce policy and budgets
    └── append audit evidence
    │
    ▼
PostgreSQL 16 + pgvector
    ├── episodic events and proposals
    ├── vector/full-text retrieval
    └── RuVector graph tables
            │
            ▼
        approval authorizes or queues
            │
            ▼
    canonical materialization
```

<p align="center">
  <a href="docs/portfolio/allura-agentic-framework-harness/assets/product-visuals/persistent-agent-memory.png"><img src="docs/portfolio/allura-agentic-framework-harness/assets/product-visuals/persistent-agent-memory.png" alt="Persistent agent memory architecture: one PostgreSQL engine with governed logical layers for episodic evidence and canonical graph tables." width="820" /></a>
</p>

### Architectural boundaries

- **All reads and writes are scoped.** A valid `group_id` is required; production tenants follow the `allura-*` namespace.
- **Raw history is append-only.** Soft deletion and updates create events instead of erasing evidence.
- **Canonical knowledge is versioned.** Changes create supersession lineage.
- **Promotion is governed.** `memory_promote` requests review; it does not bypass the curator.
- **Storage is behind an interface.** Agent-facing clients use MCP/API operations instead of direct database access.
- **Failure is visible.** Health and retrieval responses expose degraded state and warnings.
- **Third-party substrate is attributed.** The retrieval accelerator (RuVector, MIT) is credited and scoped in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md); the governed memory layer is original. See [Attribution](#attribution).

<p align="center">
  <a href="docs/portfolio/allura-agentic-framework-harness/assets/product-visuals/access-has-boundaries.png"><img src="docs/portfolio/allura-agentic-framework-harness/assets/product-visuals/access-has-boundaries.png" alt="Access has boundaries: each tenant is isolated behind a policy boundary." width="760" /></a>
</p>

<p align="center">
  <a href="docs/portfolio/allura-agentic-framework-harness/assets/product-visuals/ad50-canonical-graph-migration.png"><img src="docs/portfolio/allura-agentic-framework-harness/assets/product-visuals/ad50-canonical-graph-migration.png" alt="AD-50 canonical graph migration: fragmented sources unify on one PostgreSQL engine with episodic evidence, canonical graph tables, and governed lineage." width="820" /></a>
</p>

### RuVector boundary

RuVector is the semantic execution layer; Allura is the governance layer.

| RuVector adapter owns | Allura owns |
|---|---|
| Graph-table persistence | Tenant identity and scope |
| Similarity and relationship operations | Approval and authorization |
| Search execution | Provenance and audit |
| Supersession primitives | Policy and lifecycle meaning |

The `GRAPH_BACKEND=ruvector` adapter is a PostgreSQL-table implementation. It is distinct from the optional native RuVector extension.

### Attribution

Allura is built with and inspired by [RuVector](https://github.com/ruvnet/RuVector) (MIT, © 2025 rUv). RuVector's vector and graph-memory substrate accelerates retrieval; Allura's original contribution is the governed layer around it — tenant scoping (`group_id`), human-review-gated promotion, `SUPERSEDES` lineage, and the audit trail. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for the full notice, license text, and what each project owns.

## Getting started

### Prerequisites

- Docker Engine with Docker Compose
- Bun 1.3.14 for local development and validation (pinned in `package.json`)
- An embedding provider: Ollama, OpenAI, Voyage, or a compatible endpoint

### Clone and configure

```bash
git clone https://github.com/Allura-Ecosystem/Allura_Memory.git
cd Allura_Memory
bun install

cp .env.example .env
touch .env.local
```

Fill the required values in `.env` or place local secret overrides in the gitignored `.env.local`. At minimum, review:

```bash
POSTGRES_DB=allura
POSTGRES_USER=allura
POSTGRES_PASSWORD=<required>
DATABASE_URL=postgresql://allura:<password>@localhost:5432/allura

GRAPH_BACKEND=ruvector
PROMOTION_MODE=soc2
AUTO_APPROVAL_THRESHOLD=0.85

EMBEDDING_PROVIDER=ollama
EMBEDDING_MODEL=qwen3-embedding:8b
RUVECTOR_EMBEDDING_BASE_URL=http://localhost:11434

RUVIX_CONTROL_PLANE_SECRET=<minimum-32-character-secret>
ALLURA_MCP_TOKEN_SECRET=<minimum-16-character-secret>
```

### Start the containerized service

```bash
docker compose --env-file .env --env-file .env.local up -d
curl http://localhost:6477/ready
```

The Compose stack runs:

| Service | Host binding | Purpose |
|---|---|---|
| `postgres` | `127.0.0.1:5432` | Episodic, semantic, vector, and audit storage |
| `mcp` | `6477:3201` | Canonical MCP HTTP gateway |

The database is loopback-only. Remote and LAN clients should connect through the governed gateway, not PostgreSQL.

### Run directly for development

```bash
# Canonical stdio server
bun run mcp

# Canonical HTTP gateway; defaults to port 3201
bun run mcp:http
```

### Connect an MCP client

Streamable HTTP against the Compose stack:

```json
{
  "mcpServers": {
    "allura": {
      "url": "http://localhost:6477/mcp"
    }
  }
}
```

Stdio from a local checkout:

```json
{
  "mcpServers": {
    "allura": {
      "command": "bun",
      "args": ["src/mcp/memory-server-canonical.ts"],
      "cwd": "/absolute/path/to/Allura_Memory"
    }
  }
}
```

## First memory round trip

All calls are tenant-scoped. Write operations also identify the actor for provenance.

```typescript
const created = await memory_add({
  group_id: "allura-myteam",
  user_id: "brooks-architect",
  content: "Decision: canonical promotion requires curator approval.",
  metadata: {
    source: "conversation",
    agent_id: "brooks"
  }
});

const results = await memory_search({
  group_id: "allura-myteam",
  query: "canonical promotion policy",
  status: "approved",
  limit: 5
});
```

Fresh writes are episodic. They may be searchable for operational workflows, but they are not approved truth until they complete the curator path.

<p align="center">
  <a href="docs/portfolio/allura-agentic-framework-harness/assets/product-visuals/an-answer-can-show-its-work.png"><img src="docs/portfolio/allura-agentic-framework-harness/assets/product-visuals/an-answer-can-show-its-work.png" alt="An answer can show its work: source, approved memory, and decision record stay attached to the response." width="760" /></a>
</p>

## MCP API

### Memory tools

| Tool | Purpose |
|---|---|
| `memory_add` | Append a memory event, score it, and queue eligible content |
| `memory_search` | Search scoped episodic and/or approved semantic memory |
| `memory_get` | Retrieve one memory by ID |
| `memory_list` | List a user's memories within a tenant |
| `memory_update` | Create a versioned update with supersession lineage |
| `memory_delete` | Soft-delete a memory while preserving audit history |
| `memory_restore` | Restore a soft-deleted memory during the recovery window |
| `memory_promote` | Request curator promotion for an episodic memory |
| `memory_export` | Export tenant-scoped memory data |
| `memory_list_deleted` | Inspect recoverable soft-deleted memories |

### Governance tools

| Tool | Purpose |
|---|---|
| `governance_list_policies` | List active invariant policies |
| `governance_get_policy` | Read one canonical policy |
| `governance_check_gate` | Evaluate an action against governance invariants |
| `governance_list_proposals` | List pending, approved, or rejected proposals |
| `governance_proposal_approve` | Apply a curator approval to one proposal |
| `governance_proposal_reject` | Reject a proposal with rationale |
| `governance_audit_log` | Read governance events and approval consumption |

### Audit and health tools

| Tool | Purpose |
|---|---|
| `audit_query_events` | Query append-only events with filters |
| `audit_agent_activity` | Inspect activity attributed to one agent |
| `audit_health_report` | Check database, semantic adapter, embedding, queue, and MCP health |
| `audit_invariant_check` | Validate governance invariants against live data |

See [`.github/API-REFERENCE.md`](.github/API-REFERENCE.md) and [`docs/reference/`](docs/reference/) for request and response contracts.

## Governance

| Invariant | Required behavior |
|---|---|
| Tenant isolation | Every operation includes a valid `group_id` |
| Append-only evidence | Trace history is not rewritten or hard-deleted |
| Versioned knowledge | Updates preserve the prior version and relationship |
| Governed promotion | Agents request promotion; an authorized curator path records the decision and may queue canonical materialization |
| Governed access | Agent clients use MCP/API boundaries |
| Namespace control | Governed tenant identifiers use the `allura-*` namespace |

### Promotion modes

The documented governance posture is `PROMOTION_MODE=soc2`, which routes eligible candidates through review. `memory_add` queues eligible records rather than treating `PROMOTION_MODE=auto` as score-based truth. Separately, the admin-only `governance_curator_pass(mode="auto")` path can batch-approve and materialize threshold-passing proposals; the HTTP gateway identifies that operation as a HITL bypass. Human approval remains the accountable boundary in the public governance model, while this automated curator path remains an explicit policy-resolution item.

<p align="center">
  <a href="docs/portfolio/allura-agentic-framework-harness/assets/product-visuals/enterprise-governance-safety.png"><img src="docs/portfolio/allura-agentic-framework-harness/assets/product-visuals/enterprise-governance-safety.png" alt="Enterprise governance and safety architecture: policy hooks, human approval, and append-only evidence wrap the agent workflow." width="820" /></a>
</p>

<p align="center">
  <a href="docs/portfolio/allura-agentic-framework-harness/assets/product-visuals/people-review-important-changes.png"><img src="docs/portfolio/allura-agentic-framework-harness/assets/product-visuals/people-review-important-changes.png" alt="People review important changes: a proposal passes a policy check, then a person reviews accuracy and impact before approval." width="760" /></a>
</p>

## Operations

### Health endpoints

| Endpoint | Meaning |
|---|---|
| `GET /health` | Process liveness and basic service status |
| `GET /ready` | Dependency readiness; returns `503` when required checks fail |
| `POST /mcp` | Streamable HTTP MCP endpoint |

### Common commands

```bash
bun run typecheck
bun run test
bun run test:e2e
bun run test:all

bun run curator:run
bun run curator:approve
bun run curator:reject

bun run benchmark
bun run backfill:embeddings
bun run brain:status
```

### Validation expectations

- Unit and type checks validate local contracts.
- E2E suites require live infrastructure and are gated by `RUN_E2E_TESTS=true`.
- Health output is runtime evidence, not a substitute for functional tests.
- A “done” claim should identify the command, result, and relevant artifact.
- Required pull-request validation produces a commit-bound evidence manifest; see the [capability matrix](docs/portfolio/capability-matrix.md) and [evidence index](docs/portfolio/evidence-index.md).

<p align="center">
  <a href="docs/portfolio/allura-agentic-framework-harness/assets/product-visuals/test-before-release.png"><img src="docs/portfolio/allura-agentic-framework-harness/assets/product-visuals/test-before-release.png" alt="Test before release: scenario, run, evidence, and review repeat until the change ships with proof." width="760" /></a>
</p>

## Repository map

```text
Allura_Memory/
├── src/mcp/                 canonical MCP servers and tools
├── src/control-plane/              RuVix policy and enforcement boundary
├── src/lib/graph-adapter/   PostgreSQL/RuVector graph interface
├── src/curator/             scoring, proposals, approval, and workers
├── src/lib/audit/           audit and isolation checks
├── docker/postgres-init/    schema and migration bootstrap
├── scripts/                 operations, validation, recovery, and setup
├── docs/allura/             canonical architecture documentation
└── docs/reference/          API and terminology reference
```

## Documentation

| Document | Use it for |
|---|---|
| [`docs/allura/BLUEPRINT.md`](docs/allura/BLUEPRINT.md) | Core concepts, requirements, topology, data model |
| [`docs/allura/SOLUTION-ARCHITECTURE.md`](docs/allura/SOLUTION-ARCHITECTURE.md) | Runtime boundaries and deployment scenarios |
| [`docs/allura/DESIGN-ALLURA.md`](docs/allura/DESIGN-ALLURA.md) | Implementation design |
| [`docs/allura/DATA-DICTIONARY.md`](docs/allura/DATA-DICTIONARY.md) | Tables, fields, and relationships |
| [`docs/allura/REQUIREMENTS-MATRIX.md`](docs/allura/REQUIREMENTS-MATRIX.md) | Requirement-to-evidence traceability |
| [`docs/allura/RISKS-AND-DECISIONS.md`](docs/allura/RISKS-AND-DECISIONS.md) | ADRs, risk posture, and superseded decisions |
| [`docs/portfolio/capability-matrix.md`](docs/portfolio/capability-matrix.md) | Implemented/planned claims and their independent evidence state |
| [`docs/portfolio/evidence-index.md`](docs/portfolio/evidence-index.md) | Commit-bound CI evidence and controlled failure proof |

When documentation disagrees, use this authority order: current code and schema → accepted ADRs → canonical architecture docs → operational notes.

## Claims and limitations

Allura provides:

- tenant-scoped persistent memory;
- append-only evidence and audit events;
- governed approval before canonical materialization;
- versioned knowledge and soft deletion;
- MCP-native integration;
- self-hosted data ownership.

Allura does not claim:

- formal SOC 2, ISO 27001, or equivalent certification;
- elimination of model hallucination;
- autonomous truth verification;
- that a confidence score replaces human review;
- performance superiority over specialized vector databases.

## Brand

Allura Memory uses Allura Blue `#0D47A1`, Orange `#FF4D1F`, Green `#14BA4B`, Ink `#0F1720`, and Cream `#F7F3EE`. Aeonik is the primary communication face; IBM Plex Mono is reserved for code and technical identifiers.

## License

MIT

---

<p align="center">
  <strong>Memory is the foundation. Intelligence is the outcome.</strong>
</p>
