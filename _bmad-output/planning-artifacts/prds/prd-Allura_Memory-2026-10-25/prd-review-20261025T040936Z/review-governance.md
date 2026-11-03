# Brooks governance review — Allura Memory PRD

## Disposition

**REVISE BEFORE OWNER ACCEPTANCE.** The PRD is a useful, governance-aware companion to the six canonical specifications, but it is not yet approval-ready because it flattens materially different decision/readiness states, uses a noncanonical claim-state alias with an overbroad `source-present` statement, and compresses accepted-but-partial AD-35 semantics. This review is **not approval**, does not change operational status, and authorizes no implementation, status transition, Notion/Brain write, deployment, database action, commit, or canonical edit.

**Role activation:** the requested `allura_team(team="ram", role="brooks", task="bounded PRD governance review")` mechanism was available and loaded successfully. Brooks perspective is therefore active; that is not evidence that any other specialist ran or approved the PRD.

**Review basis:** branch `dev/allura-beta`, HEAD `fcf4a33f025f69a5bc3fd120e974dd079dc65c52`, plus the working-tree files frozen by `source-sha256.txt`. The PRD itself is an untracked authoring draft and several canonical/contract files are modified in the working tree; the commit SHA alone does not identify their reviewed bytes. Bounded Brain recall had already failed and the memory-write hold remains in force (`scope.md:3-13`). No local plan, Notion page, Brain result, or BMAD output was treated as live Allura work status.

## Six-document coverage

| Canonical specification | Relevant authority extracted | PRD coverage | Brooks result |
|---|---|---|---|
| `docs/allura/BLUEPRINT.md` | Six-document authority and five-step claim ladder (`:19-32`, `:851-876`); five-tool semantics (`:308-312`, `:882`); AD-35 run requirements (`:206-213`, `:385-408`); proposed BP-F59–70 (`:904-929`) | Product boundary, five-tool surface, BP-F59–70, deferred AI Office and authority split are present (`prd.md:20-26,62-100,115-139`) | **Partial.** Core intent is preserved, but `source-present/implemented` is not the canonical ladder and FR-A1 misstates all five contracts as evidence appenders. AD-35 is compressed too broadly into “partial/deferred” and “Later.” |
| `docs/allura/SOLUTION-ARCHITECTURE.md` | Brain is memory-only; orchestration/UI/projection are outside the data plane (`:50-76`); DOC-06/07 architecture gaps (`:116-120`); AD-35 RunRecord is outside Brain with PostgreSQL operational state (`:269-315`, `:339-353`); AD-65–68 topology remains proposed (`:516-565`) | MCP/API-first, PostgreSQL, controlled retrieval, optional UI, authority and projection separation are reflected (`prd.md:26,54,74-100`) | **Mostly aligned.** It omits the accepted AD-35 neutral-state/policy/runtime split and makes the partial run layer look wholly future. |
| `docs/allura/DESIGN-ALLURA.md` | Exact journey states and failures (`:672-702`); DOC-06/07 are approved intended behavior with implementation gaps (`:692-700`, `:1115-1121`); AD-65–68 design remains proposed (`:1036-1160`) | Stale-review, immutable receipt, current retrieval, unknown/degraded outcomes and remote read-back are well represented (`prd.md:40-44,68-86`) | **Substantively aligned.** However, proposed design choices are rendered as implementation “blocked,” contrary to canonical readiness vocabulary. |
| `docs/allura/REQUIREMENTS-MATRIX.md` | Row-level claim states (`:19-35`); all enterprise rows unreleased (`:43-49`); DEV-AC01–12 (`:664-681`); `Ready`, `Needs a decision`, and `Blocked` are distinct and authorize preparation only (`:683-709`) | Acceptance families are cited globally (`prd.md:129-131`) and a proposed preparation order is stated (`:121-123`) | **Insufficiently precise.** No row-level current state is carried, `Needs a decision` is relabeled as blocked for AD-65/66/67, and “Next / existing backlog” can be mistaken for live status despite the draft's status disclaimer. |
| `docs/allura/RISKS-AND-DECISIONS.md` | DOC-06/07 approved specification; DOC-09 needs a decision (`:27-31`); AD-35 Accepted (`:78`); AD-65/66/67/68 Proposed (`:568-607`), with bounded AD-68 tooling selection but broader decisions still proposed (`:600-605`); ENT-01–05 remain open (`:538-550`) | The PRD preserves DOC-06/07 behavior, DOC-09 unresolved state, and lists AD-65–68 plus DOC/ENT IDs (`prd.md:41,44,64-92,123,135-136`) | **Material status loss.** `Owner decisions` flattens Proposed, Needs-a-decision, Blocked-for-affected-stories, Needs-evidence and Open states. AD-68's selected tooling subset is not distinguished from the still-proposed remainder. |
| `docs/allura/DATA-DICTIONARY.md` | Physical journey entities and lifecycle (`:17-35`); proposal/replay/outbox fields and DOC-06/07 gaps (`:279-395`); AD-35 RunRecord/policy/runtime separation and partial implementation (`:693-744`); proposed DTOs are not implemented schemas (`:1651-1722`) | `graph_memories`, `graph_supersedes`, receipts, delivery observations and authority are accurately summarized (`prd.md:48-56,70-83`) | **Partial.** The lifecycle vocabulary is sound, but the PRD does not preserve that `CaptureReceiptV1`, `VectorScopeV1`, `SemanticCorrectionV1`, `RemoteDeliveryObservationV1`, and `OperationObservationV1` are proposed logical contracts requiring AD/schema review. |

## Current canonical status ledger

| Record | Canonical status and consequence | PRD treatment | Governance conclusion |
|---|---|---|---|
| DOC-06 | **Approved specification.** New approval binds the exact human-reviewed proposal version; stale review rejects without writes; successful replay returns the original receipt. Request/schema enforcement remains an implementation gap (`RISKS-AND-DECISIONS.md:27`; `DESIGN-ALLURA.md:1115-1118`; `DATA-DICTIONARY.md:369-371`). | Behavior is correct (`prd.md:41,70`), but approved intent versus unimplemented enforcement is not stated at the requirement. | Preserve as approved behavior; do not ask the owner to decide it again. DEV-05B is Ready only for bounded preparation/execution under ordinary approvals and independent acceptance (`REQUIREMENTS-MATRIX.md:698`). |
| DOC-07 | **Approved specification.** Remote `synced` requires authorized destination read-back; local `delivered` is not sync; the decision receipt remains immutable. Remote handoff/read model remains missing (`RISKS-AND-DECISIONS.md:28`; `DESIGN-ALLURA.md:1119-1121`; `DATA-DICTIONARY.md:391-395`). | Correct behavior and unresolved implementation/authority (`prd.md:44,83`). | Preserve as approved behavior with an open implementation/evidence gap; do not label it an unresolved product decision. |
| DOC-09 | **Needs a decision:** authoritative operational board, sync direction and conflict rules (`RISKS-AND-DECISIONS.md:30`). | Correctly unresolved and separated from approved routing (`prd.md:16,92,135`). | Preserved. Allura status / Notion planning / Brain continuity does not resolve DOC-09. |
| AD-35 | **Accepted.** Neutral `RunRecord`, policy and runtime-state separation; repository process-engine foundation is partial; full methodology runtime remains deferred until a concrete unmet use case (`RISKS-AND-DECISIONS.md:78`; `SOLUTION-ARCHITECTURE.md:269-302`; `DATA-DICTIONARY.md:693-744`). | `partial/deferred` and then wholly grouped into Later (`prd.md:99,127`). | Split the accepted contract, current partial source, and deferred full runtime. Brain must not become the orchestrator; PostgreSQL owns operational run state. |
| AD-65 | **Proposed.** Capture key/digest, atomic event/receipt/replay/index-intent and compatibility/retry policy (`RISKS-AND-DECISIONS.md:568-576`). | “Implementation blocked” and grouped as owner decision (`prd.md:64,123,136`). | Use **Needs a decision** for DEV-03, not canonical `Blocked` (`REQUIREMENTS-MATRIX.md:695`). |
| AD-66 | **Proposed.** Opaque workspace authority through vector paths; scoped degradation only; deployed impact unverified (`RISKS-AND-DECISIONS.md:578-586`). | “Blocked” (`prd.md:77`). | Use **Needs a decision** plus deployed migration/role evidence for DEV-04 (`REQUIREMENTS-MATRIX.md:696`). Do not imply a demonstrated live leak. |
| AD-67 | **Proposed.** Governed correction, base-head and DOC-06 concurrency checks; preserve lineage (`RISKS-AND-DECISIONS.md:588-596`). | “Blocked” (`prd.md:72`). | Use **Needs a decision** for DEV-05A; only DOC-03/05 affected restore/duplicate stories carry their own blocks (`REQUIREMENTS-MATRIX.md:697`). |
| AD-68 | **Proposed overall.** Main CI + retained Epic 24 checks, Bun 1.3.14, Node 24.19.0, frozen install/digests, real ESLint and strict discovery were selected on 2026-10-22; hosted exact-head/lint evidence and broader delivery, telemetry, retention, budgets, upgrades and release remain open (`RISKS-AND-DECISIONS.md:598-607`). | FR-D3 states the selected requirements, but all of AD-68 is listed generically as an owner decision (`prd.md:84,123,136`). | Record the bounded tooling selection separately; retain the remainder as Proposed. Selection is not hosted acceptance or product readiness. |

## Findings

### GOV-01 — High — Canonical claim ladder is blurred and the `Now` claim is overbroad

- **PRD:** `intended → specified → source-present/implemented → verified → released` and a broad bundle labeled `Source-present/tests-unverified` (`prd.md:22,56,117-119`).
- **Canon:** exact ladder is `intended → specified → implemented → verified → released`; implementation evidence is source-specific, verification is revision-bound, and release needs deployment/acceptance (`BLUEPRINT.md:30`; `REQUIREMENTS-MATRIX.md:21-35`). DOC-06 reviewed-version enforcement is not implemented; DOC-07 remote handoff is missing; dashboard/Cloudflare observations are source-local/excluded or unreleased (`DESIGN-ALLURA.md:698-702`; `DATA-DICTIONARY.md:10,371,393-395`; `REQUIREMENTS-MATRIX.md:43-49`).
- **Why it matters:** joining `source-present` and `implemented`, then applying that label to a mixed bundle, can promote a file's existence into implementation evidence for behavior that canon explicitly says is absent.
- **Required repair:** keep the exact five canonical states. Treat “source inspected/present in the reviewed working tree” as evidence provenance, not a claim state. Replace the `Now` paragraph with capability-by-capability states, explicitly naming DOC-06, DOC-07, dashboard/auth and run-layer gaps.

### GOV-02 — High — Decision and readiness states are flattened or mislabeled

- **PRD:** AD-65/66/67 requirements say `blocked`; §7 labels AD-65–68, DOC-02/03/05/08/09 and ENT-01–05 collectively as `Owner decisions` (`prd.md:64,72,77,123,136`).
- **Canon:** AD-65–68 are **Proposed** (`RISKS-AND-DECISIONS.md:568-607`). DEV-03/04/05A are **Needs a decision**, not `Blocked`; DEV-05B is Ready for a bounded story (`REQUIREMENTS-MATRIX.md:688-703`). DOC-02/05/09 are Needs a decision; DOC-03 is Blocked only for restore/rollback stories; DOC-08 Needs evidence (`RISKS-AND-DECISIONS.md:24-31`); ENT-01–05 are open contracts (`:538-550`).
- **Why it matters:** these labels carry different authority and execution consequences. “Blocked,” “Proposed,” “Needs evidence,” and “Needs a decision” are not synonyms.
- **Required repair:** add a compact decision/readiness ledger with the exact canonical label, owner, affected FR/slice and next evidence. Do not reopen DOC-06/07.

### GOV-03 — Medium — AD-35 accepted architecture and data semantics are underrepresented

- **PRD:** the run layer is described only as `partial/deferred` and grouped into Later (`prd.md:99,127`).
- **Canon:** AD-35 is Accepted; a partial source foundation exists. `RunRecord` is neutral durable state outside the Brain data plane, with policy and runtime state separate; PostgreSQL owns operational run records/events, while full methodology runtime/product APIs remain deferred (`RISKS-AND-DECISIONS.md:78`; `SOLUTION-ARCHITECTURE.md:269-302,339-353`; `DATA-DICTIONARY.md:693-744`).
- **Required repair:** split (a) accepted contract, (b) partial implementation, and (c) deferred full runtime. State that BMAD 6.12.4 registration/installation acceptance is methodology-tooling evidence only, not completion of AD-35 or product readiness (`guidelines/ALLURA-BMAD.md:71-91`).

### GOV-04 — Medium — FR-A1 misstates the five-tool interface semantics

- **PRD:** “append evidence through the five core memory contracts” (`prd.md:62`).
- **Canon:** `memory_add` appends evidence; `memory_search`, `memory_get`, and `memory_list` read; `memory_delete` appends a deletion event and marks semantic content deprecated (`BLUEPRINT.md:308-312`). Canonical `memory_add` is available only through authenticated MCP transports, not a generic REST write (`SOLUTION-ARCHITECTURE.md:208-215`).
- **Required repair:** say “use the five core memory contracts,” then separately specify governed evidence capture through `memory_add` and soft deletion semantics through `memory_delete`.

### GOV-05 — Medium — Proposed data contracts are presented without their schema/approval boundary

- **PRD:** FR-A3/B5/C2/D1/D2 adopt behavior mapped to the development-readiness packet, but do not state that its DTO names/storage contracts remain proposals (`prd.md:64,72,77,82-83`).
- **Canon:** `CaptureReceiptV1`, `IndexIntentV1`/`VectorScopeV1`, `SemanticCorrectionV1`, `RemoteDeliveryObservationV1`, and `OperationObservationV1` are logical proposals only; no table, schema, endpoint or migration is adopted until AD-65–68 and schema review (`DATA-DICTIONARY.md:1651-1722`; `DESIGN-ALLURA.md:1036-1039`).
- **Required repair:** retain the user outcomes as proposed requirements, but add a clear “proposed contract shape; no schema/API adoption” qualifier and avoid binding implementation to unapproved names.

### GOV-06 — Medium — Snapshot provenance is not reproducible from the PRD alone

- **PRD:** frontmatter records only commit `fcf4a33…`, while also acknowledging a dirty checkout (`prd.md:9,14,56,139`).
- **Evidence:** HEAD matches that commit, but the PRD is untracked and canonical/contract files include working-tree modifications. The review bundle separately records byte hashes in `source-sha256.txt`.
- **Why it matters:** the commit cannot reproduce the actual specification bytes used for this draft.
- **Required repair:** add a bounded source-manifest reference or digest to the PRD frontmatter. Do not call the working-tree snapshot a released or merged revision.

### GOV-07 — Low — Local planning wording and runtime-role citation need tightening

- **PRD:** `Next (existing DEV backlog)` and a sequence “as grouped in epics.md” (`prd.md:121-123`) can read like current work status; Team RAM roles are sourced to `.opencode/AGENTS.md` (`:138`).
- **Contract:** local plans/stories cannot establish live status; unavailable status stays unknown (`guidelines/ALLURA-BMAD.md:44-57,91-103`; `.agents/TEAM-RAM-RUNTIME.md:24-30,142-155`). Runtime routing authority is the repository Team RAM/runtime contract.
- **Required repair:** relabel the sequence “canonical preparation proposal; not live status,” cite `REQUIREMENTS-MATRIX.md:683-709`, and cite `.agents/TEAM-RAM-RUNTIME.md` for runtime authority. The PRD's explicit unknown-status statements (`:16,135`) are preserved.

## Preserved decisions and controls

- The PRD remains a noncanonical, unapproved companion; the six GitHub specifications retain engineering authority (`prd.md:14-22`; `BLUEPRINT.md:851-876`).
- Allura owns operational status, Notion planning, and Brain continuity; none substitutes for another and this does not resolve DOC-09 (`prd.md:16,135`; `ALLURA-BMAD.md:44-57`).
- DOC-06 and DOC-07 are approved intended behavior with implementation gaps, not open product choices.
- Independent human approval is mandatory; score, legacy `auto`, tool success, agent persona, or BMAD phase completion cannot promote knowledge (`prd.md:68-70`; `ALLURA-BMAD.md:59-69`).
- PostgreSQL is the durable evidence/proposal/semantic/receipt/outbox substrate; Neo4j is retired; events and semantic history remain append-only/immutable with lineage.
- Local outbox `delivered` is not remote `synced`; projection observations never mutate the approval receipt.
- Server-resolved principal/tenant/workspace/action authority controls access; `group_id` format and request fields do not grant authority; denied scope cannot broaden fallback.
- Review permission is not approval. BMAD installation/registration evidence is distinct from product implementation, verification, release, or live work status.

## Unresolved choices that remain with owners

1. **AD-65:** capture-key syntax, digest metadata allowlist/default normalization, legacy-client compatibility, admission accounting, retry/claim policy, response scoring compatibility and replay retention.
2. **AD-66:** internal authority signatures, restricted-role/RLS proof, migration applicability, vector model/dimension/index identity, legacy-row quarantine and worker lease/retry details.
3. **AD-67:** correction request/storage fields, base/current-head uniqueness and concurrency mechanism; DOC-03 restore and DOC-05 cross-proposal duplicate behavior remain separate.
4. **AD-68 remainder:** delivery-observation read route, Notion digest normalization, retry/reconciliation, telemetry fields/retention/destination, retrieval budgets/baseline, upgrades/removals/deprecations and release evidence. The bounded CI/runtime selection is already recorded and must not be re-decided implicitly.
5. **DOC-02/03/05/08/09:** exact visual reference; restore/lineage; duplicate policy; curator-first evidence; authoritative board/sync/conflict rules.
6. **ENT-01–05:** workspace role/confidentiality behavior, restricted-role/RLS evidence, complete administration/device/audit flows, production identity/session evidence, and actual responsive/accessibility evidence.
7. **Product choices:** buyer/commercial persona, product-success and retrieval/latency/scale budgets. No values are invented here.

## Close

The PRD's governed-memory thesis, DOC-06/07 behavior, DOC-09 separation, PostgreSQL-only architecture, human approval gate and claim-truthfulness intent are sound. Approval-readiness depends on correcting the status ledger, restoring exact claim-state semantics, narrowing source-present claims, and making AD-35/proposed data-contract boundaries explicit. No canonical decision, implementation state, operational status or approval was changed by this review.
