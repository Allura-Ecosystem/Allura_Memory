---
title: Allura Memory sequential fresh-build epic catalog
status: approved-sequence-local-foundation-verified-product-incomplete
updated: 2026-10-26
operationalStatus: unknown
---

# Fresh rebuild — Epic 1 onward

The user's sequencing correction supersedes every retain-original-numbering instruction. Execute Epic 1, then Epic 2, in the order below. Within an epic select the lowest unfinished ready story. Never jump over a prerequisite or decision gate: prepare the blocking decision in its owning story. Historical completion does not transfer to the rebuild. This catalog is delivery planning, not an Allura status ledger.

[PRD](prds/prd-Allura_Memory-2026-10-25/prd.md), [architecture](architecture.md), [readiness](readiness.md), [Correct Course](sprint-change-proposal-2026-10-26.md), [entrypoint](../../guidelines/ALLURA-BMAD.md).

## Sequence and dependency rule

Every epic requires closure of the preceding numbered epic before its execution, in addition to the functional dependencies below. Optional/deferred entries preserve the roadmap, not a promise to implement unaccepted scope. If a gate remains open, stop at that entry; changing scope or order requires a specific correct-course decision, not silently skipping to a larger number. Core delivery can be accepted at Epic 6 without claiming the optional roadmap complete.

| Epic | Outcome | Functional prerequisites | Planning state |
|---|---|---|---|
| 1 | Executable foundation and reviewed build contracts | None | In progress locally; only 1.1 verified |
| 2 | Authenticated authority and append-only persistence | 1 contracts and schema/security decisions | Not implemented |
| 3 | Retry-safe evidence capture and pending proposals | 2 authority, restricted storage | Not implemented; AD-65 gate |
| 4 | Independent review, immutable versions and corrections | 3 evidence/proposals; 2 authority/transactions | Not implemented; AD-67 and affected DOC gates |
| 5 | Authorized retrieval, graph provenance and evaluation | 4 semantic lifecycle; 2 scoped storage; 3 raw evidence | Not implemented; AD-66 gate |
| 6 | Core operations, consumer contracts and self-hosted acceptance | 2–5 complete core journey | Not implemented; deployment evidence gates |
| 7 | Optional confirmed external projection | 4 immutable decisions/outbox; 6 operational truth | Optional; transfer and AD-68 details gated |
| 8 | Device pairing and persistent client authentication | 2 principal/membership; 6 client contracts | Not implemented; real secure-store evidence required |
| 9 | Governed Memory Command Center and interactive graph | 4 decisions, 5 graph/search, 6 health, 7 projection observations, 8 device evidence | Optional UI; DOC-02/ENT acceptance gates |
| 10 | Bumblebee and bounded capability modules | 2 isolation; 3 evidence; 4 review; 6 operations; 9 module surface | Retained bounded integration; no enforcement authority |
| 11 | Governed branchable-memory experiments | 4 proposal/lineage; 5 retrieval; 9 curator acceptance | Experiment-first; adoption not approved |
| 12 | Durable governed run kernel | 2 persistence; 6 operational evidence; 9 inspection | Deferred until concrete unmet use case and run AC |
| 13 | PostgreSQL work plane and operator workspace | 12 runs; 9 shell; DOC-09 authority/sync choice | Deferred; no native board default |
| 14 | Governed desktop shell and release evidence | 8 device authentication; 13 workspace | Deferred; platform-specific acceptance |

## Epic 1 — Executable foundation and reviewed build contracts

Goal: a reproducible local harness plus sufficiently precise authority, storage and evidence contracts for Epic 2. A passing illustrative module is not a memory engine.

| Story | Objective | Prerequisites | Exact local state |
|---|---|---|---|
| [1.1](stories/1.1-local-executable-foundation.md) | Pinned scaffold; behavior tests, typecheck and lint | None | Locally verified; not committed/released |
| [1.2](stories/1.2-authority-and-service-contracts.md) | Five-tool and human/service/device authority boundaries; critical outcomes | 1.1 local evidence; parent baseline commit before development continuation | Next lowest unfinished; ready for contract preparation |
| [1.3](stories/1.3-persistence-and-security-contracts.md) | Reviewed restricted PostgreSQL schema/transaction and test-target contract | 1.2; concrete schema/security decisions | Not started; requirements gate |
| [1.4](stories/1.4-foundation-acceptance-and-handoff.md) | Reconcile contracts, requirements and reproducible foundation evidence | 1.1–1.3 accepted | Not started |

Acceptance: all four story contracts satisfied with independent revision-bound review; no missing essential field/authority/transaction choice passed off as implementation-ready. 1.1 alone cannot close Epic 1. FR-D3 is partially evidenced locally; NFR-7/8 apply. No application implementation is performed by this sequencing correction.

## Epic 2 — Authenticated authority and append-only persistence

Sources: FR-A2, FR-B2/B4, NFR-1/2/4, AD-69, BP-F71–74, CF-AC01–05, BE-AC01/02/05, ENT-01/02.

Stories, in order:
- 2.1 Implement server-resolved principal/tenant/workspace/action context, separate human Cloudflare Access from MCP/service/device identity; deny missing/forged/expired/wrong issuer/audience or machine-as-human identity. Explicit stable binding only; no email auto-link or role provisioning.
- 2.2 Implement reviewed PostgreSQL schema, migrations, restricted app role/RLS and service-owned transactions; append-only evidence and immutable semantic/receipt structures. Synthetic disposable target only until separately authorized deployment.
- 2.3 Integrate current membership, lock/revocation, pooled-connection isolation, ingress/auth-before-work and bounded inputs; prove zero foreign records/metadata and no production DevAuth/origin bypass.

Acceptance: reviewed schema decisions from 1.3, actual non-owner database tests, rollback/no-partial-write proof, forged/foreign/missing/revoked/locked scope denial across transports. Numeric ingress budgets and deployment bindings must be decided explicitly, not invented by this catalog. Authentication selection is settled; concrete security/schema decisions remain gates.

## Epic 3 — Retry-safe evidence capture and pending proposals

Sources: FR-A1/A3, FR-B1, BP-F1/26–32/59, DOC-J01/02, DEV-AC01, BE-AC04, AD-65.

- 3.1 Resolve AD-65 operation identity/digest/compatibility/admission/retention/retry contract with named product, interface, data and worker owners; no storage implementation before decision evidence.
- 3.2 Implement atomic event/immutable capture receipt/replay/index-intent persistence and same-key reconciliation; separate asynchronous indexing from accepted capture.
- 3.3 Generate evidence-linked pending proposals and audit their state. Score/legacy modes never promote. Preserve source, confidence and review-state distinctions; resolve DOC-08 evidence before asserting a curator-first delivery decision.

Acceptance: concurrent same-key replay, changed-payload conflict, lost-response/crash and provider-outage tests; denied capture writes nothing; high score cannot create active semantic knowledge. Required evidence is DOC-J01/02 and DEV-AC01, not historical tests.

## Epic 4 — Independent review, immutable versions and corrections

Sources: FR-B1–B5, memory_delete part of FR-A1, DOC-06, DOC-J03–05, DEV-AC03/04, AD-67, DOC-03/05.

- 4.1 Implement approve/reject/request-evidence decisions with independent authorized human, rationale/evidence, exact reviewed proposal version, no-write stale conflict and byte-equivalent scoped replay. DOC-06 is specified, not open for re-decision.
- 4.2 Prove atomic immutable semantic version, lineage, decision event/receipt and outbox intent; inject failures at every durable boundary. Reject unauthorized/self-approval.
- 4.3 Resolve AD-67 correction fields/public mapping/base-head/concurrency; implement pending correction, renewed human review and one-current-head concurrency without mutating old content/edges.
- 4.4 Implement governed soft deletion and history visibility. Resolve DOC-03 restore lineage and DOC-05 distinct-proposal duplicate policy before the affected restore/duplicate behavior; neither is silently inferred from correction.

Acceptance: preserved historical versions/receipts, no partial approval state, stale/conflicting review writes nothing, one current head, replay integrity, immutable deletion evidence and explicit affected-policy decisions. Do not close this epic while its defined restore/duplicate scope remains unresolved.

## Epic 5 — Authorized retrieval, graph provenance and evaluation

Sources: FR-C1–C3/D4, search/get/list part of FR-A1, BP-F35–40/60/67, DEV-AC02/09, BE-AC03/05, AD-66/70.

- 5.1 Resolve AD-66 signatures, model/dimension/index identity, worker policy and restricted-role evidence; implement equivalent-scope vector/lexical paths. Scope denial never triggers fallback.
- 5.2 Implement current/history lifecycle filtering, get/list/search and authorized graph traversal/provenance; authorize nodes, edge endpoints and all derivatives/cursors/counts/caches before disclosure and re-check before return.
- 5.3 Preserve AD-70 bounded fresh-evidence eligibility and score/provenance semantics without claiming broad semantic relevance. Prove raw-event eligibility alongside full graph/vector batches, approved-only exclusion, normalized limits and partial/all-store failure truth.
- 5.4 Run versioned human-reviewed current/history/no-answer/foreign fixtures; report relevance/freshness/isolation, sample sizes, ranking metrics as applicable, p50/p95, timeouts and fallback. Decide tuning budgets only from a measured baseline.

Acceptance: zero unauthorized results with real restricted-role and pool-reuse tests; current search excludes deprecated/superseded records; authorized history and graph lineage remain inspectable. Second-agent use and two-session exact-record discovery must be exercised. Native RuVector/provider readiness is separately tested, never inferred from raw-event fallback.

## Epic 6 — Core operations, consumer contracts and self-hosted acceptance

Sources: FR-D1/D3/D5/F1/F2, NFR-3/5/7/8, AD-68/71, DEV-AC06–08/11/12, BE-AC02/07–09, DOC-04.

- 6.1 Resolve remaining stage-observation/redaction/retention/destination and resource-budget choices; implement honest succeeded/failed/partial/unknown results, bounded work/cancellation and real health/freshness.
- 6.2 Inventory separately deployed consumers before compatibility decisions; implement and exercise packed SDK/CLI/MCP/API consumers, exact version/dependency guidance and first-use disclosures. Do not restore old runtime as a prerequisite.
- 6.3 Establish exact-revision authoritative CI, frozen installs, nonzero required-file/assertion discovery, independent lint/typecheck and failure-sensitive lanes. All jobs must belong to the current attempt; no stale receipt aggregation.
- 6.4 Define the missing complete self-hosted release AC from FR-F2, then prove isolated clean initialization, restricted role, real authentication/finite compatible embeddings, restart/recovery and manifest-bound backup/restore integrity. AD-71 preparation is not permission to provision or run a shared stack.
- 6.5 Independently witness the complete DOC-J01–06 core journey and honest capability claims on the exact authorized deployment. Include rollback preserving evidence/history, current-SHA CI and retrospective. Optional DOC-J07/09 close only in their own epics.

Acceptance: local versus hosted versus deployed evidence separated; explicit resource/credential/target authority; no product release by successful build alone. Whole-product/optional roadmap completion is not claimed at this core gate.

## Epic 7 — Optional confirmed external projection

Sources: FR-D2, DOC-07, DOC-J09, DEV-AC05, BE-AC06, AD-68 delivery details.

- 7.1 Decide delivery read route, digest normalization, bounded retry/claim/reconciliation and explicit source-to-destination transfer authority.
- 7.2 Implement durable eligible handoff plus separate delivery observation; immutable decision receipts never change.
- 7.3 Exercise authorized destination read-back, timeout reconciliation, digest/source/destination conflict, revocation and due-attempt discipline.

Acceptance: `synced` only after matching destination read-back; local HTTP/outbox success is not sync. Unknown remains unknown until reconciled; no duplicate remote writes from blind retry. Optional roadmap gate, not a core prerequisite.

## Epic 8 — Device pairing and persistent client authentication

Sources: AD-69 identity separation, NFR-4, ENT-03/04; retained device-pairing requirement intent.

- 8.1 Specify current enrollment/challenge/approval/completion and server-derived workspace/device authority; human approval is distinct from device credentials.
- 8.2 Implement replay-safe exchange, rotation/revocation, membership demotion/removal, lock and reconnect/grace behavior under reviewed contracts; preserve audit redaction and atomicity.
- 8.3 Exercise real clients and platform secure stores, cross-tenant negatives, concurrency and credential-leak tests. Simulator/in-memory keystores cannot satisfy platform acceptance.

Acceptance: no Clerk restoration, no browser-minted grants, no unauthenticated pairing, no plaintext secret leakage; current role/revocation checked. Security/credential/OS contracts require their exact decisions before mutation. Historical server tests are not fresh evidence.

## Epic 9 — Governed Memory Command Center and interactive graph

Sources: FR-E1–E4, BP-F14–19/41/42/47/48/68, DS operator/graph/audit contracts, DOC-02/04/08/09, ENT-01–05, PV-AC01–04. Protected design: [operator contract](../../docs/design/command-center/operator-surface-contract.md) and [Design](../../docs/allura/DESIGN-ALLURA.md).

- 9.1 Bind exact retained screen/revision/assets/states and task-based human protocol with Sabir/Durham (DOC-02); resolve role/confidentiality and affected ENT inputs. Preserve official mark, semantic tokens, Plex typography and evidence-first layout; do not redesign by scaffold default.
- 9.2 Implement authenticated overview, memories/search, curator review/evidence requests, governance, audit/export, settings/health and authorized device/embedding administration through governed APIs only. Map every route to authoritative service and honest loading/empty/denied/conflict/degraded/unknown/success states.
- 9.3 Implement the interactive knowledge graph/Memory Map with persisted same-scope relationships, selection/filtering/inspection, pan/zoom and keyboard/text alternative. Counts or a static mock do not meet graph acceptance. Bound data/layout work; validate malformed navigation and contain screen failures.
- 9.4 Independently verify real multi-user denial/revocation/stale review, browser controls, responsive screenshots, focus/accessible names/ARIA/high contrast and real-human tasks. Bind exact revision, visual parity, rollback and authorized deployed target.

Acceptance: DOC-J07/DEV-AC10 and applicable CF/ENT/PV evidence; no fabricated live charts or health. Work items remain unavailable/non-authoritative until Epic 13's DOC-09 decision. Future runs/resources/agents/telemetry views may truthfully show unavailable state; they cannot make deferred backends prerequisites for the core UI. Read-only Ask, contractor messaging and proposed intelligence/client expansions remain unaccepted product choices, not implicitly delivered UI.

## Epic 10 — Bumblebee and bounded capability modules

Sources: FR-F4, BP-F56, AD-57/60/63, REQ-BMB-006–016, REQ-MOD-001–006; accepted plugin contracts in Blueprint/Design.

- 10.1 Pin/review the upstream read-only scanner and advisory provenance/allowlist, source/population lease and ingestion-only credentials; define capability ceilings and module isolation.
- 10.2 Implement authenticated receiver/runner, verified exposure correlation, deduplicated alerts and simulated mitigation proposals. Separate trust from freshness and stale/rejected/degraded evidence.
- 10.3 Verify module discovery/lifecycle/operator presentation, cross-tenant isolation, replay, malicious payload and unauthorized-action denial; independently review dependency/license evidence and receipts.

Acceptance: no package execution, policy activation, CI/package blocking, schedule changes, credential revocation, host containment or canonical promotion by scanner/module. Enforcement requires a separate authorized workflow; installation never grants it.

## Epic 11 — Governed branchable-memory experiments

Sources: retained experiment-first roadmap, FR-F4 capability ceilings, immutable/versioned and scoped architecture. This retains an experiment, not adoption of AgenticOW/AgentDB/SONA or a new authority plane.

- 11.1 Specify authorized same-scope base snapshots, branch identity/state location, quotas/retention/expiry and threat model; pin/license/provenance review before upstream execution.
- 11.2 Prove disposable isolated branch/checkpoint/diff/tombstone/rollback/quarantine mechanics; compare selected retrieval-learning patterns on identical fixtures using witnessed evidence, not agent self-reward.
- 11.3 Convert a selected diff only into an independently reviewed curator proposal; prove no direct canonical mutation. Exercise bounded RAM/Durham workflows and poisoning/replay/tamper/isolation tests; record adopt/adapt/experiment/reject and retrospective.

Acceptance: no second durable authority, no automatic promotion, no cross-scope inheritance, no unbounded retention. Upstream adoption and production use remain explicit decisions after measured evidence. Memory experiment branches do not authorize Git branches/worktrees for this rebuild.

## Epic 12 — Durable governed run kernel (deferred)

Sources: FR-F3, AD-35/41, BP-F49–52. No current runtime is inherited.

- 12.1 Establish concrete unmet use case and missing run-provenance acceptance: neutral tenant-scoped RunRecord, immutable definition revision, policy versus runtime state, actor/evidence requirements. Do not use retrieval use cases as run acceptance.
- 12.2 Implement PostgreSQL durable runs/journals, bounded attempts, approval breakpoints and measured quality gates outside Brain; resume first incomplete eligible step without repeating committed effects.
- 12.3 Verify crash/replay/parallel failure, cancellation, checkpoints/continuation, drift/stale/doctor diagnostics, inspection/API and exact-revision evidence.

Acceptance: failure/partial/unknown never collapse to Done; no workflow completion replaces human semantic approval. Requires separately scoped run implementation and approved detailed AC; this catalog does not activate a methodology runtime.

## Epic 13 — PostgreSQL work plane and operator workspace (deferred)

Sources: FR-E3/F3, BP-F43/53/54, DOC-09 and AD-41.

- 13.1 Decide authoritative operational board, synchronization direction and conflict rules; discover actual supported Allura status capability. Allura status ownership and Notion planning routing do not decide the product's board mechanics.
- 13.2 Specify/implement governed projects/work items/handoffs/evidence links and audited state transitions in PostgreSQL, linked to runs and memory receipts without duplicating authority.
- 13.3 Integrate mission-first workspace/command center/evidence inspector; verify board synchronization conflicts, authorization, stale/unknown state and exact UX parity.

Acceptance: no shadow Markdown/YAML tracker, no two writable authorities, no fictional status transition; unresolved DOC-09 blocks native board/sync. Product implementation remains deferred pending concrete scope.

## Epic 14 — Governed desktop shell and release evidence (deferred)

Sources: BP-F55, retained desktop product intent and architecture deferred envelope.

- 14.1 Specify secure connection/runtime-supervision/update/deep-link/offline/read-only/reconnect contracts and exact retained UX/platform release targets.
- 14.2 Implement bounded shell integration over accepted workspace/device services; prove OS secure storage, crash/restart, offline denial and reconnect recovery.
- 14.3 Verify platform-specific packaging/update/rollback, accessibility/visual parity, independent security review, exact-build release witnesses and retrospective.

Acceptance: desktop packaging is not server/device acceptance; no live runtime, update, credential or release change without exact authority. Personal-AI-OS vision and broader provider/action/notification proposals are not accepted by this sequencing change.

## Requirement coverage and decision ownership

Stable business/acceptance IDs are never renumbered. FR-A1 → 2/3/4/5/6; A2 → 1/2/5; A3 → 3; B1–B5 → 3/4; C1–C3 → 5; D1 → 6 (stage truth in every earlier story); D2 → 7; D3 → 1/6; D4 → 5; D5/F1/F2 → 6; E1/E2/E4 → 9; E3 → 9 unavailable state then 13; F3 → 12/13; F4 → 10 with separately gated experiment 11. NFR-1–8 apply at every relevant boundary, never deferred until release.

AD-65 → 3.1; AD-66 storage authority prerequisites → 1.3/2, vector specifics → 5.1; AD-67 → 4.3; AD-68 tooling evidence → 1.1/6.3, stage/budget choices → 6.1/5.4, delivery → 7.1; AD-69 → 1.2/2/8; AD-70 → 5.3; AD-71 → 6.4. DOC-02 → 9.1; DOC-03/05 → 4.4; DOC-06 → 4.1; DOC-07 → 7; DOC-08 → 3.3/9.1; DOC-09 → 13.1; DOC-04 → 6.5/9.4/7.3. ENT-01/02 authority/storage begins in 1.2/1.3/2; ENT-03/04 device/identity → 2/8/9; ENT-05 → 9.4. Buyer/packaging, numerical product SLOs and compliance claims remain unadopted.

Unaccepted provider-neutral Ask/chat/BYOK/BYOA/action/notification/browser-push and split proposals are retained only in private historical recovery; no active epic or story is minted for them. Their decisions are not confused with the already accepted interactive graph direction.

## Execution handoff

Next: 1.2 contract preparation, not a legacy story. Parent reconciles the two workers and commits the clean baseline before development continuation. This worker does not stage, commit, change refs/worktrees, push or implement application code. Legacy repair STOP stays intact. Private reset evidence contains recovery, historical map, protected hashes, tests, exact diff and independent review. Allura operational state and production remain unknown; no clean-Git claim until the parent verifies its commit.
