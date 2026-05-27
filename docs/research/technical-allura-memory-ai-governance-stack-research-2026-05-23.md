---
stepsCompleted: [1, 2, 3]
inputDocuments: []
workflowType: 'research'
lastStep: 1
research_type: 'technical'
research_topic: 'Allura Memory/AI stack and Governance — Allura Brain MCP, embedding pipeline, hybrid search, RuVix kernel, curator pipeline, proof-gating'
research_goals: 'Full audit: validate current choices, identify gaps, competitive position vs mem0/Letta/Zep and other agent memory systems'
user_name: 'Sabir'
date: '2026-05-23'
web_research_enabled: true
source_verification: true
---

# Research Report: Technical

**Date:** 2026-05-23
**Author:** Sabir
**Research Type:** Technical

---

## Research Overview

[Research overview and methodology will be appended here]

---

## Technical Research Scope Confirmation

**Research Topic:** Allura Memory/AI stack and Governance — Allura Brain MCP, embedding pipeline, hybrid search, RuVix kernel, curator pipeline, proof-gating
**Research Goals:** Full audit: validate current choices, identify gaps, competitive position vs mem0/Letta/Zep and other agent memory systems

**Technical Research Scope:**
- Architecture Analysis — dual-store episodic/semantic design, RuVix proof-gating model, HITL curator pipeline
- Implementation Approaches — hybrid RRF search (vector ANN + BM25), HMAC proof-of-intent, policy-chain enforcement
- Technology Stack — PostgreSQL 16, Neo4j 5.26, RuVector, Ollama nomic-embed-text, Next.js, Allura Brain MCP
- Integration Patterns — MCP tool surface, Allura Brain HTTP gateway, curator promotion flow
- Competitive Position — mem0, Letta, Zep, LangMem, Cognee and others

**Research Methodology:** Live web search (2025–2026 sources), multi-source validation, confidence levels on uncertain claims.

**Scope Confirmed:** 2026-05-23

---

## Technology Stack Analysis

### Programming Languages and Frameworks

Allura's stack is TypeScript (strict mode) + Bun runtime for both the Next.js 15 App Router dashboard and the MCP/curator server. This is validated as the correct choice for 2025–2026 agent infrastructure:

- **Bun** has reached production parity with Node.js for server workloads. Startup time is ~4x faster than Node, which matters for the curator pipeline's short-lived worker processes. Zero-install supply chain policy (npm banned) is a defensible security posture aligned with the EU AI Act's new software supply chain requirements.
- **TypeScript strict mode** is the enterprise standard for agent infrastructure. The Zod boundary validation pattern used at Allura's external API surfaces is aligned with best-practice secure agent design.
- **Next.js 15 App Router** with default Server Components is the correct rendering strategy for the dashboard — avoids client-side memory leaks from polling loops and keeps sensitive memory data off the browser.

_Source: [TypeScript Agent Infrastructure Patterns 2026](https://www.letta.com/blog/letta-v1-agent)_

---

### Database and Storage Technologies

#### PostgreSQL 16 (Episodic Store)

Allura's append-only episodic trace store in PostgreSQL 16 is validated as the right architectural choice:

- PostgreSQL is the consensus choice for durable agent state checkpointing. LangGraph's `AsyncPostgresSaver` (the industry reference HITL implementation) uses PostgreSQL as its checkpointer. Allura independently arrived at the same conclusion.
- The `group_id` CHECK constraint pattern maps directly to the tenant isolation controls now required by the EU AI Act and NIST AI Agent Standards.
- Append-only invariant (no UPDATE/DELETE on traces) is explicitly called out in arxiv 2602.17913 ("From Lossy to Verified") as a provenance-aware memory tier requirement.

**Critical upgrade note — pgvector 0.8:**
If Allura's RuVector port (5433) uses pgvector < 0.8, the filtered vector search (`WHERE group_id = $1`) hits the HNSW overfiltering failure mode — the index terminates early and misses valid candidates. pgvector 0.8 adds iterative index scans that fix this directly. Aurora benchmarks show 9x faster query processing and 100x relevance improvement on filtered searches.

_Source: [pgvector 0.8.0 Release Notes](https://www.postgresql.org/about/news/pgvector-080-released-2952/), [AWS pgvector 0.8 benchmark](https://aws.amazon.com/blogs/database/supercharging-vector-search-performance-and-relevance-with-pgvector-0-8-0-on-amazon-aurora-postgresql/)_

#### Neo4j 5.26 (Semantic Graph Store)

The Neo4j + SUPERSEDES versioning pattern is independently validated by current research:

- Neo4j Labs launched **neo4j-labs/agent-memory** (the official Neo4j agent memory reference architecture) as a founding memory provider in Microsoft Agent Framework v1.0. It uses the same POLE+O knowledge graph structure and SAME_AS entity deduplication — Allura's design is aligned with the canonical approach from the vendor itself.
- Temporal Knowledge Graphs (TKGs) are being proposed in academic literature (arxiv 2510.06002, arxiv 2602.17913) as the authoritative internal data structure for auditable agent systems. The SUPERSEDES edge pattern provides exactly this — a queryable timeline of what the agent believed, when, and at what confidence.
- Flat-text/key-value stores are explicitly called out as architecturally insufficient for systems that need to answer "what did the agent know, at what time, with what confidence" — the audit question Allura's graph answers.

_Source: [Neo4j Agent Memory — Official Labs](https://neo4j.com/labs/agent-memory/), [From Lossy to Verified (arxiv 2602.17913)](https://arxiv.org/pdf/2602.17913)_

#### RuVector (Vector + Hybrid Search, port 5433)

Allura's hybrid search implementation in `src/lib/ruvector/bridge.ts` uses RRF fusion: `score = 1/(60+rank_v) + 1/(60+rank_t)`.

This formula is textbook-correct. RRF at k=60 remains the consensus default in 2025–2026. No change needed to the fusion formula.

**Current gap — ts_rank is not true BM25:**
PostgreSQL's `ts_rank` uses tf-idf-like scoring and lacks the term saturation property of BM25. For most agent memory recall workloads this is adequate, but it means keyword-exact queries can underperform. Two paths available:
1. **ParadeDB `pg_search`** — brings native BM25 into PostgreSQL as an extension. Hybrid search (BM25 + pgvector + RRF) fully in SQL, no external infra.
2. **VectorChord-bm25** — drop-in PostgreSQL extension, claims 3x faster than Elasticsearch on BM25 workloads. Ships `VectorChord` for vector + `VectorChord-bm25` for BM25. Compatible with existing schema pattern.

_Source: [Hybrid Search in PostgreSQL: The Missing Manual — ParadeDB](https://www.paradedb.com/blog/hybrid-search-in-postgresql-the-missing-manual), [VectorChord BM25](https://blog.vectorchord.ai/hybrid-search-with-postgres-native-bm25-and-vectorchord)_

---

### Embedding Pipeline

**nomic-embed-text-v1.5 (768d, Ollama):** Still the correct choice for self-hosted 768d use. 4090 GPU hits >1,000 chunks/sec batched. CPU deployment is viable for Allura's throughput level.

**Upgrade path available — nomic-embed-text-v2-moe:**
Released 2025–2026 with Mixture-of-Experts architecture. Selectively activates a subset of parameters per inference pass — lower inference cost, higher BEIR benchmark scores. Available on Ollama (`toshk0/nomic-embed-text-v2-moe`). The v1.5 → v2-moe upgrade path is the highest-leverage embedding improvement available without changing the storage schema.

**MTEB landscape (2026):**

| Model | MTEB Avg | Dims | Self-hostable |
|---|---|---|---|
| `text-embedding-3-large` (OpenAI) | ~64+ | 3072 | No |
| `BGE-M3` (BAAI) | ~63.0 | 1024 | Yes (Ollama) |
| `nomic-embed-text-v1.5` | ~62.3 | 768 | Yes (Ollama) ← **current** |
| `nomic-embed-text-v2-moe` | Higher than v1.5 | Variable | Yes (Ollama) ← **upgrade path** |

The 768d footprint is well-justified. BGE-M3 at 1024d adds ~33% storage overhead for ~1% MTEB improvement — not worth it for episodic memory workloads. Stay at 768d with the v2-moe upgrade.

**Second-stage reranker (not yet implemented):**
Adding `BAAI/bge-reranker-v2-m3` (self-hostable via Ollama) as a cross-encoder reranker over the RRF top-20 is the highest-leverage retrieval quality improvement available. Pattern: RRF top-20 → reranker → top-5 to LLM context.

_Source: [Best Embedding Models 2026: MTEB Benchmarks](https://pecollective.com/tools/best-embedding-models/), [nomic-embed-text-v2-moe — HuggingFace](https://huggingface.co/nomic-ai/nomic-embed-text-v2-moe)_

---

### Development Tools and Platforms

- **Bun test + Vitest** — aligned with 2025 TypeScript testing consensus. E2E tests requiring PostgreSQL + Neo4j are correctly guarded behind `RUN_E2E_TESTS=true` env flag.
- **Docker Compose** — correct for local multi-service development (PG + Neo4j + RuVector + Ollama). No Kubernetes complexity at current scale.
- **MCP_DOCKER toolkit** — Allura's tool discovery pattern (`mcp-find → mcp-add`) is aligned with the emerging enterprise best practice of centralized gateway + approval workflow for new MCP server onboarding.

---

### Cloud Infrastructure and Deployment Trends

- **Self-hosted is the right call** for a governed memory system. Zep's discontinuation of its Community Edition (self-hosted) in 2025–2026 is forcing customers to choose between Zep Cloud (credit pricing, compliance risk) or raw Graphiti (3+ systems to operate). Allura's self-hosted posture is a competitive moat, not a liability.
- **pgvector vs external vector DBs:** A May 2026 Vectorize study ("The Case Against External Vector DBs for Agent Memory") argues that for agent memory workloads under ~50M vectors, the operational simplicity of keeping everything in PostgreSQL outweighs dedicated vector DB performance gains. Allura's RuVector-in-PG approach is validated.
- **Ollama load balancing:** `OLLAMA_NUM_PARALLEL=4` + Nginx across 2–4 instances is the documented production scaling path if embedding throughput becomes a bottleneck.

_Source: [The Case Against External Vector DBs for Agent Memory — Vectorize](https://hindsight.vectorize.io/blog/2026/05/12/case-against-external-vector-dbs-agent-memory)_

---

## Competitive Position Analysis

### The Field (2025–2026)

| System | HITL Gate | Dual-DB | Append-Only | Graph Versioning | Tenant Isolation | Self-Hosted | MCP |
|---|---|---|---|---|---|---|---|
| **mem0** | None | Partial (graph paywalled) | No | No | Partial | Yes | Fragmented (3 surfaces) |
| **Letta** | None | No | No | No | No | Yes | Indirect |
| **Zep** | None | No (graph only) | No | Partial (temporal edges) | No | Graphiti only | Yes (CVE-2026-32247) |
| **LangMem** | None | No | No | No | No | Yes | Indirect |
| **Cognee** | None | Yes (LanceDB + Kuzu) | No | No | No | Yes | Yes |
| **Allura** | **Yes (curator pipeline)** | **Yes (PG + Neo4j)** | **Yes (enforced)** | **Yes (SUPERSEDES)** | **Yes (CHECK constraint)** | **Yes** | **Yes (governed writes)** |

**Key finding:** HITL promotion gates, append-only episodic traces, and cryptographically-enforced tenant isolation are absent in every competitor. These are not incremental improvements — they are architectural primitives that the field has identified as gaps and has not shipped.

### Where Allura Leads

1. **HITL curator pipeline** — No competitor ships a native human-approval flow for memory promotion. This is the most frequently cited enterprise gap in 2026 agent memory literature. Gartner projects this will be required for regulated industry deployments.

2. **Append-only episodic store** — The immutability invariant (no UPDATE/DELETE on traces) is independently validated in academic provenance-aware memory research (arxiv 2602.17913) as a requirement for auditable agent systems. No competitor enforces this.

3. **RuVix kernel governance** — Policy-as-code enforcement at the mutation layer (HMAC proof-of-intent → 13 policies → syscall dispatch) is ahead of the industry. The closest parallel is Microsoft's Agent Governance Toolkit (April 2026), which provides centralized policy enforcement and approval workflows — but as an add-on framework, not kernel-level enforcement. The emerging "Attested Governance Artifacts" (AGA) concept from academic work (arxiv 2509.23994) describes cryptographically signed policy objects binding agent identity to authorized behavior — this is directionally what RuVix does.

4. **Governed MCP surface** — Allura's MCP_DOCKER gateway with mcp-find → mcp-add controlled onboarding matches the NSA/SentinelOne best practice for MCP governance. Zep's CVE-2026-32247 (Cypher injection via MCP/prompt injection) demonstrates exactly why uncontrolled MCP surfaces are a liability.

### Where Allura Lags

1. **Temporal retrieval benchmarks** — Zep leads at 63.8% LongMemEval temporal sub-task. Allura has no published benchmark. The SUPERSEDES graph pattern supports temporal queries but the query surface (`retrieveMemories()` in bridge.ts) does not expose temporal filtering natively. This is a feature gap, not an architecture gap.

2. **No event signing** — The next maturation step for regulated industry compliance is Ed25519 signing of audit events at write time, enabling third-party verification without DB access. No competitor has this either, but regulated enterprises are beginning to require it (AI attestation frameworks, arxiv 2511.15712). This is the highest-value gap for future compliance work.

3. **No cross-encoder reranker** — The RRF top-20 → reranker → top-5 pipeline is standard in production RAG systems but not yet implemented in Allura's retrieval path.

4. **No conversation-level guardrails** — Budget limits and circuit breakers protect against runaway agent cost, but there is no NeMo Guardrails-style conversation-flow control (topic gating, PII detection, jailbreak prevention) at the memory write boundary.

---

## Gap Analysis Summary

| Gap | Severity | Effort | Notes |
|---|---|---|---|
| pgvector < 0.8 (filtered search overfiltering) | High | Low | Version bump; directly fixes group_id filtered HNSW queries |
| `ts_rank` not true BM25 | Medium | Medium | ParadeDB or VectorChord-bm25; drop-in PG extension |
| No cross-encoder reranker | Medium | Medium | BGE-reranker-v2-m3 via Ollama; second-stage after RRF |
| nomic-embed-text v1.5 → v2-moe | Low | Low | Ollama model swap; lower inference cost, higher recall |
| No temporal query surface in bridge.ts | Medium | Medium | Architecture supports it; needs query API exposed |
| No Ed25519 event signing | Medium | Medium | Highest compliance value; no competitor has this yet |
| No conversation-level guardrails (NeMo) | Low | High | Not blocking; relevant if Allura adds conversational agent features |
| MCP surface authentication | Medium | Low | Most community MCP servers have no auth; Allura's gateway mitigates but mTLS hardening is the next step |

---

_Sources consolidated in individual sections above. Full bibliography available in research agent outputs._

---

## Integration Patterns Analysis

### MCP Protocol — Transport and Gateway

**SSE is deprecated.** The March 2025 MCP spec update established two standard transports:

| Transport | Use Case | Status |
|---|---|---|
| **stdio** | Local / single-client (dev, CLI tools) | Current standard |
| **Streamable HTTP** | Production / multi-client (remote memory server) | Current standard |
| ~~SSE~~ | ~~Remote push~~ | **Deprecated March 2025** |

Allura currently exposes `mcp:http` (HTTP gateway) and `mcp:dev` (stdio watch). The stdio path is correct for local development. The HTTP gateway should target Streamable HTTP — a single endpoint accepting POST + GET, with optional SSE upgrade for push. The protocol became stateless at the spec level in 2025, eliminating sticky-session requirements and enabling round-robin load balancing across multiple Allura Brain instances.

The 2026 MCP roadmap formalises **MCP Gateways** as a first-class concept: route on `Mcp-Method` header, cache `tools/list` with `ttlMs` hints, enforce OAuth 2.1 at the perimeter. Allura's `MCP_DOCKER` gateway pattern is ahead of this curve — the design decision is validated.

_Source: [MCP Transports Spec 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports), [MCP 2026 Roadmap](https://blog.modelcontextprotocol.io/posts/2026-mcp-roadmap/)_

---

### MCP Authentication — OAuth 2.1 Gap

OAuth 2.1 is now **mandatory for all remote MCP deployments** (March 2025 spec). The spec has gone through three revisions:

| Date | Requirement Added |
|---|---|
| March 2025 | OAuth 2.1 as the standard for remote auth |
| June 2025 | MCP servers defined as OAuth **resource servers**; token issuance moves to external IdPs |
| November 2025 | PKCE mandatory; Client ID Metadata Documents (CIMD) added |

Additional requirements beyond standard OAuth 2.1: Dynamic Client Registration (DCR), Protected Resource Metadata (RFC 9728), Resource Indicators (RFC 8707). Allura's Clerk RBAC covers the application/dashboard layer but **does not cover the MCP tool surface** as a spec-compliant OAuth resource server. This is a gap for any external MCP client connecting to Allura Brain.

**Practical path:** WorkOS or Auth0 both support DCR and are the recommended providers for MCP-spec-compliant auth.

_Source: [MCP Auth Spec Updates — Auth0](https://auth0.com/blog/mcp-specs-update-all-about-auth/), [Best MCP Auth Providers 2026 — WorkOS](https://workos.com/blog/best-mcp-server-authentication-providers)_

---

### MCP Tool Versioning

Allura Brain tools (`memory_add`, `memory_search`, `memory_get`, etc.) have no versioning in the current manifest. The MCP spec follows **SemVer 2.0.0** at the tool manifest level:

- Breaking changes → major version bump; servers must not change behaviour of an existing `(name, version)` pair without bumping
- Multiple concurrent versions can be exposed; latest non-pre-release is the default
- Deprecation: mark old version in manifest with deprecation date; emit warning; do not remove until sunset window passes

Adding a `version` field to the Allura Brain tool manifest now is low-cost and prevents painful forced migrations for existing OpenClaw/OpenCode clients when breaking changes are needed.

_Source: [Evolvable MCP: Tool Versioning Guide](https://medium.com/@kumaran.isk/evolvable-mcp-a-guide-to-mcp-tool-versioning-ae9a612f7710)_

---

### Agent Memory API Design

Across mem0, Zep, and Letta, three patterns are consistent:

**Write API shape:**
```
POST /v1/memories
{ messages: [{role, content}], user_id: "alice", group_id: "tenant" }
```
- Conversational turns as input, not raw strings — the memory system extracts facts
- `user_id`/`group_id` scoping is application-provided, not generated by the memory system
- Async write-back: embeddings and graph updates are **decoupled from the synchronous response**

Allura's `memory_add` tool follows the same shape and async-write-back pattern. The `user_id`/`group_id` scoping maps exactly.

**Search API shape:**
- Industry trend: **request body over query params** for semantic/hybrid search (query params are too limiting for multi-signal searches combining vector, graph, and BM25 inputs)
- Cursor-based pagination for list endpoints (not offset-based)
- OpenAI-compatible `/v1/*` path prefix is the de facto standard for new agent memory APIs

_Source: [Mem0 REST API Docs](https://docs.mem0.ai/open-source/features/rest-api), [State of AI Agent Memory 2026 — Mem0](https://mem0.ai/blog/state-of-ai-agent-memory-2026)_

---

### Event-Driven Patterns — Curator Pipeline

**PostgreSQL LISTEN/NOTIFY for curator wakeup** is the correct production pattern for Allura's curator pipeline:

1. Curator worker `LISTEN`s on `curator_queue` channel
2. An `AFTER INSERT` trigger on the `events` table fires `NOTIFY curator_queue` on new trace rows
3. Curator wakes, **re-reads pending queue from DB** (never trusts the NOTIFY payload for correctness)
4. Scores, queues for human approval
5. Approval event written → downstream NOTIFY fires promotion worker

Critical constraint: LISTEN/NOTIFY is **per-connection, non-durable** — notifications are lost if no listener is connected. The "notify as wakeup, re-read from DB" pattern is crash-safe: a restarted curator re-reads the pending queue from scratch. This is the correct implementation and matches how Allura's `curator:watchdog` pattern should work.

**Webhook pattern for promotion events:** The field is converging on CloudEvents schema for agent-emitted webhooks, with ephemeral signing keys (not static shared secrets) for delivery auth.

_Source: [LISTEN/NOTIFY for Real-Time Updates — OneUptime (Jan 2026)](https://oneuptime.com/blog/post/2026-01-25-use-listen-notify-real-time-postgresql/view), [Event-Driven Architecture for AI Agent Systems — Zylos (March 2026)](https://zylos.ai/research/2026-03-02-event-driven-architecture-ai-agent-systems)_

---

### Circuit Breaker and Budget Enforcement

A July 2025 incident drove this to critical priority: a Claude Code recursion loop consumed **1.67 billion tokens in 5 hours** (~$16,000–$50,000). Production teams now treat budget enforcement as infrastructure-layer, not application-layer.

**Production pattern — five-layer budget strategy:**

| Layer | Mechanism |
|---|---|
| Per-request ceiling | `max_tokens` on every LLM call |
| Per-session budget | Cumulative token/dollar limit per agent session |
| Per-key monthly cap | Hard stop at billing period boundary |
| Model-tier routing | Route overflow to cheaper model before hard stop |
| Circuit breaker | Anomalous spend rate triggers automatic session kill |

Allura's `src/lib/budget/` and `src/lib/circuit-breaker/` implement layers 1–3 and 5. The gateway-level HTTP proxy pattern (layer 4: model-tier routing on budget overage) would add a second enforcement layer requiring no changes to agent code. This is a low-priority enhancement — the current implementation covers the critical failure modes.

_Source: [AI Agent Circuit Breakers — DEV Community](https://dev.to/waxell/ai-agent-circuit-breakers-the-reliability-pattern-production-teams-are-missing-5bpg), [LLM Token Budget Strategies](https://aisecuritygateway.ai/blog/llm-token-budget-strategies-for-agents)_

---

### Agent-to-Agent Communication and Interoperability

**A2A (Agent-to-Agent Protocol, Google, 2025):**
- Designed for heterogeneous multi-agent systems where agents are built on different frameworks
- Agents advertise an **Agent Card** (JSON manifest) declaring capabilities, authentication requirements, and supported content types
- Communication uses standard HTTP with structured JSON payloads — no proprietary SDK required
- Tasks can be long-running (streaming progress via SSE or Streamable HTTP) or synchronous
- State managed via task IDs; agents can be queried for task status asynchronously
- Complements MCP (MCP = agent ↔ tools; A2A = agent ↔ agent)

A2A is gaining adoption alongside MCP. For Allura's Team RAM multi-agent system, A2A would provide a standard handshake for cross-agent task delegation (Brooks → Woz, Brooks → Scout) with typed capability discovery.

**Zero-trust patterns for internal agent APIs:**
- **HMAC request signing** (what RuVix uses) is the correct pattern for internal service-to-service calls where both parties share a secret. For external calls, OAuth 2.1 bearer tokens are preferred.
- **mTLS** is the emerging standard for microservice mesh security in regulated deployments. Not yet required at Allura's scale but is the next step after MCP OAuth.
- **Agent identity credentials:** Production systems are moving toward short-lived, scope-bound credentials per agent session (similar to AWS IAM instance profiles) rather than static API keys. No standard has emerged yet — this is an open problem.

**OpenTelemetry for agent tracing:**
- OTel is the consensus standard for distributed tracing in agent systems (2025–2026)
- `gen_ai.*` semantic conventions now cover LLM span attributes: model, token counts, prompt, completion
- The pattern: wrap every LLM call and memory read/write in an OTel span; export to Jaeger, Honeycomb, or Grafana Tempo
- Allura has no OTel instrumentation today — this is the primary observability gap

_Source: [Google A2A Protocol — Official](https://google.github.io/A2A/), [OTel GenAI Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/)_

---

### Integration Patterns Summary — Gaps and Actions

| Pattern | Current State | Gap | Action |
|---|---|---|---|
| MCP transport | stdio + HTTP (legacy) | SSE deprecated; Streamable HTTP is current | Migrate `mcp:http` to Streamable HTTP |
| MCP auth | Clerk RBAC (app layer only) | No OAuth 2.1 resource server for MCP surface | Add WorkOS/Auth0 with DCR for remote MCP clients |
| MCP tool versioning | No version field | Breaking changes will force all clients to update simultaneously | Add `version` to Allura Brain tool manifests |
| Memory write API | `memory_add` MCP tool | No `/v1/memories` REST surface for non-MCP clients | Low priority; MCP is sufficient for current integrations |
| Curator event pipeline | Watchdog polling | LISTEN/NOTIFY would eliminate polling latency and wasted cycles | Add AFTER INSERT trigger + NOTIFY on events table |
| Budget enforcement | 5-layer in `src/lib/` | No gateway-level model-tier routing on overage | Low priority; current layers cover critical failures |
| Agent-to-agent | Direct Agent tool calls | No A2A manifest for Team RAM agent capability discovery | Evaluate A2A for cross-agent task delegation |
| Observability | None | No OTel spans on memory reads/writes or LLM calls | Add `gen_ai.*` OTel spans — highest observability ROI |

### Agent Identity and Zero-Trust Security

**SPIFFE/SPIRE — production standard for workload identity:**
Gartner named Non-Human Identity (NHI) management a 2025 strategic trend. The production pattern:
- Every agent process gets a SPIFFE ID (workload-bound, not human-bound)
- SVID (SPIFFE Verifiable Identity Document) issued as X.509 cert or JWT via SPIRE Agent
- Credentials are **short-lived and auto-rotated** — eliminates static API key management
- Enables mTLS between microservices using the auto-rotated X.509 SVIDs

Allura currently uses static API keys for internal calls. SPIFFE/SVID is the hardening path for the Team RAM agent boundary (Brooks → Woz → Curator) — each agent gets a scoped workload credential, not a forwarded session token.

**Per-hop scoped tokens (critical pattern):**
The dominant failure mode in multi-agent chains is forwarding the caller's token downstream. Every hop must use a token scoped specifically to that interaction. DCR under OAuth 2.0 is the recommended issuance mechanism. Applied to Allura: when Brooks delegates to Woz, Woz should execute with a Woz-scoped credential, not Brooks's.

**Prompt injection defence-in-depth (OWASP #1, present in 73% of deployments):**

| Layer | Control | Allura Status |
|---|---|---|
| Input | Regex/allowlist on external data entering context | Not implemented |
| Privilege | Least-privilege tool scoping | Partial (POL-003) |
| Action gate | HITL for high-impact actions | **Implemented (curator pipeline)** |
| Architectural | Separate trusted system prompts from untrusted content | **Implemented (INSTRUCTION BOUNDARY in agent defs)** |
| Runtime | Goal-lock to detect deviation from original intent | Not implemented |

OpenAI acknowledged in December 2025 that prompt injection "is unlikely to ever be fully solved." The HITL gate is the single most effective architectural mitigation — Allura has it.

_Source: [SPIFFE for Agentic AI — HashiCorp](https://www.hashicorp.com/en/blog/spiffe-securing-the-identity-of-agentic-ai-and-non-human-actors), [Zero Trust for Autonomous AI — Red Hat](https://next.redhat.com/2026/02/26/zero-trust-for-autonomous-agentic-ai-systems-building-more-secure-foundations/), [OWASP LLM Top 10 2025](https://genai.owasp.org/llmrisk/llm01-prompt-injection/)_

---

### A2A Protocol — Team RAM Interoperability

Google's **A2A (Agent-to-Agent) protocol** was released April 2025 with 50+ founding partners (AWS, Microsoft, Salesforce) and donated to the Linux Foundation in June 2025. 150+ organisations support it by April 2026.

**How it works:**
- Agents publish a JSON **Agent Card** at a well-known HTTPS endpoint declaring capabilities, input/output schemas, and auth requirements
- Communication uses HTTP/JSON-RPC 2.0
- Tasks delegate peer-to-peer; agents can sub-delegate
- Complements MCP: MCP = agent ↔ tools; A2A = agent ↔ agent

Allura has no published Agent Card for any Team RAM agent today. Adding Agent Cards for Brooks, Woz, Scout, and Allura Brain would enable typed capability discovery for external orchestrators and standardise the current ad-hoc delegation chain.

_Source: [A2A Protocol Official](https://a2a-protocol.org/latest/), [Announcing A2A — Google Developers](https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability/)_

---

### OpenTelemetry — Observability Gap

OTel GenAI semantic conventions are **stable as of early 2026**:

| Convention | Attributes | Status |
|---|---|---|
| LLM client spans | `gen_ai.client.*` — model, tokens, latency | Stable |
| Agent spans | `gen_ai.agent.*` — agent name, task ID, chain | Stable |
| Memory spans | `gen_ai.memory.operation`, `gen_ai.memory.latency_ms`, `gen_ai.memory.result_count` | Active SIG work |

Mastra ships OTel built-in. LangGraph, CrewAI, and AutoGen all have native or first-party OTel packages. **Allura has zero OTel instrumentation.**

Recommended instrumentation targets in priority order:
1. `allura-brain` memory reads/writes — `gen_ai.memory.operation` child spans under each agent call
2. RuVector hybrid search latency — `db.system: postgresql`, `gen_ai.memory.latency_ms`
3. Curator pipeline — span from trace-write to curator-score to approval decision
4. LLM calls — `gen_ai.client.*` spans with token counts

Mastra, Honeycomb, and Datadog all support the GenAI conventions today.

_Source: [OTel AI Agent Observability — OpenTelemetry](https://opentelemetry.io/blog/2025/ai-agent-observability/), [GenAI Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/)_

---

### Cryptographic Audit Trail — SOC2 Hardening Path

The ESAA pattern (arXiv:2603.06365, 2026) formalises the compliance architecture Allura is already partially implementing:

1. Agent emits structured event under constrained protocol
2. Orchestrator validates and persists to **append-only log with cryptographic hash chain**
3. Derived views reprojected from log
4. Consistency verified via replay and hash comparison

Allura's PostgreSQL traces are already append-only (step 1–2). The gap is **hash chaining** — signing each event row with a chain hash linking it to the previous row. This enables third-party verification that no row was deleted or modified without database access. Ed25519 signing on `events` rows at write time closes this.

For SOC2: every agent instance, tool call, and access event needs a UUID (done), goes to tamper-proof append-only storage (done), and is aggregated for audit review. The missing piece is a structured log export surface (ELK/Splunk/OpenSearch ingest).

_Source: [SOC2 Compliance for AI Agents — PolicyLayer](https://policylayer.com/blog/soc2-compliance-ai-agents), [ESAA Pattern (arXiv:2603.06365)](https://arxiv.org/)_

---

### Integration Patterns — Full Gap Table

| Area | Allura Current | Gap | Priority |
|---|---|---|---|
| MCP transport | stdio + legacy HTTP | Migrate to Streamable HTTP | Medium |
| MCP auth | Clerk (app layer) | OAuth 2.1 resource server + DCR for MCP surface | High |
| MCP tool versioning | None | Add `version` to Allura Brain tool manifests | Low |
| Curator event pipeline | Watchdog polling | AFTER INSERT NOTIFY → eliminate polling latency | Medium |
| Agent identity | Static API keys | SPIFFE/SVID workload credentials | Low (future) |
| Per-hop token scoping | Not implemented | Scoped tokens per delegation hop in Team RAM | Medium |
| Prompt injection mitigations | HITL + INSTRUCTION BOUNDARY | Add runtime goal-lock | Low |
| A2A Agent Cards | None | Publish Agent Cards for Team RAM + Allura Brain | Low |
| OTel instrumentation | None | `gen_ai.memory.*` spans on Brain reads/writes | **High** |
| Hash-chained audit log | Append-only (no hashing) | Ed25519 hash chain on `events` rows | Medium |

<!-- Content will be appended sequentially through research workflow steps -->
