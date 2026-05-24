<p align="center">
  <img src="public/readme/logo-v2.png" alt="Allura Memory" width="120" />
</p>

<h1 align="center">Allura Memory</h1>

<p align="center">
  <strong>Memory That Shows Its Work</strong><br/>
  A self-hosted, governed AI memory system with traceable capture, human-in-the-loop curation, and dual-layer storage.
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> · <a href="#architecture">Architecture</a> · <a href="#features">Features</a> · <a href="#deployment">Deployment</a> · <a href="docs/allura/BLUEPRINT.md">Blueprint</a>
</p>

---

<p align="center">
  <img src="public/readme/readme-hero.png" alt="Allura Memory Dashboard" width="720" />
</p>

## Why Allura?

AI agents forget. Sessions end, context evaporates, and your team's hard-won knowledge disappears into the void.

Allura gives your agents **persistent, inspectable memory** — not a black box that silently decides what matters. Every memory is captured, scored, and routed through a clear pipeline where human judgment stays in the loop.

**Allura is for teams that want:**
- 🔍 **Inspectability** — trace what was recorded, when, and why it was promoted
- 🏛️ **Governance** — approval gates between raw capture and long-term knowledge
- 🔒 **Self-hosting** — your data, your infrastructure, your rules
- 🧩 **MCP-native** — plug into Claude, Cursor, OpenCode, or any MCP-compatible agent

---

## Architecture

<p align="center">
  <img src="public/readme/readme-allura-brain.png" alt="Allura Brain Architecture" width="720" />
</p>

Allura uses a **dual-layer memory architecture** — two purpose-built stores, each doing what it does best:

| Layer | Store | Role | Write Pattern |
|-------|-------|------|---------------|
| **Episodic** | PostgreSQL | Raw event capture, audit trail, high-volume traces | Append-only |
| **Semantic** | Neo4j | Curated knowledge, versioned relationships, promotion-gated | Review → Promote |

**The rule:** Every memory starts in PostgreSQL. Knowledge moves to Neo4j only after scoring and (optionally) curator review. History is never overwritten — superseded nodes are deprecated, not deleted.

### Memory Flow

<p align="center">
  <img src="public/readme/readme-memory-flow.png" alt="Memory Flow" width="640" />
</p>

```
Agent writes memory
  ↓
PostgreSQL stores append-only event (episodic layer)
  ↓
Content is scored (0–1 confidence)
  ↓
┌─ score < threshold → stays episodic (retrievable, not promoted)
└─ score ≥ threshold → enters review queue
      ↓
  Curator approves or rejects
      ↓
  Approved → promoted to Neo4j (semantic layer)
  Rejected → stays episodic with audit record
```

### Vector Search

Allura embeds every memory at write time using **Qwen3 Matryoshka embeddings** (1024d) via Ollama. Queries use **hybrid ANN + BM25 ranking** through pgvector HNSW indexes for semantic retrieval across both stores.

### Governance & RuVix Kernel

Memory promotions are gated by **RuVix**, a proof-gated mutation kernel inspired by OS design patterns. Every memory write is validated against 13 configurable policies before acceptance:

| Policy | Purpose |
|--------|---------|
| **POL-001** | Tenant isolation — enforce `group_id` boundaries |
| **POL-002** | Budget enforcement — token/compute limits per session |
| **POL-003** | Permission tier enforcement — viewer/curator/admin gates |
| **POL-004** | Actor validation — verify agent identity and claims |
| **POL-005** | Audit trail requirement — all writes logged |
| **POL-006** | Debug enforcement — disable debug output in production |
| **POL-007** | Source-of-truth gate — memory promotion requires Neo4j readiness |
| **POL-008** | Infrastructure target lock — prevent writes to wrong databases |
| **POL-009** | Project manifest validation — group_id format compliance |
| **POL-010–013** | Email zero-trust gates — validate sender, domain, headers |

Every policy is **enforcement-gated**: mutations require a cryptographically signed `ProofOfIntent` with a valid nonce, timestamp, and group_id. Policies are evaluated in a proof-gated context, preventing bypasses through direct database access.

**Key mechanism:** The curator pipeline uses `HITL` (Human-in-the-Loop) approval. Memories scoring above threshold enter a review queue. Curator approval creates a promotion proof, which is then validated against all policies before the memory enters Neo4j.

---

## Features

<p align="center">
  <img src="public/readme/infographic.png" alt="Feature Overview" width="640" />
</p>

| Feature | Description |
|---------|-------------|
| **Dual-layer storage** | PostgreSQL (episodic) + Neo4j (semantic) with clear promotion boundary |
| **Append-only audit trail** | Every write is an immutable event — reconstruct any point in time |
| **RuVix kernel governance** | 13-policy proof-gated mutation layer preventing unauthorized writes |
| **Human-in-the-loop curation** | Score-gated review queue before knowledge promotion to semantic layer |
| **Multi-tenant isolation** | `group_id`-based boundaries at schema and proof layers |
| **MCP protocol native** | Stdio + Streamable HTTP (2026 standard) for any MCP-compatible agent |
| **Vector search** | Hybrid ANN + BM25 ranking with RRF fusion (k=60) across both stores |
| **Policy enforcement** | Configurable rules: tenant isolation, budget limits, permission tiers, audit trails |
| **Self-hostable** | Docker Compose or Kubernetes — auth dependency: Clerk |
| **Versioned knowledge** | `SUPERSEDES` relationships in Neo4j — old facts deprecated, not erased |

---

## Quick Start

### Prerequisites

- **Docker** + Docker Compose
- **Bun** 1.0+
- **Ollama** (for local embeddings — pull `qwen3-embedding:8b`)

### 1. Clone & Configure

```bash
git clone https://github.com/Charitablebusinessronin/Allura_Memory.git
cd Allura_Memory
bun install

cp .env.example .env
# Edit .env with your database credentials and JWT secret
```

### 2. Start Infrastructure

```bash
docker compose up -d
```

This brings up PostgreSQL, Neo4j, and the Allura Brain HTTP gateway.

### 3. Verify

The MCP HTTP gateway runs on port **3201** by default. Check availability:

```bash
# MCP Streamable HTTP endpoint (primary integration path)
curl -X POST http://localhost:3201/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'

# Health check (MCP HTTP gateway)
curl http://localhost:3201/health
# → { "status": "healthy", "interface": "mcp-http", "transports": ["streamable-http"], ... }

# Liveness check (process heartbeat)  
curl http://localhost:3201/live
# → { "alive": true, "uptime": 123.45, "timestamp": "2026-04-20..." }

# Readiness check (PostgreSQL, Neo4j, MCP initialized)
curl http://localhost:3201/ready
# → { "ready": true, ... }
```

### 4. Connect Your Agent

Add to your MCP client config (Claude Desktop, Cursor, etc.):

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

**HTTP Gateway:**
```json
{
  "mcpServers": {
    "allura": {
      "url": "http://localhost:3201/mcp"
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
  content: "Alice prefers dark mode for all UIs",
  metadata: {
    source: "conversation"
  },
  threshold: 0.85
})

// Search memories
memory_search({
  query: "dark mode preferences",
  group_id: "allura-myteam",
  user_id: "alice"
})

// Retrieve a specific memory
memory_get({
  id: "mem_7f9e2c3a1b5d",
  group_id: "allura-myteam"
})

// List all memories for a user
memory_list({
  group_id: "allura-myteam",
  user_id: "alice"
})

// Delete (soft — recoverable within 30 days)
memory_delete({
  id: "mem_7f9e2c3a1b5d",
  group_id: "allura-myteam",
  user_id: "alice"
})
```

### Optional: Global Claude, Codex, and OpenCode Plugins

Ronin's local development setup can also use global runtime plugins that keep Allura Brain available across agent surfaces.

| Runtime | Plugin | Purpose |
|---------|--------|---------|
| **OpenCode** | `~/.config/opencode/plugins/allura-brain.ts` | Ensures the `allura-brain` MCP endpoint, injects memory governance into compaction, and blocks legacy `group_id` tenants. |
| **Claude Code** | `~/.claude/plugins/allura-brain/` | Adds Allura Brain MCP config, a governance skill, and hooks that block legacy/non-`allura-*` memory tenants. |
| **Claude + Codex cowork** | `~/.claude/plugins/allura-cowork/` mirrored to `~/.codex/plugins/cache/plugins-cli/allura-cowork/0.1.0/` | Provides a shared handoff protocol so Claude and Codex coordinate through Allura without pretending both runtimes actually executed. |

The cowork rule is simple:

```text
Intent → Project context → Allura Brain → Required skills → Runtime route → Work → Validate → Handoff / remember
```

Use the cowork plugin when a task says “cowork,” “Claude and Codex,” or “handoff.” It should produce a short receipt that names the active runtime, memory status, project overlay, route, validation path, and handoff target.

> These global plugin paths are user-machine setup, not required application source. Restart Claude Code, Codex, or OpenCode after changing global plugin/config files.

---

## Configuration

All configuration lives in `.env`:

```bash
# ── Core (all required in production) ───────────
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=allura
POSTGRES_USER=allura
POSTGRES_PASSWORD=<required — no default>
NEO4J_URI=neo4j://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=<required — no default>

# ── Governance ────────────────────────
PROMOTION_MODE=soc2          # "soc2" (review-gated) or "auto" (auto-promote)
AUTO_APPROVAL_THRESHOLD=0.85 # minimum score for promotion eligibility

# ── Security ──────────────────────────
JWT_SECRET=$(openssl rand -base64 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)

# ── Embeddings ────────────────────────
# Runtime embedding service URL used by RuVector embedding code.
# For host execution use http://localhost:11434.
# For Docker services use http://host.docker.internal:11434 with extra_hosts host-gateway.
RUVECTOR_EMBEDDING_BASE_URL=http://localhost:11434  # Ollama for host execution
EMBEDDING_MODEL=qwen3-embedding:8b
```

### Promotion Modes

| Mode | Behavior | Best For |
|------|----------|----------|
| `soc2` | Score ≥ threshold → curator review queue | Production, audit-conscious teams |
| `auto` | Score ≥ threshold → automatic promotion | Development, experimentation |

> **Note:** `soc2` is an internal workflow label for a stricter review path. It does **not** imply current SOC 2 certification.

---

## Dashboard & Governance Visibility

Allura's web dashboard surfaces all governance operations with full transparency:

| Page | Purpose |
|------|---------|
| **Memory** | Browse episodic captures, review scores, search by content |
| **Audit** | Immutable event log — trace every write, curator decision, and promotion |
| **Policy** | View all 13 RuVix kernel policies, enforcement status, and recent policy violations |
| **Governance** | Real-time enforcement metrics: policy checks/violations, curator queue depth, promotion decisions |

The **Policy page** displays all kernel policies with their severity, enforcement status, and configurability. Recent enforcement events show which policies were checked on each write and which were violated (with full audit trails).

Access the dashboard at **`http://localhost:3100/dashboard`** after bringing up Docker Compose.

---

## Screenshots

<p align="center">
  <img src="docs/screenshots/01-memory-page-desktop.png" alt="Memory Page — Desktop" width="360" />
  <img src="docs/screenshots/02-memory-page-mobile.png" alt="Memory Page — Mobile" width="180" />
  <img src="docs/screenshots/03-audit-page-desktop.png" alt="Audit Page — Desktop" width="360" />
</p>

---

## Brand & Visual Direction

<p align="center">
  <img src="public/readme/readme-brand-system.png" alt="Brand System" width="640" />
</p>

Allura's visual language is **warm, magnetic, and clear** — designed to reward a closer look.

- **Warmth over cold utility** — softer palettes, rounded corners, breathing room
- **Magnetic clarity** — information hierarchy that draws the eye without shouting
- **Considered restraint** — every element earns its place
- **Grounded sophistication** — professional without being sterile

This isn't "magic AI." It's a more legible memory system with a more considered interface.

---

## Deployment

### Docker Compose (recommended for most teams)

```bash
docker compose up -d
curl http://localhost:3100/api/health/live
```

### Pull from GHCR

> **Note:** GHCR images are published from CI but not yet verified for standalone pull-deploy. Use `docker compose up -d` from source for the recommended path.

```bash
# Available but not yet verified for standalone deployment
docker pull ghcr.io/charitablebusinessronin/allura_memory:latest
```

### Kubernetes

For teams running production infrastructure — see [`.github/DEPLOYMENT.md`](.github/DEPLOYMENT.md).

---

## API Reference

Full API documentation lives in [`.github/API-REFERENCE.md`](.github/API-REFERENCE.md).

### Core Tools

| Tool | Description |
|------|-------------|
| `memory_add` | Store a new memory (episodic → score → promote/queue) |
| `memory_search` | Hybrid semantic + fulltext search across both stores |
| `memory_get` | Retrieve a single memory by ID |
| `memory_list` | List all memories for a user within a tenant |
| `memory_update` | Append-only versioned update (creates SUPERSEDES chain) |
| `memory_delete` | Soft-delete with 30-day recovery window |
| `memory_restore` | Recover a soft-deleted memory |
| `memory_promote` | Request curator promotion for an episodic memory |
| `memory_export` | Export memories filtered by group and canonical status |
| `memory_list_deleted` | List soft-deleted memories within recovery window |

---

## Development

```bash
bun install
bun run dev          # Start Next.js dev server (Turbo)
bun run build        # Production build
bun run typecheck    # TypeScript check
bun test             # Unit tests
bun run test:e2e     # Integration tests
bun run test:all     # Full suite (typecheck + lint + unit + e2e + MCP)
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

| Document | Description |
|----------|-------------|
| [`docs/allura/BLUEPRINT.md`](docs/allura/BLUEPRINT.md) | Core design reference and requirements |
| [`.github/ARCHITECTURE.md`](.github/ARCHITECTURE.md) | System architecture and data flow |
| [`.github/API-REFERENCE.md`](.github/API-REFERENCE.md) | Full API surface documentation |
| [`.github/DEPLOYMENT.md`](.github/DEPLOYMENT.md) | Deployment guides (Docker, K8s) |
| [`docs/allura/DESIGN.md`](docs/allura/DESIGN.md) | UI/UX design decisions |
| [`docs/allura/DATA-DICTIONARY.md`](docs/allura/DATA-DICTIONARY.md) | Schema and field reference |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Runtime** | Next.js 15 + Bun 1.0+ + TypeScript (strict mode) |
| **Episodic Store** | PostgreSQL 16 (append-only, RLS support) |
| **Semantic Store** | Neo4j 5.26 (SUPERSEDES versioning) |
| **Vector Search** | pgvector 0.8 + RuVector (hybrid HNSW + BM25 RRF) |
| **Embeddings** | Qwen3 Matryoshka 1024d via Ollama (nomic v2 migration path available) |
| **Governance** | RuVix kernel (proof-gated mutations, 13-policy enforcement) |
| **Auth** | Clerk (dashboard); Proof-of-Intent for MCP operations |
| **Protocol** | MCP Streamable HTTP (2026 standard) + stdio (local dev) |
| **Containerization** | Docker Compose (recommended) or Kubernetes |
| **Curator Pipeline** | Score-gated HITL promotion queue (async with PostgreSQL LISTEN/NOTIFY) |

### Architecture Validation

Allura's architecture has been validated against current 2026 research:
- **Kernel-gate governance** ✅ (Aegis Architecture, arXiv 2603.16938)
- **Dual-layer episodic + semantic** ✅ (MemTier, arXiv 2605.03675; CoALA framework)
- **Proof-of-Intent cryptographic attestation** ✅ (Authenticated Workflows, arXiv 2602.10465)
- **Hybrid RRF search (k=60)** ✅ (Field consensus, MemRouter benchmarks)
- **CQRS architecture (PG write / Neo4j read model)** ✅ (Domain-driven design pattern validation)
- **Multi-tenant isolation via group_id + RLS** ✅ (Production best practice, 2026 CNCF survey)

---

## What We Claim — And What We Don't

**We do claim:**
- ✅ Dual-layer memory architecture (episodic PG + semantic Neo4j) with clear promotion gates
- ✅ Append-only immutable audit trail by design (tamper-evident with full reconstruction)
- ✅ Kernel-gated governance with proof-of-intent cryptographic validation
- ✅ Human-in-the-loop curation as mandatory first-class feature (not optional)
- ✅ 13 configurable policies with real-time enforcement and audit visibility
- ✅ Multi-tenant isolation with group_id at schema, proof, and query layers
- ✅ Self-hosted deployment on your infrastructure (Docker Compose or Kubernetes)
- ✅ MCP-native integration (2026 Streamable HTTP + stdio) with any MCP client
- ✅ Architecture validated against 2026 research (Aegis, MemTier, Authenticated Workflows)

**We do not claim:**
- Current SOC 2 certification or banking-grade regulatory approval (in progress)
- Zero hallucinations or autonomous truth (memory reflects, not corrects)
- Benchmark superiority vs. mem0/Letta/Zep (each excels at different tradeoffs)
- Perfect accuracy or universal applicability

Where the product is directional or in-flight, we explicitly label it as **designed to**, **built to support**, or **positioned to enable** — never as a verified claim. Governance and auditability are present and operational today. Regulatory certification is a downstream artifact.

---

## Design Principles

Allura follows a Brooksian approach to system design:

1. **Conceptual integrity** — one coherent vision, not a patchwork of best practices
2. **Explicit approval** — no silent automation around what becomes knowledge
3. **Surgical team specialization** — each component does one thing well
4. **Separation of concerns** — episodic and semantic are architecturally distinct
5. **Append-only audit** — history is preserved, never overwritten
6. **No silver bullet** — essential complexity can't be wished away

> **Allura governs. Runtimes execute. Curators promote.**

---

## Research & References

Allura's design is informed by current academic and production research in AI agent systems:

| Area | Key References |
|------|-----------------|
| **Agent OS Architecture** | AIOS (Rutgers, COLM 2025), Aegis Architecture (arXiv 2603.16938), Qualixar OS (arXiv 2604.06392) |
| **Memory Architecture** | MemTier (arXiv 2605.03675), CoALA Framework, CraniMem (temporal grounding) |
| **Cryptographic Governance** | Authenticated Workflows (arXiv 2602.10465), PunkGo Kernel (arXiv 2602.20214), ESAA Pattern (arXiv 2603.06365) |
| **Search & Retrieval** | MemRouter (learned write-side admission, +10.3 F1 improvement), RRF fusion (k=60 consensus) |
| **Scalability** | Neo4j multi-tenancy, async embedding queues, PostgreSQL RLS, Kubernetes health probes |
| **Security** | SPIFFE/SVID workload identity, mTLS service mesh, prompt injection defense-in-depth (OWASP) |
| **Observability** | OpenTelemetry GenAI semantic conventions (stable 2026), `gen_ai.memory.*` spans |

**Full technical audit:** See [`docs/research/technical-allura-memory-ai-governance-stack-research-2026-05-23.md`](docs/research/technical-allura-memory-ai-governance-stack-research-2026-05-23.md) for comprehensive analysis including competitive positioning vs. mem0, Letta, Zep, and emerging patterns in 2025–2026 production deployments.

---

## License

MIT

---

Built by [ronin704](https://github.com/ronin704). Allura is a self-hosted, governance-oriented memory system — architected for teams that require transparent, auditable, human-in-the-loop knowledge capture and promotion.
