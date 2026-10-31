---
name: Allura Memory Fresh-build Architecture Spine
status: sequential-rebuild-contracts-gated
updated: 2026-10-26
---

# Architecture Spine — Allura Memory

## Controlling architecture scope amendment — 2026-10-31

[Approved all-14 local adoption](sprint-change-proposal-2026-10-31-all-14-local.md) supersedes older deferred 12–14 and reset-era next-story wording below, not actual Epics 1–11 evidence or security/release requirements. [Durable runs v1](contracts/durable-runs-v1.md) is adopted detailed local design for 12.1; it is specified, not runtime implementation or story closure.

Run services remain outside Brain, over the existing Bun/TypeScript/PostgreSQL stack and authenticated core gateway. Keep immutable definition/policy/input/handler digests separate from mutable runtime projections and append-only operation/effect/approval/journal receipts. Human-admin-only v1 admission is an adopted engineering default using current permissions, not a new Action/grant or machine ceiling. The linear built-in local artifact check → exact independent human run approval → local handoff requires current participant authority at every new effect/disclosure, fenced bounded claims, same-key replay/reconciliation and fresh-process recovery. No arbitrary handler, shell, agent dispatch, network effect, semantic promotion or work-item transition. The existing core memory architecture diagram remains unchanged; the run service is a separate consumer of current authority/persistence contracts, not a second authority plane.

DOC-09 product authority/direction are settled: native Allura PostgreSQL is the sole writable operational status owner, Notion planning only. Story 13.1 retains detailed revision/conflict/transaction/receipt contracts; no two-way sync. Epic 14 is Linux-first and remote-connected to the existing Allura server, with no local runtime supervisor assumed. Framework/package, secure endpoint identity/authentication, updates, secure storage, deep links, offline denial/read-only and reconnect contracts remain 14.1 work. No live credential/server/deployment change, cross-platform claim or tunnel work follows.

Existing 6.5/9.4, actual human, hosted/deployed/release/platform gates remain open without blocking independent authorized local development. Preserve protected UX/specifications and compiler evidence bytes. Source hashes and the adoption receipt are in [12.1 specification](../implementation-artifacts/spec-12-1-durable-run-contract.md); remote operational status remains unknown.

Direct-build update: committed baseline verified; locally accepted detailed contracts now live in `contracts/authority-v1.md` and `contracts/persistence-v1.md`, without restoring deleted specs. Epic 1 evidence/retrospective is in `../implementation-artifacts/epic-1-retro-2026-10-26.md`; next is 2.1. User delegated bounded local design and removed independent development review; direct self-checks/tests replace stale execution limits below. Product independent human promotion and production boundaries remain binding.

The [Epic 1–14 catalog](epics.md) replaces all legacy delivery numbering. Story 1.1's local `foundation/` package is verified; memory services, schema, auth, UI and release are not implemented by that scaffold. Epic 1 remains incomplete. Next is [1.2](stories/1.2-authority-and-service-contracts.md). Parent owns the pending clean baseline commit; no clean Git claim is made here. Legacy repair STOP stays intact; the user already approved scoped rebuild execution and sequencing.

Sources: [PRD](prds/prd-Allura_Memory-2026-10-25/prd.md), [Blueprint](../../docs/allura/BLUEPRINT.md), [Design](../../docs/allura/DESIGN-ALLURA.md), [Requirements Matrix](../../docs/allura/REQUIREMENTS-MATRIX.md), [Risks and Decisions](../../docs/allura/RISKS-AND-DECISIONS.md). Former detailed Solution Architecture/Data Dictionary were purged. Retained table/DTO names are context, not silently approved DDL. [Adapter mappings](../../guidelines/ALLURA-BMAD.md#missing-input-mapping) disclose missing inputs.

## Design paradigm

API-first governed memory data plane. Thin authenticated transports resolve principal/tenant/workspace/action authority and call bounded services. Services own PostgreSQL transactions for append-only evidence, proposal workflow, immutable semantic versions/lineage, receipts and outbox intent. Derived indexes/projections cannot authorize canonical state. UI and orchestration remain outside the engine boundary.

```mermaid
flowchart LR
  Client[Agent / API / CLI / optional UI] --> Boundary[Authenticated transport]
  Boundary --> Scope[Server-resolved principal + tenant + workspace + action]
  Scope --> Capture[Capture / Retrieval Service]
  Scope --> Review[Approval Service]
  Capture --> PG[(PostgreSQL evidence + proposals + receipts)]
  Review --> PG
  PG --> Graph[(PostgreSQL semantic graph)]
  PG --> Index[RuVector / vector / lexical derived index]
  PG --> Outbox[Projection outbox]
  Outbox --> External[Optional external projection]
  Graph --> Capture
```

Target intent, not installed topology. PostgreSQL is durable authority; RuVector retrieval/graph direction retained; Neo4j retired. Presentation/transports depend on contracts/services; services depend on repository/adapter interfaces; adapters depend on stores/providers. Neither UI nor adapter owns authorization. No app framework or provider model is selected by this correction.

## Invariants

- AD-01/B3: raw evidence append-only; rollback never deletes accepted evidence.
- AD-04/B7/B25: independent authorized human promotion in every mode; score, persona, agent and workflow cannot approve.
- DOC-06: decision applies to exact reviewed proposal version; stale new decision writes nothing; valid scoped replay returns original immutable receipt.
- Immutable semantic versions and same-scope lineage; lifecycle flags are distinct from content. Restore/duplicate policy remains DOC-03/05.
- Every read/write/graph derivative carries server-derived current tenant/workspace/action authority. Caller fields, well-formed namespaces and edge admission grant nothing.
- DOC-07: remote delivery observation is separate from decision receipt; `synced` needs destination read-back.
- Intended / specified / implemented / verified / released are distinct. Source presence is provenance only.
- Allura owns operational work status, Notion planning, Brain governed continuity. Remote state unknown; no shadow tracker.

## Proposed decisions that block affected implementation

| Contract | Owning new story | Required disposition |
|---|---|---|
| Human/service/device authority; ENT-01 confidentiality/roles | 1.2 → 2.1/2.3 | Exact current binding/action contract and owner acceptance; AD-69 Cloudflare selection is settled, not permission to change live grants |
| Missing detailed schema, restricted role/RLS, transaction/fixture design | 1.3 → 2.2/2.3 | Knuth/Pike review and actual security/schema authority; historical field names cannot substitute |
| AD-65 capture key/digest/admission/retention/retry/compatibility | 3.1 → 3.2 | Product/API/data/worker decisions before replay implementation |
| AD-67 correction/base/current-head/concurrency | 4.3 | Product conflict behavior and data/public mapping approval |
| DOC-03 restore / DOC-05 duplicate policy | 4.4 | Separate affected decisions; not inferred from correction |
| AD-66 vector scope/model/dimension/index/worker details | 5.1 (storage scope starts 1.3/2) | Exact signatures, restricted-role evidence, model/index identity; no broad fallback |
| AD-68 observation/retention/destination/budgets | 6.1; measurement 5.4 | Stage-bound truthful outcomes; budgets grounded in baseline, not invented |
| AD-68 delivery mechanics and transfer authority | 7.1 | Read route/digest/retry/reconciliation plus exact authorized destination |
| DOC-02 / ENT UI identity/accessibility | 9.1/9.4; identities in 2/8 | Exact retained screen/revision/states and real multi-user/browser evidence |
| DOC-08 curator-first provenance | 3.3/9.1 | Locate valid evidence or obtain actual decision, not AD-57 substitution |
| Missing run provenance AC / concrete unmet use case | 12.1 | Defined before deferred runtime implementation |
| DOC-09 board/sync/conflicts | 13.1 | Product decision before native board/sync; operational routing alone is insufficient |

AD-68 exact local tooling is already selected/verified in 1.1. Broader decision remains proposed. AD-70 bounded retrieval behavior and AD-71 isolated first-use preparation retain their limits in 5.3/6.4. No approval is manufactured by assigning a story.

## State and mutation rules

1. Capture: service-owned scoped transaction; after AD-65, accepted event/receipt/replay/index intent atomic. Asynchronous indexing cannot rewrite capture truth.
2. Proposal: governed workflow state only; proposal existence never active knowledge.
3. Promotion: current proposal lock, independent actor and exact reviewed version; atomic semantic row/lineage/event/outbox/receipt/replay.
4. Retrieval: current/history filters and equivalent-scope degradation; denial never broadens fallback. Authorize graph nodes, endpoints, counts, labels, caches, cursors and citations before disclosure and re-check before return.
5. Projection: local outbox state separate from authorized destination observation; ambiguous results unknown.
6. Recovery: compatible forward changes/disable paths; preserve events, receipts, semantic versions, lineage and unknown remote operations. No destructive down migration by default.

## Consistency conventions

Opaque server-resolved principal + group_id + applicable workspace_id + action; stable scoped operation key and canonical digest only where accepted; denied/conflict/failed/partial/unknown remain distinct. PostgreSQL timestamps establish accepted durable records; client time is not decision authority. Logs are redacted, stage-bound, safe-correlation and bounded cardinality: no secrets, private content or foreign identifiers. Tests bind exact bytes, required discovery, actual compiler/lint, induced failures and independent review.

## Verified local stack versus unimplemented product stack

Story 1.1: single private ESM `foundation/`, Bun 1.3.14, Node 24.19.0, TypeScript 5.9.3, ESLint 9.39.1, typescript-eslint 8.46.2, @types/bun 1.3.14, @types/node 24.10.0. Real local checks cover one file/three behavior cases/19 assertions plus separate compiler/lint. This does not select Next/React, database package/version, embedding provider or public API schema. Vendor declaration checking is limited by disclosed skipLibCheck; maintained source/test/scripts/config remain checked.

PostgreSQL and RuVector are retained architecture direction, not installed-beta evidence. Cloudflare Access human identity is accepted under AD-69; machine/device routes remain separate. Production versions/topology/grants/providers are unverified.

## Architecture-to-sequence map

Approved2026-10-28 [parallel candidate exception](sprint-change-proposal-2026-10-28-parallel-10-11.md): parent-created10/11 plain-export workers own disjoint new candidate modules; one canonical writer owns shared schema/transports/UI and verified integration.11 candidate experiments need not wait for10 closure. Actual contracts, dependencies and acceptance remain mandatory; no second durable authority, upstream adoption or production capability follows. Finish7.3/local7 retrospective and finalize10.1 before integrating dependent work; preserve exact candidate base/hash evidence.

Controlling scope addition: [LOCAL7 adoption](sprint-change-proposal-2026-10-27-local-7.md) preserves checkpointed10.1 then prioritizes7.1–7.3 before remaining10/11. Existing semantic_intents/immutable decisions supply durable source evidence; separate authorized transfer/delivery observations cannot mutate receipts or canonical knowledge. Only local disposable destination fixtures are authorized; actual external read/write/credentials/grants and release remain gated. Earlier optional7-unadopted prose is historical, not the current local scope.

Controlling amendment after admission23: [approved local10–11 continuation](sprint-change-proposal-2026-10-27-local-10-11.md) extends the earlier6.5-only exception across9.4 external release acceptance. Use locally tested9 operator/curator contracts for dependency-ready LOCAL10 then11; retain both epics' release requirements and every upstream/provenance/license/isolation/capability gate. No new authority plane, upstream adoption or deployment is implied.

Approved2026-10-27 [Correct Course](sprint-change-proposal-2026-10-27.md): defer ONLY deployment-only6.5 acceptance without closing6.5/Epic6, and continue currently approved functional-dependency-ready local implementation. Next8.1 consumes locally verified2/6 contracts; unadopted optional7 is not a prerequisite. Other local/security gates and protected UX remain intact. Hosted/deployed/human/rollback release evidence remains required, with explicit staging authorization requested after local readiness.

1 contracts/tooling → 2 authority/persistence → 3 capture/proposals → 4 human review/immutable lifecycle → 5 retrieval/graph/evaluation → 6 core operations/consumers/self-hosted witness → 7 optional projection → 8 devices → 9 graph-capable operator surface → 10 bounded plugins → 11 governed memory experiments → 12 deferred run kernel → 13 deferred work plane → 14 deferred desktop. Functional prerequisites and numbered story acceptance are in the catalog. No later epic may retroactively supply an earlier prerequisite; smaller identity/decision contracts belong in Epics 1–2 before services.

## Operational envelope and deferred scope

Approved internal-team rollout annotation, 2026-10-30 ([Correct Course](sprint-change-proposal-2026-10-30-team-mcp.md)): Gilliam/Hermes, ChatGPT Desktop and Claude Desktop enter through the approved Cloudflare-protected application boundary. Verify each transport's OAuth/service/device behavior and explicit stable principal/workspace mapping before invoking governed services. The existing legacy endpoint and fresh five-tool runtime remain distinct until compatibility/cutover acceptance. SSH from the verified deployment controller reaches the management plane only; it grants no MCP content authority. Retain separate human review and current same-origin/security protections; no browser-JWT-to-machine conversion, token sharing or email auto-linking is adopted. If a new delegated-client mechanism is necessary, specify its explicit authority contract and negative tests before implementing it. This annotation changes delivery planning, not the core transaction/storage architecture or deferred desktop scope.

This correction edits planning/adapters only and reruns the existing foundation, without application implementation. Parent alone stages/commits after both workers verify; the MCP repair worker exclusively owns tenant/project MCP/necessary private ignore changes. No shared bridge/global config, refs, worktrees or push here.

DB mutation/concurrency/RLS tests require approved disposable PostgreSQL, synthetic identities and restricted role. External projection requires destination and transfer authority. Release requires exact-SHA CI, explicit target authority and live acceptance; build success is insufficient. Legacy STOP remains active, not a blanket veto of scoped approved rebuild work.

Full run/work plane/desktop remain deferred; branch-learning remains experiment-first; provider/action/notification expansions remain proposals. Exact UI reference, schema/security contracts, numeric SLOs, commercial strategy and compliance assertions are not invented. Brain write hold retained; no remote status inferred.
