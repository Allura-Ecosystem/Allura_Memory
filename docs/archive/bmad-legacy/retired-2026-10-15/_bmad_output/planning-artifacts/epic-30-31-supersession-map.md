> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model.
> Content has been reviewed against architectural principles and should be kept in sync with source-of-truth docs.
> When in doubt, defer to code, schemas, and team consensus.

# Epic 30/31 Supersession Map — AI-Assisted Draft

**Status:** council-recommended AI-assisted draft; non-authoritative until human acceptance and canonical reconciliation. This artifact does not supersede a story, memory, approval, board item, sprint status, architectural decision, or release gate. Every supersession below is proposed only. The old artifacts and their evidence remain in place until authorized humans complete the approval checklist.

## Planning correction — 2026-10-15

The user requested updated plans and reversible changes. Follow the [dashboard concept revision](./epic-30-governed-digital-brain-workspace.md#dashboard-concept-revision--2026-10-15) and [agent clarification](./epic-31-governed-intelligence-and-connected-clients.md#user-clarification--2026-10-15). Allura is the product; Faith Meats is an example workspace; Mortgage is a separately scoped optional plugin. Neither a sales-first home nor Graph is the universal default. Hermes is only Sabir's personal BYOA test case, not Allura's default. The broad menu is a catalog, not a delivered-feature or scheduled-domain-module claim.

These corrections amend draft intent only. Preserve existing story statuses, exact-hash approvals, source evidence and previous Brain records. No memory supersession, security-policy change, release, commit, push, or runtime rollback follows automatically.

### Canonical reconciliation delta

| Existing owner | Required follow-through before implementation |
| --- | --- |
| [Blueprint](../../docs/allura/BLUEPRINT.md) | Reconcile E30-D01–E30-D07 and E31-D01–E31-D02 to stable B/F IDs through its upstream authority workflow; distinguish core scope, catalog and separately scheduled domain plugins. |
| [Architecture](../../docs/allura/SOLUTION-ARCHITECTURE.md) | Review shell/plugin/connector/view/workflow/agent separation and rollback topology; no new runtime/library/protocol selected here. |
| [Design](../../docs/allura/DESIGN-ALLURA.md) | Own the bright rounded Allura menu, presets, widget controls, context-first Graph, plugin lifecycle, agent-neutral Chat, denial and failure states. |
| [Requirements](../../docs/allura/REQUIREMENTS-MATRIX.md) | Map each draft ID to canonical requirement/use-case IDs, owner, bounded story and evidence; do not mark proposed requirements satisfied. |
| [Risks and decisions](../../docs/allura/RISKS-AND-DECISIONS.md) | Review a proposed decision for catalog versus runtime plugins; track overload, startup cost, provider lock-in, credential leakage, schema rollback and external effects. No existing AD is silently superseded. |
| [Data dictionary](../../docs/allura/DATA-DICTIONARY.md) | Confirm names/types/schemas for any later preference, plugin configuration, connection or workflow change before code. This revision adds no field, enum, API or schema. |

This delta is an impact assessment, not canonical reconciliation completed. Follow [AI Guidelines](../../guidelines/AI-GUIDELINES.md): keep the six-file set, disclosure, explicit source links and independent review. Do not create another canonical plan document. Blueprint/upstream policy authority and human approval remain unchanged.

## Purpose and handling rules

The existing Epic 30 combines governed data foundations, the modular workspace, Graph RAG, AI answering, device integration, actions, notifications, validation, and release evidence in one sequence. The council-recommended AI-assisted draft keeps the governed modular workspace, Graph RAG, evidence, and Epic 29 device integration in **Epic 30** and moves the provider-neutral AI framework, Ask, chat, Hermes, actions, and notifications into **Epic 31**. This split takes effect only after human acceptance and canonical reconciliation.

This map is a transition aid, not a status change.

- Preserve old story files as historical evidence; do not delete or rewrite them.
- Preserve exact hashes, test counts, receipts, review findings, and known limitations. Evidence may be referenced by a new story only after relevance and reproducibility are reviewed.
- Do not reinterpret an old `done` or `backlog` label. New stories begin as draft/backlog only after approval and sanctioned registration.
- Do not mark a new story complete because an old story contains partial or completed evidence. Revalidate against the new contract.
- Do not change `_bmad_output/implementation-artifacts/sprint-status.yaml` by hand. Use the sanctioned workflow only after human approval.
- Do not treat Brain records as superseded, promoted, deleted, or authoritative through this document. Candidate IDs below require separate review.
- Keep Epic 29 device-pairing authority and its existing evidence separate. Proposed Story 30.21 may integrate its approved interfaces but must not absorb, duplicate, or rewrite Epic 29.

## Council-aligned target story register

These identifiers and outcomes match the council-recommended AI-assisted draft plans. They remain non-authoritative until the rewritten plans and canonical contract receive the required human approvals.

### Epic 30 — Governed Modular Workspace

Aligned to the [rewritten Epic 30 draft](./epic-30-governed-digital-brain-workspace.md#proposed-requirement-to-story-map).

| ID | Exact proposed title |
|---|---|
| 30.14 | Contract reset and minimal interfaces |
| 30.15 | Workspace shell and presentation-only client packs |
| 30.16 | Capability authority and role reconciliation |
| 30.17 | First-party plugin registry |
| 30.18 | GraphSnapshot, EvidencePort, relationship schema, RLS, and audit |
| 30.19 | Polished Graph RAG plugin |
| 30.20 | Sources and evidence UX |
| 30.21 | Epic 29 integration and real-client proof |
| 30.22 | Final visual, security, performance, and five-human gate |

### Epic 31 — Governed Intelligence and Connected Clients

Aligned to the [rewritten Epic 31 draft](./epic-31-governed-intelligence-and-connected-clients.md#story-map).

| ID | Exact proposed title |
|---|---|
| 31.1 | Provider-neutral `ModelPort`, direct-provider baseline, and narrow framework spike |
| 31.2 | Read-only Ask service and API |
| 31.3 | Chat plugin and accessible UI |
| 31.4 | Connections dashboard: BYOK, provider choice, and BYOA |
| 31.5 | Governed actions independent of provider or agent |
| 31.6 | In-app notification foundation |
| 31.7 | Separately gated browser push |
| 31.8 | Intelligence release, security, accessibility, performance, and human-validation gate |

## Story-by-story disposition

| Old artifact | Existing status | Preserve security/evidence? | Proposed absorber | Product outcome retained | Superseded or corrected | Status and memory handling |
|---|---:|---|---|---|---|---|
| [30.1 — Epic Authority and Readiness](../implementation-artifacts/30-1-epic-authority-and-readiness.md) | backlog | **Yes.** Preserve readiness distinctions, board reconciliation receipts, canonical-checkout history, and the rule that drafting is not approval. | **30.14** | One bounded contract, honest readiness, explicit dependencies, and evidence-backed gates. | The single 13-story Epic 30 map is proposed for replacement by new Stories 30.14–30.22 and Epic 31 Stories 31.1–31.8 after human acceptance and canonical reconciliation. Epic 29 remains separate. | Keep old story backlog and historical. Register new 30.14 as backlog only after approval. No memory record is changed by this map. |
| [30.2 — Approved Workspace Design and User-Test Plan](../implementation-artifacts/30-2-approved-workspace-design-and-user-test-plan.md) | backlog | **Yes.** Preserve hashes, browser/accessibility evidence, unresolved human gates, and the five-person protocol. | Contract to **30.14**; shell/client-pack implementation to **30.15**; validation to **30.22** | Exact warm Allura design, responsive/accessibility contract, truth states, hash-bound visual references, and human test plan. | The old tree-and-tabs-only scope and any historical design baseline are proposed for supersession by the modular, branded, graph-capable contract. Existing evidence remains historical and must be re-scoped. | Keep backlog. No old design evidence automatically passes 30.14, 30.15, or 30.22. Memory references remain unchanged pending governed review. |
| [30.3 — Authorization and Threat Contract](../implementation-artifacts/30-3-authorization-and-threat-contract.md) | backlog | **Yes, mandatory.** Preserve decisions, threat rows, founder non-override rule, open shared-token/project-grain risks, receipts, and review limitations. | Capability authority to **30.16**; AI-provider boundary to **31.1**; action authority to **31.5** | Deny-by-default authority across UI/API/MCP/search/graph/AI/workers; separate ownership, role, membership, invitation, delegation, and revocation. | Reframe the contract around minimal interfaces, versioned plugin capabilities, and intersected authority envelopes. No client pack, plugin, framework, Hermes transport, action, device, or notification widens authority. | Keep backlog until each exact revised contract receives required human security/data review. Candidate planning memories below require review. |
| [30.4 — Knowledge Schema, RLS, and Audit Foundation](../implementation-artifacts/30-4-knowledge-schema-rls-and-audit-foundation.md) | **conflicted: story header `done`; sprint-status `backlog`** | **Yes, technical evidence only.** Preserve disposable PostgreSQL proof, forced-RLS/NOBYPASSRLS evidence, immutable receipts, rollback, and cleanup records without treating them as a completion receipt. | **30.18**, with capability/audit semantics consumed by **30.16** | Database-enforced tenant/workspace/document isolation, immutable audit, ordered migration, and rollback foundation. | Nothing is undone, but completion is not carried forward while authoritative status sources conflict. The revised delta adds only approved GraphSnapshot/relationship entities and capability references, then revalidates affected surfaces. | Preserve both conflicting records and open a human reconciliation item. Do not mark the old or new story complete until sanctioned status reconciliation and delta review succeed. |
| [30.5 — Workspace Scope and Legacy Remediation](../implementation-artifacts/30-5-workspace-scope-and-legacy-remediation.md) | backlog | **Yes.** Preserve forged-scope, revocation, quarantine, pool-reuse, and session-provider findings, including unresolved risks. | Authority to **30.16**; scoped graph/data contract to **30.18**; device-session integration to **30.21** | Server-derived scope, explicit membership, legacy quarantine, and fail-closed revocation. | Extend scope to plugins, presentation-only client packs, graph snapshots, device sessions, AI runs, actions, and notifications. Configuration never grants access. | Keep backlog. Reconcile partial implementation by exact commit and current tests; do not promote memory or board status. |
| [30.6 — Safe Read Services](../implementation-artifacts/30-6-safe-read-services.md) | backlog | **Yes.** Preserve authorized-snapshot, reauthorization, non-disclosure, derivative, cursor, cache, and receipt evidence. | GraphSnapshot/EvidencePort boundary to **30.18**; source/evidence service to **30.20**; AI consumption later through **31.1–31.2** | One authorized data plane for memories, relationships, search, citations, evidence paths, graph snapshots, and bounded AI context. | Replace page-specific readers with `GraphSnapshot` and `EvidencePort` contracts consumed by plugins. No second authorization path is permitted. | Keep backlog. Partial code remains candidate evidence until the new contracts and live proof are reviewed. No memory mutation. |
| [30.7 — My Work Reading Shell](../implementation-artifacts/30-7-my-work-reading-shell.md) | backlog | **Yes.** Preserve truth-state, tabs, keyboard, mobile, comparison, and disclosure tests with their documented limits. | **30.15**, with graph surface mounted through **30.17** and implemented by **30.19–30.20** | Calm modular front door, authorized navigation, reading surfaces, responsive behavior, presentation-only client packs, and truthful degraded states. | The fixed My Work page is proposed to become a modular shell. Graph and source/evidence plugins may add approved surfaces without bypassing shell truth states. | Keep old story backlog/historical. New stories remain backlog and must pass the new visual/brand contract; old functional tests can be reused only after review. |
| [30.8 — Search, Links, and Backlinks](../implementation-artifacts/30-8-search-links-and-backlinks.md) | backlog | **Yes.** Preserve endpoint authorization, canonical-ID, revocation, non-disclosure, timing-risk, citation, and relationship evidence. | Graph experience to **30.19**; search, sources, evidence, provenance, and inspector to **30.20** | Authorized search, relationships, backlinks, focused lineage, evidence paths, and revocation-safe derivatives. | The sentence **“no graph canvas added” is explicitly proposed for supersession** by Story 30.19 after human acceptance. This draft does not enact that supersession. Edges still require both endpoints and relationship authority; example data remains labeled and isolated. | Keep backlog. Do not claim old security evidence proves the new canvas, visual fidelity, dense performance, or live relationship schema. No memory change. |
| [30.9 — Read-Only Ask Allura](../implementation-artifacts/30-9-read-only-ask-allura.md) | backlog | **Yes.** Preserve provider-neutral context, citation, retention/training, prompt-injection, post-provider reauthorization, and fail-closed evidence. | ModelPort/direct baseline/spike to **31.1**; read-only API to **31.2**; chat UI to **31.3**; optional Hermes transport to **31.4** | Cited answers constrained to authorized knowledge with freshness, uncertainty, and degraded states. | Separate the provider-neutral `ModelPort`, direct-provider baseline, narrow qualifying-framework spike, read-only Ask service/API, chat plugin, and optional Hermes transport. No framework is selected by assumption; Hermes has no privileged authority. | Keep backlog. Provider activation, framework selection, model policy, and external transmission remain unapproved until exact contract review. Memory records are not model context by default. |
| [30.10 — Restricted Contractor Messaging](../implementation-artifacts/30-10-restricted-contractor-messaging.md) | backlog | **Yes.** Preserve dual approval, exact-scope RLS, invitation provenance, content-free receipt, revocation, and provider-neutral store evidence. | Capability envelope to **30.16**; explicit mutations to **31.5**; in-app delivery to **31.6**; browser push to **31.7** | Controlled contacts and channels, explicit approved actions, revocation, audited sending, and bounded delivery. | Messaging becomes governed actions plus separately gated notifications rather than an implicit all-purpose collaboration surface. No silent send, background agent, bot, attachment, history, or push capability is inferred. | Keep backlog. Durable writers, provider delivery, notification consent, and UI remain separate unapproved gates. No external message is authorized by this draft. |
| [30.11 — Integrated Review, CI, and Controlled Red](../implementation-artifacts/30-11-integrated-review-ci-and-controlled-red.md) | backlog | **Yes, mandatory.** Preserve exact-SHA runs, controlled-red witnesses, cleanup proof, branch-state evidence, and open human/branch-protection gates. | **30.22** for Epic 30; **31.8** for Epic 31 | Independent review, controlled red, exact-SHA CI, merge blocking, and real evidence rather than assertions. | Split one oversized gate into product-specific final gates. Passing 30.22 cannot approve Epic 31; passing 31.8 cannot repair a missing Epic 30 prerequisite. | Keep backlog. Reuse only receipts whose exact SHA and scope remain relevant. No status advancement from local test counts alone. |
| [30.12 — Five-User Validation and Remediation](../implementation-artifacts/30-12-five-user-validation-and-remediation.md) | backlog | **Yes.** Preserve the five-distinct-human rule, four-of-five success threshold, privacy safeguards, remediation loop, and zero-disclosure stop condition. | **30.22** for workspace/graph/device tasks; **31.8** for Ask/chat/Hermes/action/notification tasks | Real uncoached human validation and evidence-backed remediation. | Split the approved protocol by epic while retaining participant distinctness and zero-disclosure gates. Simulations remain excluded. | Keep backlog. Human results must be newly executed against each approved epic hash; no synthetic persona or AI review counts as a participant. |
| [30.13 — Release Evidence, Receipts, and Retrospective](../implementation-artifacts/30-13-release-evidence-receipts-and-retrospective.md) | backlog | **Yes, mandatory.** Preserve the completion manifest, exact IDs/hashes, reconciliation rules, rollback evidence, known pending gates, and prohibition on inferred completion. | **30.22** and **31.8** | Reconciled evidence packets, authorized publication, release receipts, board alignment, rollback, and retrospectives. | Replace the single-epic close packet with independent Epic 30 and Epic 31 final-gate packets. Epic 30 completion does not imply AI/action/notification readiness. | Keep backlog. Do not run a completion retrospective, publish, merge, or change board/sprint status from this draft. Memory outcome traces require separate governed writes after approval. |

## Extended planning-artifact disposition

Every disposition in this table is proposed. Preservation means retain the artifact and its bounded evidence; it does not carry completion, approval, or current readiness into a new story.

| Existing artifact | Proposed disposition | Evidence limits and required action |
|---|---|---|
| [Authorization approval packet](./epic-30-authorization-approval-packet.md) | **Preserve and amend.** Retain exact candidate hashes, recorded decisions, corrections, open decisions, and reviewer gaps; reconcile relevant rules into 30.14, 30.16, 30.18, and Epic 31 provider/action contracts. | Its approvals are bound to the named candidates, policy wording, actor, and date. They do not approve the new story map, minimal interfaces, Graph RAG, ModelPort, Hermes, actions, or notifications. |
| [Authorization v2 proposed addendum](./epic-30-authorization-v2-proposed-addendum.md) | **Preserve; propose supersession after decision reconciliation.** Carry its independent-membership, authority-envelope, receipt, derivative, and verification proposals into the new contract review. | It labels itself proposed and cannot be treated as approved merely because later work resembles it. Record an explicit human disposition against its exact hash before supersession. |
| [Local authorization contract](./epic-30-local-authorization-contract.md) | **Preserve and amend.** Map still-valid deny-by-default, founder non-override, revocation, audit, replay, and outage rules into 30.16 and applicable Epic 31 stories. | It is a provisional/local contract with later approved subsections, not proof that every route, plugin, project grain, device, provider, action, or notification enforces the rule. |
| [Design approval packet](./epic-30-design-approval-packet.md) | **Preserve; propose visual-baseline supersession.** Retain exact hashes, variances, accessibility findings, approval wording, and human-test protocol; use them as historical input to 30.14, 30.15, 30.19, 30.20, and 30.22. | The old My Work design approval does not approve the new warm modular shell, graph mock, inspector, evidence paths, chat, device, action, or notification surfaces. A new exact hash and acceptance receipt are required. |
| [Provisional local design](./epic-30-provisional-local-design.md) | **Retire as active design only after human acceptance; preserve historically.** | Its synthetic My Work scope and exclusions remain evidence of what was tested. It must not remain a competing current design after the replacement visual contract is accepted. |
| [Board reconciliation packet](./epic-30-board-reconciliation-packet.md) | **Preserve and amend after acceptance.** Retain the old Notion/local mapping and receipt; create a sanctioned transition for old 30.1–30.13 and new 30.14–30.22 plus 31.1–31.8. | The old board receipt proves only the old items and states that were read back. This draft does not update Notion, create items, or change any status. |
| [Completion checklist](./epic-30-completion-checklist.json) | **Preserve; retire as the active completion gate only after replacement gates validate.** | Its old 13-story inventory and pending-gate results remain historical evidence. It cannot validate the new 30.14–30.22 or 31.1–31.8 scope and does not resolve the 30.4 status conflict. |
| [Implementation readiness](./implementation-readiness-epic-30.md) | **Preserve and replace with a newly generated readiness assessment after reconciliation.** | Existing test counts, candidate SHAs, receipts, and open gates are bounded to the old plan and their recorded dates. They are not present-tense proof and do not make the new stories ready. |
| [Course-correction proposal](./sprint-change-proposal-2026-09-17.md) | **Preserve historically; propose supersession by the accepted 30/31 transition decision.** | It explains an earlier recovery and must remain auditable. It cannot authorize the new numbering, scope, canonical changes, or board transition. |
| Current uncommitted graph/admin work | **Preserve in place for diff-based review; amend, split, or retire only after 30.14 acceptance.** Candidate paths include `src/app/dashboard/graph/page.tsx`, `src/components/graph/**`, `src/lib/digital-brain/document-relationships*`, `src/app/dashboard/admin/**`, `src/components/dashboard/admin/**`, administration API/repository changes, demo scripts, fixtures, and focused tests. | Uncommitted files are not an accepted baseline, story completion, migration approval, release candidate, or durable receipt. Do not discard user work. Inventory each diff, map it to a new acceptance criterion, rerun the required lanes, and obtain review before carrying it forward. |

## Truthful current-code baseline

- The worktree is dirty with planning changes and uncommitted graph, administration, repository, fixture, demo, and test work. This map does not attribute ownership, accept, commit, revert, or publish any of it.
- The local development graph page currently passes authorized documents into `WorkspaceGraph`, but that component passes `edges={[]}` and tells the user that stored document relationships are unavailable. The production-mode branch of the page renders graph statistics rather than the proposed polished Graph RAG plugin.
- The current graph/admin changes and focused tests may be useful candidate evidence, but they do not establish the approved Allura visual contract, a persisted relationship migration, complete RLS proof, canonical traceability, five-human validation, or either final gate.
- Existing old-story receipts remain bounded to their exact commits, environments, test inventories, and stated limitations. A passing prior lane is not a pass for changed uncommitted code or new acceptance criteria.
- No source, schema, migration, provider, device, notification, board, sprint, or memory state is approved or changed by this planning map.

## Candidate memory inventory requiring review

The old Epic 30 plan cites the following planning-decision candidates. Their content, tenant, provenance, state, and continuing relevance have not been re-read for this draft. **No search, write, promotion, deletion, correction, or supersession was performed. A fresh governed inventory is required before any memory update.**

| Candidate ID | Treatment in this map | Required disposition |
|---|---|---|
| `ea28b0bf-7abf-4eae-a048-6fc32c9822ca` | Old Epic 30 planning-decision candidate only; no content or authority claim is made here. | **Review required.** Re-read through governed access, verify destination, provenance, current state, and exact conflict before proposing retain/amend/supersede. |
| `5c3304f9-93e7-4b85-8d78-216eabb5e537` | Old Epic 30 planning-decision candidate only; no content or authority claim is made here. | **Review required.** Re-read through governed access, verify destination, provenance, current state, and exact conflict before proposing retain/amend/supersede. |

## Canonical-document impact matrix

The canonical set is closed by [AI Guidelines](../../guidelines/AI-GUIDELINES.md#closed-documentation-set). This planning artifact does not edit the six documents. After plan approval, the following impacts must be reconciled in one reviewed change set.

| Canonical document | Required Epic 30/31 impact | Approval/evidence gate |
|---|---|---|
| [BLUEPRINT.md](../../docs/allura/BLUEPRINT.md) | Propose replacing the single-epic framing with Epic 30 Stories 30.14–30.22 and Epic 31 Stories 31.1–31.8: minimal interfaces, modular shell/presentation-only client packs, plugin registry, capability authority, GraphSnapshot/EvidencePort, Graph RAG, sources/evidence, Epic 29 integration, provider-neutral ModelPort, Ask, chat, optional Hermes transport, governed actions, in-app notifications, and separately gated browser push. | Product owner approves scope, non-goals, actors, the 30/31 dependency, and the Epic 29 integration boundary. Every new requirement receives stable IDs. |
| [SOLUTION-ARCHITECTURE.md](../../docs/allura/SOLUTION-ARCHITECTURE.md) | Add shell/plugin/client-pack topology; capability envelopes; GraphSnapshot/EvidencePort flows; Epic 29 device interface consumption; provider-neutral `ModelPort`; direct-provider and qualifying-framework adapter seams; Ask/chat; optional Hermes transport; governed-action execution; separate in-app/browser-push delivery; failure isolation; and server-owned authorization. | Architecture and security review approve boundaries, trust zones, runtime hot paths, provider/framework portability, deployment topology, and rollback. |
| [DESIGN-ALLURA.md](../../docs/allura/DESIGN-ALLURA.md) | Define shell and plugin lifecycle, presentation-only client packs, capabilities, GraphSnapshot/EvidencePort, Graph RAG visual states, sources/evidence UX, device state, `ModelPort` and spike, read-only Ask service/API, accessible chat plugin, optional Hermes transport, action approvals, in-app notifications, separately gated browser push, truth states, accessibility, and observability. | Exact design artifacts/hashes, API/interface contracts, state machines, failure semantics, framework-spike exit criteria, and split human-test protocols approved. |
| [REQUIREMENTS-MATRIX.md](../../docs/allura/REQUIREMENTS-MATRIX.md) | Retire or map old E30 requirement references; trace every new B/F/use-case ID to Epic 30 core and Epic 31 experience stories, APIs, tests, and decisions. | Deterministic traceability check shows no orphan, duplicate, or falsely satisfied requirement. |
| [RISKS-AND-DECISIONS.md](../../docs/allura/RISKS-AND-DECISIONS.md) | Record the exact 30/31 split; shell/client-pack and plugin decisions; capability trust boundary; renderer process; example/live separation; GraphSnapshot/EvidencePort authority; Epic 29 reuse; provider-neutral `ModelPort`; direct-provider baseline and narrow framework-spike admission/exit rules; optional Hermes transport; governed actions; separate in-app/browser-push gates; and proposed visual-constraint supersessions. | Each material choice has an approved AD status; every open security, privacy, portability, provider lock-in, performance, device, action, and notification risk has an owner. |
| [DATA-DICTIONARY.md](../../docs/allura/DATA-DICTIONARY.md) | Add only approved fields/entities for plugins, client packs, capabilities, GraphSnapshot nodes/edges, sources, evidence paths, device references, AI runs/citations/conversations, action approvals/receipts, and push subscriptions/consent/delivery. | Data/security owners approve names, types, retention, sensitivity, keys, relationships, tenant/workspace scope, and matching schemas before implementation. |

## Approval checklist

This draft becomes actionable only after all applicable items are completed:

- [ ] Sabir approves the exact nine-story Epic 30 (30.14–30.22) / eight-story Epic 31 (31.1–31.8) split and council-recommended story register.
- [ ] Product owner confirms the outcome and non-goals for minimal interfaces, the shell, presentation-only client packs, plugin registry, Graph RAG, evidence, Epic 29 integration, provider-neutral `ModelPort`, direct-provider baseline, narrow qualifying-framework spike, Ask, chat, optional Hermes transport, governed actions, in-app notifications, and separately gated browser push.
- [ ] Architecture owner approves the core/plugin/client-pack boundary, versioning, failure isolation, and replacement strategy.
- [ ] Security and data owners approve capability roles, project grain, agent identity, GraphSnapshot/RLS, provider boundaries, Ask/chat isolation, action approval, device binding, push consent, retention, and revocation rules.
- [ ] Design owner approves the exact Allura visual system, reference screenshots, motion rules, responsive states, shell/graph/evidence/device states, chat/action/notification states, and accessibility protocol by artifact hash.
- [ ] The contradiction in old Story 30.8 (`no graph canvas added`) receives an explicit human-approved supersession decision.
- [ ] The old Story 30.7 constraints and design baseline receive an explicit preserve/amend/propose-supersession disposition into Stories 30.15, 30.17, 30.19, and 30.20 rather than silent drift.
- [ ] Old Story 30.4's technical evidence receives a delta review and its `done` header versus `backlog` sprint-status conflict is reconciled; no completion is carried forward by inference.
- [ ] All partial implementation evidence is mapped by exact commit, test, receipt, limitation, and new acceptance criterion.
- [ ] The two candidate planning-memory IDs in this document receive a fresh governed inventory; their authority, provenance, destination, and current state are recorded without inventing facts before any update.
- [ ] The six canonical documents are updated together according to the impact matrix, with AI-assistance disclosure and human review.
- [ ] The requirements matrix validates every new requirement and story with no orphan or duplicate ownership.
- [ ] New Epic 30/31 story artifacts and board items are created only after the canonical contract is approved.
- [ ] Sprint status is changed only by the sanctioned script and only after board/canonical evidence agrees.
- [ ] Example data is structurally isolated, permanently labeled `EXAMPLE DATA · NOT LIVE`, and proven unreachable in production mode.
- [ ] Live/authorized data paths prove endpoint authorization, revocation, non-disclosure, audit, and rollback before activation.
- [ ] Epic 30 Story 30.22 and Epic 31 Story 31.8 have separate exact-SHA CI, independent review, human-validation, receipt, release, and retrospective gates.
- [ ] Five distinct humans complete the approved task set for each epic where required; simulations and AI agents are not counted.
- [ ] Publication, merge, deployment, external messaging, notification delivery, memory write/promotion, and retrospective each receive their own required authority.

## Draft disposition

**Current disposition: review required.** The safest immediate next step is human review of this map followed by coordinated approval of the six canonical-document changes and the council-recommended Epic 30/31 drafts. Until then, the thirteen old artifacts remain the recorded story history, their statuses remain unchanged (including the unresolved old 30.4 conflict), and no memory is superseded.
