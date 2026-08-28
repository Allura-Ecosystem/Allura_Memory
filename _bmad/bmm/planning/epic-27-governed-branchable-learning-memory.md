# Epic 27 — Governed Branchable Learning Memory

> [!NOTE]
> **AI-Assisted Documentation**
> This BMad planning artifact was drafted with AI assistance. Source code, schemas, tests, and verified
> upstream revisions override unverified capability claims.

**Status:** Planned; experiment-first and blocked by Epic 25 closure
**Owner:** Brooks
**group_id:** `allura-system`

## Goal

Give Team RAM and Team Durham isolated, copy-on-write working-memory branches for
parallel experiments, reviewable diffs, rollback, and curator-governed promotion
without creating a second memory authority.

## Product boundary

Allura remains authoritative for tenant/workspace scope, durable episodic truth,
curation, promotion, audit, and receipts. RuVector may rank authorized candidates.
AgenticOW may provide disposable branch/checkpoint/diff mechanics. AgentDB patterns
may be evaluated for retrieval feedback and consolidation. Neither may authorize,
promote, or mutate canonical Allura memory directly.

```text
Authorized Allura snapshot
  → isolated task/agent branch
  → bounded work + checkpoint/diff/rollback
  → evidence-backed evaluation
  → curator proposal
  → human-governed promotion + server receipt
```

## Explicitly out of scope

- Replacing PostgreSQL, Allura Brain, RuVector governance boundaries, or BMad.
- Adding Ruflo, Agentic Flow, RVM, or another orchestration/model-routing plane.
- Automatic memory promotion, self-approval, or reward from agent self-report.
- Cross-tenant inheritance, browser-supplied scope, or unbounded branch retention.
- Production adoption before license, provenance, security, and benchmark gates pass.

## Architecture invariants

1. Branch identity includes `group_id`, `workspace_id`, `task_id`, `agent_id`,
   base revision, and branch revision.
2. A branch inherits only from an authorized base snapshot.
3. Branch writes are isolated and disposable; failed branches never pollute canon.
4. Promotion means creating a curator proposal, never writing semantic memory directly.
5. Rewards cite governed tests, reviews, or trace IDs; self-reported success is insufficient.
6. Relational authorization runs before vector, graph, temporal, or branch expansion.
7. Every accepted promotion receives an immutable server-issued receipt.
8. Degraded, expired, rejected, quarantined, and rolled-back states remain explicit.

## Stories

| Key | Title | Owner | Depends on |
| --- | --- | --- | --- |
| 27.1 | Upstream Capability, License, and Threat Boundary | Scout + Hightower + Brooks | Epic 25 |
| 27.2 | Branch Identity and Scope Contract | Brooks + Knuth + Jobs | 27.1 |
| 27.3 | Disposable AgenticOW Branch Spike | Woz + Knuth + Bellard | 27.2 |
| 27.4 | Governed Diff, Quarantine, Rollback, and Proposal Adapter | Woz + Knuth + Pike | 27.3 |
| 27.5 | AgentDB/SONA Retrieval-Learning Evaluation | Bellard + Fowler + Knuth | 27.3 |
| 27.6 | Team RAM and Durham Branch Workflows | Brooks + Pike + Durham Munari/Rand | 27.4, 27.5 |
| 27.7 | Security, Evidence, Release-Witness, and Demo Gate | Hightower + Pike + Fowler + Brooks | 27.4, 27.5, 27.6 |

## Story acceptance summaries

### 27.1 — Upstream boundary

- Pin exact upstream repository revisions; record license, provenance, native/WASM
  surface, install hooks, network/secret requirements, maintenance signals, and rollback.
- Return `adopt`, `adapt`, `experiment`, or `reject` per capability.
- No upstream code executes during reconnaissance.

### 27.2 — Scope contract

- Define typed base/branch/revision/diff/tombstone/promotion-candidate contracts.
- Prove cross-group and cross-workspace inheritance fails closed.
- Define retention, quota, expiry, and deletion evidence.

### 27.3 — AgenticOW spike

- Use only disposable fixtures and a pinned dependency/revision.
- Fork at least two isolated branches from one authorized base.
- Prove read-through, branch-local writes, tombstones, checkpoint, rollback, and diff.
- Record dataset size, dimensions, hardware, storage, latency percentiles, and recall.

### 27.4 — Governed promotion adapter

- Convert a selected branch diff into an Allura curator proposal.
- Preserve additions, overrides, tombstones, base revision, evidence references, and actor.
- Prove no direct canonical mutation and no browser-synthesized success.
- Rejected or poisoned branches remain quarantined and rollback remains reproducible.

### 27.5 — Learning evaluation

- Compare current SONA behavior with selected AgentDB retrieval-feedback and
  consolidation patterns using identical task classes and fixtures.
- Prefer witnessed test/review/trace outcomes over executor self-report.
- No model, skill, or ranking promotion without curator approval.
- Reject AgentDB as a second durable authority even if an evaluated pattern wins.

### 27.6 — Team workflows

- Team RAM: one branch per story/agent/review lane with sole-writer ownership.
- Durham: conservative, expressive, and crop-resilient concept branches with
  reference, prompt, token, asset, accessibility, and provenance manifests.
- Munari/Rand review branch evidence; only an approved diff becomes a proposal.
- Add no broad new agent framework and no duplicate workflow-status ledger.

### 27.7 — Closure gate

- Tenant/workspace isolation, poisoning, replay, tamper, quota, expiry, and rollback tests pass.
- Produce one machine-readable release manifest containing revision, tests, benchmark,
  SBOM/license evidence, browser evidence when applicable, review verdict, and Allura receipt.
- Independent Pike/Fowler/Knuth/Hightower review approves the frozen green diff.
- BMad retrospective records adopt/adapt/reject decisions and remaining hazards.

## Evidence budget

Follow `_bmad/custom/LEAN-DELIVERY.md`: use story files, findings-only reviews,
machine-readable test/benchmark artifacts, one epic retrospective, and concise Allura
receipts. Do not create duplicate plans or paste full logs into Markdown.

## Exit gate

- All seven stories are Done under the BMad Done contract.
- Canonical memory cannot be changed through a branch without curator approval.
- Cross-tenant branch access fails closed with disposable live-database evidence.
- Branch rollback and poisoned-memory quarantine are demonstrated.
- The AgentDB/SONA decision is evidence-backed and names what was rejected.
- Release manifest, independent review, Allura receipt, and retrospective are verified.

## Upstream evaluation sources

- `https://github.com/ruvnet/RuVector`
- `https://github.com/ruvnet/agentdb`
- `https://github.com/ruvnet/agenticow`

These URLs are discovery inputs, not architectural authority. Pin and reverify exact
revisions during Story 27.1.