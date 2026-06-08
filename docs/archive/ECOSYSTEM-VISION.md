# Allura Ecosystem Vision — Package Architecture

> **Status:** Draft | **Date:** 2026-06-08 | **Author:** Brooks (AI-assisted)
> **Inspiration:** [ruvnet/RuVector](https://github.com/ruvnet/RuVector) ecosystem model
>
> **AI-Assisted Documentation**
> Portions of this document were drafted with AI assistance.

## The Thesis

RuVector proved that a core vector DB can power an entire constellation of publishable packages — routing, orchestration, scheduling, pattern detection, memory, and deployment — each independently consumable but composing into a full agent-OS. Allura should adopt this ecosystem model, but with a critical difference: **every package inherits governed memory guarantees (HITL, append-only, SUPERSEDES) that RuVector does not have.**

RuVector = fast AI infrastructure for developers.
Allura = governed AI memory for regulated industries.

Same ecosystem shape. Different market. Deeper moat.

## RuVector Ecosystem (what they built)

| Package | Role | Status |
|---------|------|--------|
| `ruvector` core | Rust vector DB, HNSW, SIMD, sub-ms latency | Shipped (3.7k stars) |
| `@ruvector/ruvllm` | Self-learning LLM orchestration (TRM + SONA + FastGRNN) | Shipped |
| `@ruvector/router` | Semantic agent routing via HNSW intent matching | Shipped |
| `@ruvector/tiny-dancer` | Circuit breaker router with fallback chains | Shipped |
| `@ruvector/rudag` | DAG task scheduler with critical path analysis | Shipped |
| `spiking-neural` | Neuromorphic pattern detection (LIF neurons, STDP) | Shipped |
| `@ruvector/agentic-synth` | Synthetic training data generation (DSPy.ts) | Shipped |
| `agentdb` | Agent long-term memory (PostgreSQL backend) | Shipped |
| `ruFlo` | Multi-agent swarm orchestration for Claude | Shipped |
| `agentic-flow` | Cloud-agnostic agent deployment | Shipped |

Their pattern: **core DB → composable packages → product platforms.**

## Allura Ecosystem (target)

### What Allura already has (advantages over RuVector)

| Capability | Allura | RuVector |
|------------|--------|----------|
| Governed dual-database (PG + Neo4j) | Yes | No (PG only, no knowledge graph) |
| HITL approval pipeline (curator) | Yes | No (agents self-promote) |
| Append-only immutable traces | Yes | No (mutable by default) |
| SUPERSEDES versioning (knowledge graph) | Yes | No |
| Multi-tenant governance (`group_id`) | Yes | No |
| Policy-gated access control | Yes | No |
| Hybrid search (vector ANN + BM25 RRF) | Yes | Vector only |
| Vertical products (Mortagate, Co-Clawed) | Yes | Generic only |
| Compliance-grade audit trail | Yes | No |
| MCP server interface | Yes | REST/gRPC only |

### What Allura needs to package (gaps to fill)

| Gap | RuVector equivalent | Allura target | Priority |
|-----|---------------------|---------------|----------|
| Publishable npm packages | `@ruvector/*` | `@allura/*` | P0 |
| Circuit breaker for agents | `@ruvector/tiny-dancer` | `@allura/circuit` | P1 |
| DAG task scheduling | `@ruvector/rudag` | `@allura/scheduler` | P1 |
| Self-learning routing | `@ruvector/ruvllm` | `@allura/router` (enhance existing) | P1 |
| Publishable MCP server package | N/A | `@allura/mcp` | P0 |
| Synthetic data for training | `@ruvector/agentic-synth` | `@allura/synth` | P2 |
| Edge/WASM deployment | `ruvector` WASM build | Future consideration | P3 |

### Target Package Map

```
@allura/brain          ← Core: PG + Neo4j + RuVector vectors + governance engine
  ├── @allura/curator   ← HITL promotion pipeline (scores, queues, approves)
  ├── @allura/router    ← Agent routing with learning + fallback (enhance existing)
  ├── @allura/circuit   ← Circuit breaker + reliability layer (NEW)
  ├── @allura/scheduler ← DAG task orchestration with critical path (NEW)
  ├── @allura/sentinel  ← Drift detection + pattern analysis (extract from existing)
  ├── @allura/governance← Policy engine + audit trail + HITL gates (extract from kernel)
  └── @allura/mcp       ← Publishable MCP server (extract + package)

Products (consume @allura/* packages):
  ├── Mortagate         ← Mortgage QC (Salesforce-native, group_id: allura-mortagate)
  ├── Co-Clawed         ← Paired-runtime governance (Claude + Codex)
  ├── Cowork            ← Desktop/file runtime for non-developers
  └── [Future verticals]← Bank audit, healthcare compliance, etc.
```

## Architecture Principles (from RuVector, adapted for Allura)

### 1. Core governs, packages execute
Every `@allura/*` package inherits the Brain's governance guarantees. A package cannot bypass HITL, cannot mutate historical nodes, cannot skip `group_id`. This is the moat — RuVector packages have no governance inheritance.

### 2. Each package is independently publishable
A team building a simple agent doesn't need `@allura/scheduler`. They install `@allura/brain` + `@allura/mcp` and they have governed memory. Packages compose but don't require each other (except brain as the foundation).

### 3. Self-learning improves over time
Adopt RuVector's pattern: routing decisions, agent performance, and pattern detection feed back into the system. The Brain gets smarter because agents trace everything and the curator promotes learnings. RuVector uses SONA/FastGRNN; Allura uses the curator pipeline + embedding similarity.

### 4. Reliability is a package, not an afterthought
RuVector's `tiny-dancer` (circuit breaker) achieved 99.9% uptime. Allura needs the same — `@allura/circuit` wraps agent execution with circuit breakers, fallback chains, and health monitoring. Critical for regulated verticals where downtime = compliance risk.

### 5. Vertical products are proof, not prototypes
RuVector has ruFlo and Agentic-Flow as product proof. Allura has Mortagate (mortgage QC), Co-Clawed (paired runtimes), and Cowork (desktop agent). Each vertical proves the ecosystem works for a specific regulated domain.

## Implementation Phases

### Phase A: Extract and Package (weeks 1-3)
Extract existing capabilities into publishable structure:
- `@allura/brain` — Core dual-database engine (already exists as `src/`)
- `@allura/curator` — Extract from `src/curator/`
- `@allura/governance` — Extract from `src/kernel/` + policy layer
- `@allura/mcp` — Extract MCP server into standalone package

### Phase B: Add Reliability Layer (weeks 4-5)
Build what RuVector has that we don't:
- `@allura/circuit` — Circuit breaker for agent execution (inspired by `tiny-dancer`)
- `@allura/router` — Enhance existing routing with learning + HNSW intent matching

### Phase C: Add Orchestration Layer (weeks 6-7)
- `@allura/scheduler` — DAG task scheduling with critical path (inspired by `rudag`)
- `@allura/sentinel` — Extract drift detection + add neuromorphic pattern detection

### Phase D: Publish and Prove (weeks 8-10)
- npm publish all `@allura/*` packages
- Mortagate as first vertical consuming the packages
- Documentation, examples, migration guides

## Key Differences from RuVector

| Dimension | RuVector | Allura |
|-----------|----------|--------|
| Core | Vector DB (Rust, speed-first) | Dual-database (PG+Neo4j, governance-first) |
| Learning | SONA/FastGRNN (model weights) | Curator pipeline (human-approved knowledge) |
| Audit | None | Immutable, append-only, evidence-linked |
| Versioning | None | SUPERSEDES chains in Neo4j |
| Multi-tenant | None | `group_id` isolation on every operation |
| Target | Developer tools | Regulated industries |
| Compliance | None | SOC2-grade, Fannie Mae QC-compatible |
| MCP | REST/gRPC | MCP-native (Claude ecosystem) |

## Success Metrics

| Metric | Target |
|--------|--------|
| Packages published | 8 (`@allura/*`) |
| Verticals consuming packages | 3 (Mortagate, Co-Clawed, Cowork) |
| Agent routing latency | <50ms (RuVector achieves <10ms) |
| Circuit breaker uptime | 99.9% |
| Governance overhead | <5% per operation |
| npm weekly downloads | 500+ within 6 months |

## References

- [ruvnet/RuVector](https://github.com/ruvnet/RuVector) — Core vector DB
- [ruvnet/agentic-flow](https://github.com/ruvnet/agentic-flow) — Agent deployment platform
- [RuVector Ecosystem Integration Issue #84](https://github.com/ruvnet/agentic-flow/issues/84) — 6-package integration plan
- [ruvnet/ruflo](https://github.com/ruvnet/ruflo) — Multi-agent swarm orchestration
- Allura Brain architecture — `docs/allura/BLUEPRINT.md`
- Allura project instructions — `CLAUDE.md`
