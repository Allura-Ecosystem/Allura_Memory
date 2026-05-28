<p align="center">
  <img src="public/readme/logo-v2.png" alt="Allura Memory" width="120" />
</p>

<h1 align="center">Allura Memory</h1>

<p align="center">
  <strong>Governed AI Memory — Built for Teams That Need to Know Why</strong><br/>
  A self-hosted memory system for AI agents with traceable capture, human-in-the-loop curation,<br/>and audit-grade dual-layer storage.
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> ·
  <a href="#how-it-works">How It Works</a> ·
  <a href="#dashboard">Dashboard</a> ·
  <a href="#api-reference">API</a> ·
  <a href="#deployment">Deployment</a> ·
  <a href="docs/allura/BLUEPRINT.md">Blueprint</a>
</p>

---

<p align="center">
  <img src="public/readme/readme-hero.png" alt="Allura Memory Dashboard" width="720" />
</p>

## Mission

AI agents make decisions based on what they remember. When that memory is a black box — when there is no record of what was captured, why it was kept, or who approved it — trust breaks down.

**Allura Memory exists to make AI memory auditable, governed, and explainable.**

Every piece of knowledge in Allura starts as a raw event. It is scored, reviewed by a human curator, and only promoted to long-term knowledge after approval. The entire chain — capture, scoring, review decision, promotion — is preserved and inspectable. Nothing is silently decided.

This is memory you can show to a regulator, an auditor, or a customer and say: *here is exactly what the system knows, and here is exactly how it came to know it.*

---

## What Allura Does

| Capability | Description |
|-----------|-------------|
| **Governed memory capture** | Every agent write is logged as an immutable episodic event before any promotion decision |
| **Human-in-the-loop curation** | Memories scoring above your threshold enter a review queue — a human approves or rejects before they become long-term knowledge |
| **Dual-layer architecture** | PostgreSQL holds raw events (append-only); Neo4j holds curated knowledge (versioned, never overwritten) |
| **Hybrid semantic search** | Vector ANN + BM25 full-text search with RRF fusion — find memories by meaning or by keyword |
| **Multi-tenant isolation** | Every read and write is scoped to a `group_id` — tenants are separated at the schema, proof, and query layers |
| **MCP-native integration** | Plug into Claude, Cursor, OpenCode, or any MCP-compatible agent via stdio or Streamable HTTP |
| **Audit trail** | Complete, append-only record of every write, curator decision, policy check, and promotion |
| **Policy enforcement** | 13 configurable governance policies — tenant isolation, budget limits, permission tiers, audit requirements |
| **Self-hosted** | Runs entirely on your infrastructure. Your data never leaves your environment. |

---

## How It Works

<p align="center">
  <img src="public/readme/readme-memory-flow.png" alt="Memory Flow" width="640" />
</p>

### The Memory Pipeline

```
Agent writes memory
        ↓
PostgreSQL stores append-only event       ← episodic layer — always preserved
        ↓
Content is scored (0.0 – 1.0 confidence)
        ↓
  Below threshold ──→ stays episodic (searchable, not promoted)
  Above threshold ──→ enters curator review queue
                              ↓
                    Human curator reviews
                              ↓
                    Approved ──→ promoted to Neo4j   ← semantic layer
                    Rejected ──→ stays episodic with audit record
```

No memory is ever silently promoted. No history is ever overwritten. Every decision has a record.

### Data Layers

| Layer | Store | Role | Write Rule |
|-------|-------|------|------------|
| **Episodic** | PostgreSQL 16 | Raw event capture, audit trail, high-volume traces | Append-only — no UPDATE or DELETE, ever |
| **Semantic** | Neo4j 5.26 | Curated long-term knowledge, versioned relationships | SUPERSEDES versioning — old facts deprecated, not erased |
| **Vector** | RuVector (pgvector) | 768-dimension embeddings for hybrid semantic search | Written at capture time via Ollama |

### Governance Kernel (RuVix)

All memory promotions pass through **RuVix**, a proof-gated mutation kernel. Every write is validated against up to 13 configurable policies before acceptance:

| Policy | Enforces |
|--------|---------|
| POL-001 | Tenant isolation — `group_id` boundaries at every layer |
| POL-002 | Budget enforcement — token and compute limits per session |
| POL-003 | Permission tiers — viewer / curator / admin gates |
| POL-004 | Actor validation — agent identity and claims verification |
| POL-005 | Audit trail — all writes must be logged |
| POL-006 | Debug output — disabled in production |
| POL-007 | Source-of-truth gate — promotion requires Neo4j readiness |
| POL-008 | Infrastructure target lock — prevents writes to wrong databases |
| POL-009 | Project manifest — `group_id` format compliance |
| POL-010–013 | Email zero-trust — sender, domain, and header validation |

Mutations require a cryptographically signed `ProofOfIntent` with a valid nonce, timestamp, and `group_id`. Policies cannot be bypassed through direct database access.

---

## Quick Start

### Prerequisites

- **Docker** + Docker Compose
- **Bun** 1.0+
- **Ollama** with `nomic-embed-text` pulled (`ollama pull nomic-embed-text`)

### 1. Clone and Configure

```bash
git clone https://github.com/Charitablebusinessronin/Allura_Memory.git
cd Allura_Memory
bun install
cp .env.example .env
```

Edit `.env` with your credentials:

```bash
# Required
POSTGRES_PASSWORD=your-secure-password
NEO4J_PASSWORD=your-neo4j-password

# Governance mode
PROMOTION_MODE=soc2           # "soc2" = review-gated | "auto" = automatic
AUTO_APPROVAL_THRESHOLD=0.85  # minimum confidence score for promotion eligibility

# Embeddings
RUVECTOR_EMBEDDING_BASE_URL=http://localhost:11434
EMBEDDING_MODEL=nomic-embed-text
```

### 2. Start Infrastructure

```bash
docker compose up -d
```

Starts PostgreSQL, Neo4j, and the Allura Brain MCP gateway.

### 3. Verify

```bash
# Health check
curl http://localhost:3201/health
# → { "status": "healthy", "interface": "mcp-http", ... }

# Readiness (PostgreSQL + Neo4j + MCP initialized)
curl http://localhost:3201/ready
# → { "ready": true, ... }

# Dashboard
open http://localhost:3100/dashboard
```

### 4. Connect Your Agent

**Stdio (local dev):**
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

**HTTP Gateway (recommended for production):**
```json
{
  "mcpServers": {
    "allura": {
      "url": "http://localhost:3201/mcp"
    }
  }
}
```

---

## API Reference

All operations require `group_id` (tenant) and `user_id`. The pattern `allura-<yourproject>` is enforced by policy.

### Store a Memory

```typescript
memory_add({
  group_id: "allura-myteam",
  user_id: "alice",
  content: "Client prefers structured weekly reports over ad-hoc updates",
  metadata: { source: "meeting-notes", project: "q3-review" },
  threshold: 0.85   // minimum score required to enter curator queue
})
```

### Search Memories

```typescript
memory_search({
  query: "client reporting preferences",
  group_id: "allura-myteam",
  user_id: "alice"
  // Returns ranked results using hybrid vector + BM25 search
})
```

### Full Tool Surface

| Tool | Description |
|------|-------------|
| `memory_add` | Store a memory — episodic capture → score → queue or hold |
| `memory_search` | Hybrid semantic + fulltext search across both stores |
| `memory_get` | Retrieve a single memory by ID |
| `memory_list` | List all memories for a user within a tenant |
| `memory_update` | Append-only versioned update — creates a SUPERSEDES chain |
| `memory_delete` | Soft-delete with 30-day recovery window |
| `memory_restore` | Recover a soft-deleted memory |
| `memory_promote` | Request curator promotion for an episodic memory |
| `memory_export` | Export memories filtered by group and canonical status |
| `memory_list_deleted` | List soft-deleted memories within the recovery window |

Full API documentation: [`.github/API-REFERENCE.md`](.github/API-REFERENCE.md)

---

## Dashboard

Allura ships a full **Mission Control dashboard** — every page reflects live data from PostgreSQL and Neo4j with graceful degraded-state handling when a service is unreachable.

<p align="center">
  <img src="public/readme/readme-allura-brain.png" alt="Allura Brain Architecture" width="720" />
</p>

| Page | Route | What You See |
|------|-------|-------------|
| **Overview** | `/dashboard` | Memory count, graph nodes, active agents, recent activity, system status |
| **Memory Feed** | `/dashboard/feed` | Live episodic event stream — filterable by decisions, insights, tasks |
| **Memory Space** | `/dashboard/memory-space` | Interactive knowledge graph — Neo4j nodes and relationships visualized |
| **Insights** | `/dashboard/insights` | Curator insight cards with All / Pending / Approved / Rejected tabs |
| **Evidence** | `/dashboard/evidence` | Evidence artifacts with Verified / Locked / Linked status |
| **Agents** | `/dashboard/agents` | Agent registry with confidence scores and graph node stats |
| **Projects** | `/dashboard/projects` | Sprint board — epics, stories, progress |
| **Skills** | `/dashboard/builder` | Curator queue — compose, approve, and reject memory promotions |
| **Settings** | `/dashboard/settings` | Connections, embedding config, governance controls, agent routing |
| **Governance Log** | `/dashboard/governance-log` | Append-only governance event log with severity filtering |
| **Policy** | `/dashboard/policy` | All 13 RuVix policies with enforcement status and recent violations |
| **Health** | `/dashboard/health` | Live health probes — PostgreSQL, Neo4j, MCP gateway, event queue |
| **Decisions** | `/dashboard/decisions` | ADR-style architectural decision records |
| **Curator** | `/curator` | Full human-in-the-loop review interface for promotion decisions |

---

## Configuration

```bash
# ── Databases ─────────────────────────────────────
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=allura
POSTGRES_USER=allura
POSTGRES_PASSWORD=<required>

NEO4J_URI=neo4j://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=<required>

# ── Governance ────────────────────────────────────
PROMOTION_MODE=soc2           # "soc2" (review-gated) or "auto" (auto-promote)
AUTO_APPROVAL_THRESHOLD=0.85  # 0.0 – 1.0 confidence threshold

# ── Security ──────────────────────────────────────
JWT_SECRET=$(openssl rand -base64 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)

# ── Embeddings ────────────────────────────────────
RUVECTOR_EMBEDDING_BASE_URL=http://localhost:11434  # Ollama endpoint
EMBEDDING_MODEL=nomic-embed-text                    # 768d default

# ── Dashboard ─────────────────────────────────────
ALLURA_DASHBOARD_PORT=3100    # Next.js dashboard
```

### Promotion Modes

| Mode | Behavior | Use When |
|------|----------|----------|
| `soc2` | Score ≥ threshold → enters curator review queue. Human approves before Neo4j write. | Production — compliance-conscious environments |
| `auto` | Score ≥ threshold → automatic promotion to Neo4j | Development and experimentation |

> `soc2` is an internal workflow label for the review-gated path. It does not imply current SOC 2 certification.

---

## Deployment

### Docker Compose (recommended)

```bash
docker compose up -d
curl http://localhost:3100/api/health/live
```

### Kubernetes

For production infrastructure, see [`.github/DEPLOYMENT.md`](.github/DEPLOYMENT.md).

### GHCR Image

```bash
# Available — use docker compose from source for the verified path
docker pull ghcr.io/charitablebusinessronin/allura_memory:latest
```

---

## Development

Allura is developed using **BMAD** (Behaviour-Motivated Agile Development) — a structured methodology that ties every code change back to a story, every story to acceptance criteria, and every merge to validation evidence. Sprint state is tracked in `_bmad/bmm/stories/sprint-status.yaml` and cross-referenced against the canonical Notion work board.

```bash
bun install
bun run dev          # Next.js dev server (port 3100)
bun run build        # Production build
bun run typecheck    # TypeScript — strict mode, no errors
bun test             # Unit test suite
bun run test:e2e     # Integration tests (requires Postgres + Neo4j)
bun run test:all     # Full suite: typecheck + lint + unit + e2e + MCP
```

### Curator Pipeline

```bash
bun run curator:run       # Score queued proposals
bun run curator:approve   # Approve pending proposals
bun run curator:reject    # Reject pending proposals
bun run curator:watchdog  # Continuous monitoring
```

### Embedding Backfill

```bash
bun run backfill:embeddings        # One-shot: embed all NULL rows via Ollama
bun run backfill:embeddings:watch  # Continuous (30s polling interval)
```

### Current Build Health

- **Test suite:** 1,960 pass · 0 fail · 231 skipped (2,191 total)
- **Typecheck:** clean (strict mode)
- **Active branch:** `dashboard-memory-space`

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Next.js 15 + Bun 1.0+ + TypeScript (strict mode) |
| **Episodic Store** | PostgreSQL 16 — append-only, RLS support |
| **Semantic Store** | Neo4j 5.26 — SUPERSEDES versioning |
| **Vector Search** | pgvector 0.8 + RuVector — hybrid HNSW + BM25 RRF (k=60) |
| **Embeddings** | nomic-embed-text 768d via Ollama (default); Qwen3 Matryoshka 1024d available |
| **Governance Kernel** | RuVix — proof-gated mutations, 13-policy enforcement |
| **Auth** | Clerk (dashboard); Proof-of-Intent for MCP operations |
| **Protocol** | MCP Streamable HTTP (2026 standard) + stdio |
| **Containerization** | Docker Compose (recommended) or Kubernetes |
| **Curator Pipeline** | HITL score-gated review queue with async PostgreSQL LISTEN/NOTIFY |

---

## What We Claim — And What We Don't

**We claim:**
- ✅ Dual-layer memory architecture (PostgreSQL episodic + Neo4j semantic) with clear promotion gates
- ✅ Append-only immutable audit trail — every write, decision, and promotion is preserved
- ✅ Proof-gated governance kernel with cryptographic validation on all mutations
- ✅ Human-in-the-loop curation as a mandatory first-class feature — not optional
- ✅ 13 configurable policies with real-time enforcement and full audit visibility
- ✅ Multi-tenant isolation at the schema, proof, and query layers
- ✅ Self-hosted — your data on your infrastructure
- ✅ MCP-native integration (Streamable HTTP 2026 + stdio) with any MCP client
- ✅ Architecture validated against 2026 research (Aegis, MemTier, Authenticated Workflows)

**We do not claim:**
- Current SOC 2 certification or regulatory approval (in progress)
- Zero hallucinations — memory reflects what agents captured, it does not correct them
- Benchmark superiority over mem0, Letta, or Zep — each optimizes for different tradeoffs
- Universal applicability to all use cases

Where features are directional or in-flight, we label them explicitly as *designed to*, *built to support*, or *positioned to enable*. Governance and auditability are operational today.

---

## Research Foundation

Allura's architecture is informed by current academic and production research:

| Area | References |
|------|-----------|
| **Agent OS Architecture** | AIOS (Rutgers, COLM 2025), Aegis Architecture (arXiv 2603.16938) |
| **Memory Architecture** | MemTier (arXiv 2605.03675), CoALA Framework, CraniMem |
| **Cryptographic Governance** | Authenticated Workflows (arXiv 2602.10465), PunkGo Kernel (arXiv 2602.20214) |
| **Search & Retrieval** | MemRouter (learned write-side admission, +10.3 F1), RRF fusion (k=60 consensus) |
| **Security** | SPIFFE/SVID workload identity, OWASP prompt injection defense |
| **Observability** | OpenTelemetry GenAI semantic conventions (stable 2026) |

Full technical audit: [`docs/research/technical-allura-memory-ai-governance-stack-research-2026-05-23.md`](docs/research/technical-allura-memory-ai-governance-stack-research-2026-05-23.md)

---

## Documentation

| Document | Description |
|----------|-------------|
| [`docs/allura/BLUEPRINT.md`](docs/allura/BLUEPRINT.md) | Core design intent and requirements |
| [`docs/allura/SOLUTION-ARCHITECTURE.md`](docs/allura/SOLUTION-ARCHITECTURE.md) | System topology and data flow |
| [`docs/allura/DATA-DICTIONARY.md`](docs/allura/DATA-DICTIONARY.md) | Schema and field reference |
| [`docs/allura/RISKS-AND-DECISIONS.md`](docs/allura/RISKS-AND-DECISIONS.md) | Architectural decisions and risk register |
| [`.github/API-REFERENCE.md`](.github/API-REFERENCE.md) | Full API surface documentation |
| [`.github/DEPLOYMENT.md`](.github/DEPLOYMENT.md) | Deployment guides (Docker, Kubernetes) |

---

## License

MIT

---

<p align="center">
  <strong>Allura Memory</strong> — governed, auditable, human-in-the-loop AI memory.<br/>
  Built for teams that need to know not just what their agents know, but how they came to know it.
</p>
