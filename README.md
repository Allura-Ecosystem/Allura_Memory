<p align="center">
  <img src="public/readme/allura-wordmark.png" alt="Allura Memory" width="190" />
</p>

<h1 align="center">A shared memory for your AI agents</h1>

> [!NOTE]
> **AI-Assisted Documentation**
> This working introduction was updated with AI assistance and awaits human review. Implementation and test evidence, not this page, determine readiness.

<p align="center">
  <a href="https://github.com/Allura-Ecosystem/Allura_Memory/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/Allura-Ecosystem/Allura_Memory/ci.yml?branch=main&label=CI&style=flat-square&color=0D47A1" alt="CI" /></a>
  <a href="https://github.com/Allura-Ecosystem/Allura_Memory/actions/workflows/check.yml"><img src="https://img.shields.io/github/actions/workflow/status/Allura-Ecosystem/Allura_Memory/check.yml?branch=main&label=Check&style=flat-square&color=0D47A1" alt="Check" /></a>
  <a href="https://github.com/Allura-Ecosystem/Allura_Memory/actions/workflows/integration-tests.yml"><img src="https://img.shields.io/github/actions/workflow/status/Allura-Ecosystem/Allura_Memory/integration-tests.yml?branch=main&label=Integration&style=flat-square&color=0D47A1" alt="Integration Tests" /></a>
  <a href="https://github.com/Allura-Ecosystem/Allura_Memory/blob/main/LICENSE"><img src="https://img.shields.io/github/license/Allura-Ecosystem/Allura_Memory?style=flat-square&color=148A4B" alt="MIT license" /></a>
</p>

<p align="center">
  <strong>Keep useful context between sessions. See where it came from.</strong><br/>
  Allura is a self-hosted memory engine for teams building with AI agents.
</p>

<p align="center">
  <a href="#start-here">Start here</a> ·
  <a href="#getting-started">Developer setup</a> ·
  <a href="#documentation">Technical reference</a>
</p>

---

## Start here

If your agents lose project context between sessions, Allura provides a place to record it, retrieve it within an authorized scope, and inspect its source. The intended policy requires people to review what becomes approved knowledge; ordinary retrieval should not require managing a database.

- **Understand the model:** agents record evidence → eligible knowledge is reviewed → later work retrieves authorized context. See the [memory lifecycle](#governed-lifecycle).
- **Evaluate the engine:** use the [developer setup](#getting-started) in an isolated environment. The existing Compose stack is database + MCP gateway, not a complete company workspace installation.
- **Follow the workspace build:** the [pilot contract](docs/allura/DESIGN-ALLURA.md#simple-enterprise-pilot-ux-contract) covers daily work, knowledge search/map, agent activity and a decision inbox. Its [done checklist](docs/allura/REQUIREMENTS-MATRIX.md#simple-enterprise-pilot-acceptance) requires working-product evidence, not screenshots alone.

**Status: enterprise pilot in development.** The complete private installation, production document workspace/search, corporate SSO, Hermes integration and representative usability checks are not yet verified. Existing graph and authorization components are being integrated and tested; this is not a compliance certification or a capacity guarantee.

**Open governance check:** a connected service returned a storage disposition inconsistent with the reviewed source's promotion boundary. Its running revision remains unverified. Governed-memory acceptance is blocked until that discrepancy is reconciled; the lifecycle below describes the intended contract, not a guarantee about every connected deployment.

### A first useful journey

The pilot must prove this with real authorized data: connect a supported agent or source, do useful work, return in another session, find relevant context, and open its evidence. Only decisions that require a person belong in the inbox. This is an acceptance target, not a claim that every step already works.

<details>
<summary>Historical demo and visual explainers</summary>

<p align="center">
  <a href="https://allura-governed-demo.vercel.app"><img src="docs/archive/allura/legacy-docs/portfolio/allura-agentic-framework-harness/assets/dashboard-command-center.png" alt="Allura's deployed Command Center specimen: a review queue, evidence record, explicit human review gate, and receipt trail." width="860" /></a>
</p>

## Product walkthrough

The [Epic 25 interactive demo](https://allura-governed-demo.vercel.app) is a historical synthetic walkthrough, not the new dashboard specification. Its availability was not verified in the latest review. It does not demonstrate a live connection, production authorization, or an automated decision; use the local source references if the link is unavailable.

- **Command Center** — inspect a review packet before a qualified person acts.
- **Framework & Harness** — show fail-closed boot, database-enforced boundaries, deterministic replay, and the measured evaluation surface.
- **Governance** — show the separation between context, policy, a human decision, and a recorded receipt.

## Product explainers

Six branded visuals explain the framework, harness, governance, and evidence model behind the walkthrough. Each carries the Allura wordmark, the canonical palette, and a source citation.

|  |  |
| --- | --- |
| <a href="docs/archive/allura/legacy-docs/portfolio/allura-agentic-framework-harness/infographics/png/01-framework-harness-architecture.png"><img src="docs/archive/allura/legacy-docs/portfolio/allura-agentic-framework-harness/infographics/png/01-framework-harness-architecture.png" alt="Three developer interfaces feed one governed execution path; the proof field identifies the shared controls." width="420" /></a><br/><sub><strong>Framework and harness architecture</strong></sub> | <a href="docs/archive/allura/legacy-docs/portfolio/allura-agentic-framework-harness/infographics/png/02-deterministic-harness.png"><img src="docs/archive/allura/legacy-docs/portfolio/allura-agentic-framework-harness/infographics/png/02-deterministic-harness.png" alt="Run the same scenario, inspect the same path, and compare the result." width="420" /></a><br/><sub><strong>Deterministic harness</strong></sub> |
| <a href="docs/archive/allura/legacy-docs/portfolio/allura-agentic-framework-harness/infographics/png/03-enterprise-governance.png"><img src="docs/archive/allura/legacy-docs/portfolio/allura-agentic-framework-harness/infographics/png/03-enterprise-governance.png" alt="Controls belong in the execution path, where people can inspect them." width="420" /></a><br/><sub><strong>Enterprise governance</strong></sub> | <a href="docs/archive/allura/legacy-docs/portfolio/allura-agentic-framework-harness/infographics/png/04-developer-interfaces.png"><img src="docs/archive/allura/legacy-docs/portfolio/allura-agentic-framework-harness/infographics/png/04-developer-interfaces.png" alt="Different engineering workflows share the same governed core." width="420" /></a><br/><sub><strong>Developer interfaces</strong></sub> |
| <a href="docs/archive/allura/legacy-docs/portfolio/allura-agentic-framework-harness/infographics/png/05-governed-memory-lifecycle.png"><img src="docs/archive/allura/legacy-docs/portfolio/allura-agentic-framework-harness/infographics/png/05-governed-memory-lifecycle.png" alt="Memory improves over time without erasing where it came from." width="420" /></a><br/><sub><strong>Governed memory lifecycle</strong></sub> | <a href="docs/archive/allura/legacy-docs/portfolio/allura-agentic-framework-harness/infographics/png/06-evidence-to-release-chain.png"><img src="docs/archive/allura/legacy-docs/portfolio/allura-agentic-framework-harness/infographics/png/06-evidence-to-release-chain.png" alt="A portfolio claim should lead a reviewer back to the proof." width="420" /></a><br/><sub><strong>Evidence to release chain</strong></sub> |

</details>

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

<details>
<summary>Historical synthetic governance specimen</summary>

<p align="center">
  <a href="https://allura-governed-demo.vercel.app"><img src="docs/archive/allura/legacy-docs/portfolio/allura-agentic-framework-harness/assets/dashboard-governance.png" alt="Historical synthetic governance specimen, not verified deployment behavior." width="820" /></a>
</p>

</details>

Rejected or low-confidence content can remain useful evidence without becoming canonical knowledge.

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

### Architectural boundaries

- **All reads and writes are scoped.** A valid `group_id` is required; production tenants follow the `allura-*` namespace.
- **Raw history is append-only.** Soft deletion and updates create events instead of erasing evidence.
- **Canonical knowledge is versioned.** Changes create supersession lineage.
- **Promotion is governed.** `memory_promote` requests review; it does not bypass the curator.
- **Storage is behind an interface.** Agent-facing clients use MCP/API operations instead of direct database access.
- **Failure is visible.** Health and retrieval responses expose degraded state and warnings.
- **Third-party substrate is attributed.** The retrieval accelerator (RuVector, MIT) is credited and scoped in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md); the governed memory layer is original. See [Attribution](#attribution).

<details>
<summary>Historical synthetic framework specimen</summary>

<p align="center">
  <a href="https://allura-governed-demo.vercel.app"><img src="docs/archive/allura/legacy-docs/portfolio/allura-agentic-framework-harness/assets/dashboard-framework-harness.png" alt="Historical synthetic framework specimen, not current verification evidence." width="820" /></a>
</p>

</details>

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

<details>
<summary>Engineering explainers: evidence and trust</summary>

## Governance design patterns

These historical conceptual visuals describe intended governance patterns, not a live system view or a verified guarantee. Their embedded claims and captions must be checked against the deployed revision and current evidence, including the open promotion discrepancy above.

<p align="center">
  <img src="public/readme/allura-wordmark.png" alt="Allura" width="160" />
</p>

| | |
| --- | --- |
| ![Every action leaves evidence](docs/archive/allura/legacy-docs/readme/evidence-explainers/01-every-action-leaves-evidence.png) | ![Context stays within its boundary](docs/archive/allura/legacy-docs/readme/evidence-explainers/02-context-stays-within-boundary.png) |
| Required policy: preserve episodic evidence before reviewed canonical promotion. | Required boundary: authorize tenant/workspace access server-side, not merely accept a supplied `group_id`. |
| *Source: Allura_Memory README and architecture documentation.* | *Source: Allura_Memory README and architecture documentation.* |
| | |
| ![Review is the boundary before knowledge](docs/archive/allura/legacy-docs/readme/evidence-explainers/03-review-before-knowledge.png) | ![History stays connected](docs/archive/allura/legacy-docs/readme/evidence-explainers/04-history-stays-connected.png) |
| Required policy: curator review before canonical knowledge; deployed promotion verification remains open. | Intended lifecycle: preserve the prior version and supersession lineage when knowledge changes. |
| *Source: Allura_Memory README and architecture documentation.* | *Source: Allura_Memory README and architecture documentation.* |
| | |
| ![Repeat the work. Keep the evidence.](docs/archive/allura/legacy-docs/readme/evidence-explainers/05-repeat-the-work-keep-evidence.png) | ![An answer can show its work](docs/archive/allura/legacy-docs/readme/evidence-explainers/06-answer-can-show-its-work.png) |
| Evaluation results need a reproducible workload and a retained evidence record. | Retrieved context should expose available provenance and clearly distinguish missing evidence. |
| *Source: Allura_Memory README and architecture documentation.* | *Source: Allura_Memory README and architecture documentation.* |

</details>

## Getting started

**Developer setup, not a finished company installer.** These recipes describe existing engine paths. Use a new isolated test environment and review the [deployment boundary](docs/allura/SOLUTION-ARCHITECTURE.md#simple-enterprise-pilot-deployment-boundary) first. Do not point migration/bootstrap commands at an existing company database. Authentication, restricted application-role configuration and agent credentials must be provisioned for the chosen deployment; the examples below are not a complete production configuration. Never put credentials in source control or a public client configuration.

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

The reviewed source writes new memories as episodic evidence; they are not approved truth until the curator path completes. The connected-service discrepancy noted above must be resolved before treating this example as deployment acceptance.

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

Use the authenticated server's `tools/list` response to verify its actual catalog and supported inputs. The following names describe the current source catalog, not every historical or connected deployment.

| Tool | Purpose |
|---|---|
| `governance_list_policies` | List active invariant policies |
| `governance_get_policy` | Read one canonical policy |
| `governance_check_gate` | Evaluate an action against governance invariants |
| `governance_audit_log` | Read governance events and approval consumption |

### Audit and health tools

| Tool | Purpose |
|---|---|
| `audit_query_events` | Query append-only events with filters |
| `audit_agent_activity` | Inspect activity attributed to one agent |
| `audit_health_report` | Check database, semantic adapter, embedding, queue, and MCP health |
| `audit_invariant_check` | Validate governance invariants against live data |

See [`.github/API-REFERENCE.md`](.github/API-REFERENCE.md) and the canonical [`DATA-DICTIONARY.md`](docs/allura/DATA-DICTIONARY.md) for request and response contracts.

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

The documented governance posture is `PROMOTION_MODE=soc2`, with human review before canonical promotion. In the reviewed source, `memory_add` queues eligible records instead of making a confidence score authoritative. Historical proposal-approval and automatic-curator tool names are not advertised by the current canonical gateway/stdio catalog and should not be used as an integration contract. Verify the deployed revision, catalog and governed approval path; the connected-service discrepancy above remains unresolved.

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
- Required pull-request validation produces a commit-bound evidence manifest checked against [`json-schema/portfolio-evidence.schema.json`](json-schema/portfolio-evidence.schema.json).

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
└── docs/archive/allura/     historical, non-authoritative material
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

When documentation disagrees, use this authority order: current code and schema → accepted ADRs → canonical architecture docs → operational notes.

## Claims and limitations

Allura provides:

- tenant-scoped persistent memory;
- append-only evidence and audit events;
- a required governed-approval contract before canonical materialization, with connected-deployment verification still pending;
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

The approved palette is Allura Blue `#0D47A1`, Orange `#FF4D1F`, Green `#148A4B`, Ink `#0F1720`, and Cream `#F7F3EE`. Brand direction specifies Aeonik when available; the current dashboard declares IBM Plex Sans with system fallbacks. IBM Plex Mono is for technical text. Brand direction is not proof of visual fidelity in every existing screen.

## License

MIT

---

<p align="center">
  <strong>Memory is the foundation. Intelligence is the outcome.</strong>
</p>
