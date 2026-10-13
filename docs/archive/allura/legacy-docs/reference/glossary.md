# Glossary

> [!NOTE]
> **AI-Assisted Documentation** — this file is maintained with AI assistance.
> Where it conflicts with the source code, schemas, or tests, defer to those.


> Terms and concepts used across Allura Memory.

## A

**Agent**
An AI runtime that interacts with Allura through MCP tools. Examples: Claude Code, Codex, OpenCode, Cursor.

**Append-Only**
The write pattern for PostgreSQL events — new rows are inserted, existing rows are never updated or deleted. This creates an immutable audit trail.

**Approval Boundary**
An action that requires explicit human approval before execution. Defined in AD-33. Examples: runtime changes, MCP config mutation, semantic promotion.

## C

**Canonical Memory**
Knowledge that has passed through the curator gate and been promoted to Neo4j. The "source of truth" for long-term retrieval.

**Capture**
Stage 1 of the memory pipeline — an agent writes a memory via `memory_add`, which is stored in PostgreSQL.

**Confidence Score**
A 0.0–1.0 rating assigned to each memory based on semantic relevance, structural quality, and source trust tier.

**Curator**
A human reviewer who approves or rejects promotion proposals. The gate between episodic and semantic memory.

**Curator Queue**
Memories that have scored above threshold and are awaiting human review.

## D

**Deprecated Node**
A Neo4j node that has been superseded by a newer version. Marked with the `:deprecated` label but never deleted.

**Dual-Layer Architecture**
Allura's two-store design: PostgreSQL for episodic traces and Neo4j for semantic knowledge.

## E

**Embedding**
A vector representation of memory content used for semantic search. Generated via Ollama using Qwen3 Matryoshka embeddings (1024d).

**Episodic Memory**
Raw event capture in PostgreSQL. Immutable, append-only, high-volume. The entry point for all memory writes.

**Essential Complexity**
The inherent difficulty of the problem being solved (per Brooks). Allura's essential complexity is trust and governance, not storage.

## G

**Governance**
The system of invariants, approval boundaries, and enforcement mechanisms that ensure Allura operates within defined constraints.

**Governance Plugin**
`allura-governance` — the plugin that enforces the 6 non-negotiable invariants on every tool call.

**group_id**
The tenant isolation boundary. Every database operation requires a `group_id` matching `^allura-[a-z0-9-]+$`. Enforced by PostgreSQL CHECK constraint.

## H

**HITL**
Human-in-the-loop. The principle that significant decisions (especially memory promotion) require human judgment, not autonomous agent action.

**Hybrid Search**
Allura's two-pass retrieval: vector ANN (pgvector HNSW) + text search (ts_rank) fused with RRF ranking.

## I

**Invariant**
A non-negotiable rule enforced at the schema or plugin level. Allura has 6 core invariants (see `allura-governance` plugin).

## M

**MCP**
Model Context Protocol — the standard interface for agent-tool communication. Allura exposes memory operations as MCP tools.

**Memory**
A unit of information stored by an AI agent about a user, session, or context. Flows through episodic → score → curate → semantic pipeline.

**Memory Command Center**
The operator dashboard for managing memories, curator decisions, audit evidence, and graph exploration. Governed by RuVix rules (AD-31).

## N

**Neo4j**
The graph database used for semantic memory. Stores curated knowledge with `SUPERSEDES` versioning relationships.

## P

**PostgreSQL**
The relational database used for episodic memory. Append-only events table with pgvector extension for embeddings.

**Promotion**
Moving a memory from the episodic layer (PostgreSQL) to the semantic layer (Neo4j) after curator approval.

**Promotion Mode**
`soc2` (review-gated) or `auto` (automatic). Governs whether high-scoring memories enter the curator queue or promote immediately.

## R

**Receipt**
A record written to Allura Brain after substantive work, documenting what was done and why.

**Retrieval Gateway**
The controlled read path (`POST /api/memory/retrieval`) that enforces scoping, audit logging, and policy at the service boundary.

**RRF**
Reciprocal Rank Fusion — the algorithm that combines vector and text search scores: `score = 1/(60+rank_v) + 1/(60+rank_t)`.

**RuVix**
Allura's control plane governance layer — 12 rules that enforce HITL approval, append-only history, tenant isolation, fail-closed tool use, and evidence-backed completion.

## S

**Semantic Memory**
Curated knowledge in Neo4j. Versioned, relationship-rich, and promotion-gated. The long-term memory store.

**Skill**
A reusable pattern documented in a `SKILL.md` file. Skills encode routing and guardrails for common workflows.

**Soft-Delete**
Marking a memory as deleted without removing it. Recoverable within 30 days via `memory_restore`.

**SUPERSEDES**
A Neo4j relationship linking a new memory version to the old version. Old versions are marked `:deprecated`, never deleted.

## T

**Tenant Isolation**
The separation of data between different `group_id` values. Enforced by schema-level CHECK constraints, not application logic.

**Trace**
An append-only record in PostgreSQL documenting an agent action, tool call, or system event.

## U

**User ID**
The identifier for a user within a tenant. Scoped by `group_id` — the same `user_id` in different `group_id`s refers to different people.

## V

**Vector Search**
Semantic retrieval using pgvector HNSW indexes on 1024d embeddings. One pass of Allura's hybrid search.

**Versioning**
Allura's immutable update pattern: create new node → link SUPERSEDES → mark old deprecated. No in-place edits.

---

*For the canonical data model, see [`docs/allura/DATA-DICTIONARY.md`](../allura/DATA-DICTIONARY.md). For the architecture, see [`docs/allura/BLUEPRINT.md`](../allura/BLUEPRINT.md).*
