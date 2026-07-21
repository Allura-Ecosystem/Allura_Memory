<p align="center">
  <img src="public/readme/allura-wordmark.png" alt="Allura Memory" width="180" />
</p>

<h1 align="center">Governed Memory Infrastructure for AI Agent Systems</h1>

<p align="center">
  <strong>Self-hosted memory, governance, and audit trails for production AI agents</strong><br/>
  Capture agent activity, enforce review gates, and maintain an immutable knowledge base with full traceability.
</p>

<p align="center">
  <a href="#getting-started">Getting Started</a> · <a href="#architecture">Architecture</a> · <a href="#features">Features</a> · <a href="#deployment">Deployment</a> · <a href="#api-reference">API Reference</a> · <a href="library/README.md">Workflow Library</a>
</p>

---

## Overview

AI agents lose context between sessions. Decisions made yesterday vanish. Audit trails don't exist. Knowledge has no provenance.

Allura Memory is a **self-hosted memory and governance system** designed for organizations building production AI agent systems. It provides structured memory capture, human-in-the-loop review, and immutable audit trails — all running on your infrastructure.

### Use Cases

- **Persistent agent memory** across sessions and teams
- **Compliance-ready audit trails** for AI-driven decisions
- **Knowledge management** with review-gated promotion from raw data to canonical knowledge
- **Multi-tenant isolation** for separate teams, projects, or clients
- **Workflow governance** with evidence-gated completion criteria

### Who Is This For

Allura is built for engineering teams, platform operators, and compliance-conscious organizations that need:

- **Traceability** — every memory records what was captured, when, and why it was promoted
- **Governance** — approval gates between raw capture and long-term knowledge
- **Data sovereignty** — self-hosted on your infrastructure, no external dependencies
- **MCP integration** — native support for Claude, Cursor, OpenCode, and any MCP-compatible agent
- **Audit readiness** — append-only event log, actor identity, and explicit approval records

---

## Architecture

Allura uses a **dual-layer memory architecture** — two purpose-built stores, each serving a distinct function:

| Layer | Store | Function | Write Pattern |
|-------|-------|----------|---------------|
| **Episodic** | PostgreSQL 16 + pgvector | Raw event capture, audit trail, high-volume traces | Append-only |
| **Semantic** | PostgreSQL (graph tables) | Curated knowledge, versioned relationships, promotion-gated | Review → Promote |

Both layers run on a single PostgreSQL instance, reducing infrastructure complexity and operational overhead.

### Memory Flow

```
Agent writes memory
  ↓
PostgreSQL stores append-only event (episodic layer)
  ↓
Content is scored (0–1 confidence)
  ↓
┌─ score < threshold → remains episodic (retrievable, not promoted)
└─ score ≥ threshold → enters review queue
      ↓
  Curator approves or rejects
      ↓
   Approved → promoted to semantic graph (PostgreSQL tables)
   Rejected → remains episodic with audit record
```

### Vector Search

Allura embeds every memory at write time using configurable embedding models. Queries use **hybrid vector + full-text ranking** through PostgreSQL HNSW indexes for semantic retrieval across both stores.

---

## Features

| Feature | Description |
|---------|-------------|
| **Dual-layer storage** | PostgreSQL (episodic) + PostgreSQL graph tables (semantic) with clear promotion boundary |
| **Immutable audit trail** | Every write is an append-only event — reconstruct any point in time |
| **Human-in-the-loop curation** | Score-gated review queue before knowledge promotion |
| **Multi-tenant isolation** | Group-based tenant boundaries enforced at the schema level |
| **MCP protocol native** | Stdio + Streamable HTTP gateway for any MCP-compatible agent |
| **Vector search** | pgvector HNSW indexes with hybrid ANN + BM25 ranking |
| **Plugin system** | MCP server discovery, approval, and routing |
| **Agent handoff protocol** | Structured handoff packets for multi-agent collaboration |
| **Self-hostable** | Docker Compose deployment — no external auth dependencies |
| **Versioned knowledge** | Supersession relationships — outdated facts are deprecated, not erased |
| **API-first** | MCP, CLI, and HTTP endpoints with structured responses |

---

## Getting Started

### Prerequisites

- **Docker** + Docker Compose
- **Bun** 1.0+ (for local development)
- **Ollama** or compatible embedding service

### 1. Clone and Configure

```bash
git clone https://github.com/Allura-Ecosystem/Allura_Memory.git
cd Allura_Memory
bun install

cp .env.example .env
# Edit .env with your database credentials
```

### 2. Start Infrastructure

```bash
docker compose up -d
```

This starts PostgreSQL (with pgvector) and the Allura Memory MCP HTTP gateway.

### 3. Verify

```bash
# Health check
curl http://localhost:5888/ready
# → { "ready": true, "checks": { "postgres": { "healthy": true }, "mcp": { "healthy": true } } }
```

### 4. Connect Your Agent

Add to your MCP client configuration (Claude Desktop, Cursor, etc.):

**Streamable HTTP:**
```json
{
  "mcpServers": {
    "allura": {
      "url": "http://localhost:5888/mcp"
    }
  }
}
```

**Stdio:**
```json
{
  "mcpServers": {
    "allura": {
      "command": "bun",
      "args": ["src/mcp/memory-server-canonical.ts"]
    }
  }
}
```

### 5. Use the Tools

All memory operations require `group_id` and `user_id` for multi-tenant isolation.

```typescript
// Store a memory
memory_add({
  group_id: "allura-myteam",
  user_id: "alice",
  content: "Decision: Use PostgreSQL for all data storage",
  metadata: { source: "conversation" },
  threshold: 0.85
})

// Search memories
memory_search({
  query: "database decisions",
  group_id: "allura-myteam"
})

// Retrieve a specific memory
memory_get({ id: "mem_7f9e2c3a1b5d", group_id: "allura-myteam" })

// List memories for a user
memory_list({ group_id: "allura-myteam", user_id: "alice" })

// Soft-delete (recoverable within 30 days)
memory_delete({ id: "mem_7f9e2c3a1b5d", group_id: "allura-myteam" })
```

---

## Configuration

All configuration lives in `.env`:

```bash
# Core
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=allura
POSTGRES_USER=allura
POSTGRES_PASSWORD=<required>

# Governance
PROMOTION_MODE=reviewed        # "reviewed" (curator gate) or "auto" (threshold-based)
AUTO_APPROVAL_THRESHOLD=0.85

# Graph backend
GRAPH_BACKEND=ruvector           # PostgreSQL graph tables (production)

# Embeddings
RUVECTOR_EMBEDDING_BASE_URL=http://localhost:11434
EMBEDDING_MODEL=qwen3-embedding:8b

# Security
JWT_SECRET=<generate with: openssl rand -base64 32>
ENCRYPTION_KEY=<generate with: openssl rand -hex 32>
```

### Promotion Modes

| Mode | Behavior | Recommended For |
|------|----------|----------------|
| `reviewed` | Score ≥ threshold → curator review queue | Production, compliance-conscious teams |
| `auto` | Score ≥ threshold → automatic promotion | Development, testing |

---

## Deployment

### Docker Compose (Recommended)

```bash
docker compose up -d
curl http://localhost:5888/ready
```

Services:
- `postgres` — PostgreSQL 16 + pgvector (episodic traces + semantic graph tables)
- `mcp` — MCP HTTP gateway (port 5888)

### Kubernetes

For production Kubernetes deployment, see [`.github/DEPLOYMENT.md`](.github/DEPLOYMENT.md).

---

## API Reference

Full API documentation: [`.github/API-REFERENCE.md`](.github/API-REFERENCE.md)

### Core MCP Tools

| Tool | Description |
|------|-------------|
| `memory_add` | Store a new memory (episodic → score → promote or queue) |
| `memory_search` | Hybrid semantic + full-text search across both stores |
| `memory_get` | Retrieve a single memory by ID |
| `memory_list` | List all memories for a user within a tenant |
| `memory_update` | Append-only versioned update (creates supersession chain) |
| `memory_delete` | Soft-delete with 30-day recovery window |
| `memory_restore` | Recover a soft-deleted memory |
| `memory_promote` | Request curator promotion for an episodic memory |
| `memory_export` | Export memories filtered by group and canonical status |
| `memory_list_deleted` | List soft-deleted memories within recovery window |

### Governance Tools

| Tool | Description |
|------|-------------|
| `governance_list_policies` | List all active governance policies |
| `governance_get_policy` | Retrieve a specific policy by ID |
| `governance_check_gate` | Evaluate governance invariants for a proposed action |
| `governance_audit_log` | Query the governance audit log |

### Audit Tools

| Tool | Description |
|------|-------------|
| `audit_query_events` | Query the append-only event log |
| `audit_health_report` | System health and subsystem status |
| `audit_agent_activity` | Agent activity summary |
| `audit_invariant_check` | Verify governance invariants |

---

## Development

```bash
bun install
bun run typecheck    # TypeScript validation
bun test             # Unit tests
bun run test:e2e     # Integration tests
bun run test:all     # Full suite
```

### Key Scripts

| Command | Description |
|---------|-------------|
| `bun run mcp` | Start canonical MCP server (stdio) |
| `bun run mcp:http` | Start MCP HTTP gateway |
| `bun run curator:run` | Run curator scoring and queue |
| `bun run curator:approve` | Approve pending proposals |
| `bun run curator:reject` | Reject pending proposals |
| `bun run backfill:embeddings` | One-shot embedding backfill |
| `bun run benchmark` | Performance benchmark |

---

## Documentation

### Public Surface

| Document | Description |
|----------|-------------|
| [`catalog/README.md`](catalog/README.md) | Public index — plugins, adapters, workflows, gates |
| [`catalog/plugins.md`](catalog/plugins.md) | Plugin catalog |
| [`catalog/adapters.md`](catalog/adapters.md) | MCP client configurations |
| [`catalog/workflows.md`](catalog/workflows.md) | End-to-end memory pipeline |
| [`catalog/gates.md`](catalog/gates.md) | Governance invariants and approval boundaries |
| [`docs/user-guide/`](docs/user-guide/) | Getting started guides per runtime |
| [`docs/reference/`](docs/reference/) | API reference and glossary |

### Canonical Architecture

| Document | Description |
|----------|-------------|
| [`docs/allura/BLUEPRINT.md`](docs/allura/BLUEPRINT.md) | Core design reference |
| [`docs/allura/SOLUTION-ARCHITECTURE.md`](docs/allura/SOLUTION-ARCHITECTURE.md) | System topology and integration boundaries |
| [`docs/allura/DESIGN-ALLURA.md`](docs/allura/DESIGN-ALLURA.md) | Implementation design decisions |
| [`docs/allura/REQUIREMENTS-MATRIX.md`](docs/allura/REQUIREMENTS-MATRIX.md) | Requirements traceability |
| [`docs/allura/RISKS-AND-DECISIONS.md`](docs/allura/RISKS-AND-DECISIONS.md) | Architecture decisions and tradeoffs |
| [`docs/allura/DATA-DICTIONARY.md`](docs/allura/DATA-DICTIONARY.md) | Schema and field reference |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Bun + TypeScript |
| Data Store | PostgreSQL 16 + pgvector |
| Graph Layer | PostgreSQL graph tables (graph_memories, graph_supersedes) |
| Embeddings | Configurable (Ollama, OpenAI, or compatible) |
| Containerization | Docker + Docker Compose |
| Protocol | Model Context Protocol (MCP) |

---

## Governance Model

Allura enforces governance through immutable policies:

| Policy | Enforcement |
|--------|-------------|
| Tenant isolation | `group_id` required on every operation, validated at schema level |
| Immutable events | Append-only event log — no UPDATE or DELETE on trace records |
| Versioned knowledge | Supersession relationships — outdated facts deprecated, not erased |
| Review-gated promotion | Agents cannot autonomously promote memories to canonical knowledge |
| Canonical connection | All database operations through governed API layer |
| Namespace enforcement | All tenants must use the `allura-*` namespace |

### Claims and Limitations

**What Allura provides:**
- Dual-layer memory with traceable capture and promotion
- Immutable audit trail by design
- Human-in-the-loop curation as a core feature
- Self-hosted deployment on your infrastructure
- MCP-native integration with major agent frameworks
- API-first operations

**What Allura does not claim:**
- SOC 2, ISO 27001, or other formal compliance certifications
- Elimination of AI hallucinations or guaranteed accuracy
- Autonomous truth verification without human review
- Performance superiority over purpose-built vector databases

---

## Design Principles

1. **Conceptual integrity** — one coherent architecture, not a patchwork of integrations
2. **Explicit approval** — no silent automation around what becomes knowledge
3. **Component specialization** — each layer does one thing well
4. **Separation of concerns** — episodic capture and semantic curation are architecturally distinct
5. **Immutable audit** — history is preserved, never overwritten
6. **Infrastructure simplicity** — single database engine, minimal operational surface
7. **API-first** — programmatic interfaces over manual interaction

---

## License

MIT

---

Built by the [Allura Ecosystem](https://github.com/Allura-Ecosystem) organization. Self-hosted, governance-oriented memory infrastructure for production AI systems.