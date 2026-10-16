---
title: "Epic 30 — Governed Modular Workspace"
type: epic-plan
epic: 30
status: proposed
owner: Brooks
story_count: 9
implementation_readiness: blocked
supersession_state: "proposes to supersede after human acceptance and canonical reconciliation"
---

# Epic 30 — Governed Modular Workspace

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model (GitHub Copilot).
> Content has not yet been fully reviewed — this is a working design reference, not a final specification.
> AI-generated content may contain inaccuracies or omissions.
> When in doubt, defer to the source code, JSON schemas, and team consensus.

## Readiness state

**PROPOSED / BLOCKED — NOT READY FOR DEV UNTIL CONTRACT ACCEPTED.**

This document proposes a planning reset. It is not backlog authority and does not create, rename, advance, or approve any story. No design, schema, security policy, release, production change, or completion claim is approved here.

## Dashboard concept revision — 2026-10-15

Sabir requested this planning update, not implementation or a new product. **Allura is the dashboard product.** Faith Meats is one possible client workspace; Mortgage is a possible business plugin. Neither replaces Allura's brand or becomes the universal home screen. **Hermes is Sabir's personal bring-your-own-agent test case, not Allura's default or a dependency.** Other users bring their own supported agent and provider credentials through the proposed Epic 31 interfaces.

This section updates draft product direction only. It does not approve security boundaries, schema changes, external connections, production release, story status, or semantic memory promotion. Historical evidence and existing uncommitted implementation work remain intact.

### Menu and progressive disclosure

The full menu is a capability catalog, not a promise that every app is implemented or included in Epic 30. The ordinary sidebar shows enabled, permitted modules, collapsible groups, and pinned favorites. Home is a personal overview of priorities, recent work, and quick actions; Graph and commerce are not forced landing pages.

| Group | Proposed catalog |
| --- | --- |
| Home | My dashboard, notifications, recent activity |
| Chat and knowledge | Agent Chat, Allura Memory, Projects, Files, optional Graph |
| Daily work | Email, Calendar, Tasks and follow-ups, Kanban, Workflows |
| Business dashboards | CRM, E-commerce/Sales, Finance, Invoices, Analytics, Productivity, Academy, Logistics, Infrastructure |
| Studio | Customize dashboard, Apps and plugins, Connections, Agents, AI providers and API keys, Brand and appearance |
| Administration | Users and invitations, Roles and permissions, Policies and access reviews, Authentication and security, Audit logs |
| Account | Profile, Preferences, Sign out |

Login, registration/invitation, and password recovery are outside signed-in navigation. Template v1/v2 pages are alternative designs, not duplicate user-facing menu entries. No unavailable integration may look operational; use a clearly labeled catalog/setup state or omit it from active navigation. Administration controls do not create permission merely by being visible.

### Proposed requirement delta and delivery ownership

These planning-only identifiers must be mapped to canonical B/F/use-case IDs before implementation. They do not create registered stories or imply complete APIs.

| Draft ID | Requirement | Proposed owner | Acceptance evidence required |
| --- | --- | --- | --- |
| E30-D01 | One bright, warm, welcoming Allura shell: real logo, cream/light ground, rounded surfaces, restrained color accents rather than blue-heavy panels | 30.15 | Reference comparison at desktop/mobile sizes, keyboard/contrast/reduced-motion checks, human visual review |
| E30-D02 | Personal Home, collapsible catalog, favorites, resize/reorder/hide widgets, reset layout, General/Sales/Mortgage preset concepts | 30.15 | Saved preferences survive reload; reset affects presentation only; disabled/denied modules do not leak content |
| E30-D03 | Reviewed first-party plugins declare identity/version, shell compatibility, pages/widgets, capabilities, data ownership, connections, agent-tool contributions, health and disable behavior | 30.14, 30.17 | Manifest conformance and denied/incompatible/failed-plugin tests; no arbitrary uploaded-code marketplace |
| E30-D04 | Separate shell, business plugin, connector, saved view, workflow and agent adapter | 30.14, 30.17 | Enabling is distinct from authorization and connection; removing a view cannot execute a workflow |
| E30-D05 | Optional Graph opens around a selected permitted record; whole-workspace view remains optional | 30.19, 30.20 | Pan/zoom/select/inspect, accessible relationship alternative, sparse-data honesty, bounded animation and reduced motion |
| E30-D06 | Deferred loading, plugin health visibility and reversible troubleshooting mode | 30.17, 30.22 | Measure cold/warm navigation and plugin startup on agreed devices; disabling optional plugins preserves core tasks, records, audit and security controls |
| E30-D07 | Mortgage demonstrates reusable business-plugin design, not a separate app | 30.14 contract; implementation separately scoped | Proposed Overview, Loan files, Document checklist, Review queue, Follow-ups, Evidence/audit packets; no automated loan approval or compliance claim |
| E31-D01 | Provider-neutral BYOK/BYOA chat with explicit supported integrations; Hermes is Sabir's personal test case only | 31.1, 31.3, 31.4 | No default/preconnected agent; supported alternative adapter or protocol fixture proves replaceability; no fallback to a different payer/provider |
| E31-D02 | Visible run state, stop, retry, action approval, permitted context, errors and usage | 31.3, 31.5, 31.8 | Stop/cancellation and ambiguous-result handling; distinguish reported usage from estimates/unavailable data; no secrets or hidden reasoning in activity UI |

Keep the nine-story Epic 30 / eight-story Epic 31 split proposed. Catalog breadth must not silently expand those stories into implementations of every listed app. Real Shopify sync, CRM persistence, Mortgage processing, Email, Finance, Academy and other domain modules need explicit scoped deliverables, owners, data contracts and acceptance before scheduling. Epic 30 proves shell/plugin behavior; Epic 31 owns agent connections, governed actions and notification delivery. Studio configuration is not proof of a working execution engine.

### Studio reuse and evidence discipline

Use the user-selected [Studio Admin repository](https://github.com/arhamkhnz/next-shadcn-admin-dashboard) as a UI source candidate, not as evidence of working Allura integrations. Pin the source revision, retain applicable license notices, map reused components, and validate accessibility and backend contracts before integration. Do not claim a template screen is a live service.

Community feedback is research input, not approval or a representative survey. Relevant threads support test hypotheses: [plugin complexity and maintenance](https://www.reddit.com/r/ObsidianMD/comments/1qir3bf/how_many_plugins_before_its_too_much/), [startup/stutter complaints](https://www.reddit.com/r/ObsidianMD/comments/1koioiw/what_frustrates_you_the_most_when_you_use_obsidian/), [adjustable dashboards](https://www.reddit.com/r/ObsidianMD/comments/1v8ss59/which_are_the_best_current_options_for_a_nice/), [graph overload](https://www.reddit.com/r/ObsidianMD/comments/1jaafel/), and [agent usage/session visibility](https://www.reddit.com/r/hermesagent/comments/1tv64q5/what_is_your_best_dashboard_for_multi_agent_manage/). Validate with the existing five-human protocol, not Reddit popularity or simulated users.

### Rollout and rollback requirements

1. Review the updated concept and bounded requirements; reconcile canonical documents through the existing approval process. Preserve old evidence, statuses and hash-bound approvals.
2. Prove the shared shell with synthetic fixtures and optional plugins off. Test a preset without changing permissions; test Graph and a synthetic Mortgage contract independently. No live business data or external agent call is needed for this stage.
3. For each admitted plugin, capture the known-good code/configuration version, compatibility checks and data implications before enabling it in a test workspace. Test denied roles, direct URLs, reload, disconnect, revocation and plugin failure.
4. Roll back a failed presentation/plugin change by disabling that optional feature and restoring the last compatible approved configuration. Preserve records, evidence and audit. Do not weaken permissions, downgrade credentials, delete business data, or blindly reverse a schema migration. Protected effects and data migrations retain separate action-specific gates.
5. Plugin disable stops admission of new plugin work. Existing runs must be cancelled or reconciled under their approved execution contract; a UI toggle does not prove cancellation or undo an external effect. Disconnect and credential revocation are separate controls.
6. Re-test Home, Files, Memory, Tasks and denied-access paths after rollback. Record unresolved external outcomes as pending/unknown. No rollout advances on a failed isolation, critical accessibility, or agreed performance gate.

Planning-only rollback: reverse only this dated revision and its linked draft edits after comparing against their pre-edit snapshots; never reset the dirty repository to HEAD. Do not roll back unrelated repairs. No runtime rollback was requested or performed by this planning update.

## Proposed supersession and evidence preservation

After human acceptance and reconciliation with the canonical six-document set, this plan **proposes to supersede** the prior 13-story Epic 30 product scope with nine non-colliding stories numbered 30.14–30.22. Until both gates pass, the earlier scope remains the operative historical planning record.

All prior story files, implementation attempts, screenshots, tests, database receipts, reviews, commits, and audit records remain historical evidence. They will not be deleted, rewritten as success, or treated as acceptance of this proposal. New story files and sprint-status changes are outside this planning rewrite.

The proposed split is:

- Epic 30: governed modular workspace, minimal contracts, presentation-only client packs, capability authority, plugin registry, graph/evidence foundation, polished Graph RAG, sources/evidence UX, integration with accepted Epic 29 device contracts, and final proof.
- Proposed Epic 31: governed chat, framework selection for orchestration, Hermes integration, push notifications, and later assistant/plugin capabilities.

## Truthful current-code baseline

The reviewed workspace does not yet satisfy this proposal:

- The current graph path supplies documents while its operative relationship input is `edges=[]`; the visible result is document cards rather than a connected evidence graph.
- A local untracked relationship helper exists, but no relationship migration or RLS contract has been approved. It is not live schema evidence.
- Ask Allura has no accepted route/provider implementation.
- The portal contains Hermes-facing presentation, but no verified Hermes handshake receipt exists.
- No push-notification implementation or delivery receipt exists.
- The only discovered module registry is Curator-specific; there is no general first-party workspace plugin registry.
- No validated client-pack contract or implementation exists.
- Current application roles include viewer, curator, and admin, while other planning surfaces describe different role concepts. That role-system drift must be reconciled before capabilities or migrations change.

Passing component tests, saved screenshots, synthetic fixtures, or partially implemented local files do not change this baseline.

## Product promise

Allura is a warm, calm, trustworthy workspace where an authorized person can explore connected memory, inspect evidence, and understand why information is shown. New features and client presentations can be added without forking the governed core or creating alternate authority models.

## Governed planning workflow

1. Search Allura Brain in `allura-system` for current decisions, blockers, and outcomes.
2. Reconcile memory with repository state, canonical documents, schemas, prior plans, receipts, AI guidelines, and visual references.
3. Use Team RAM for architecture, interfaces, security, data, performance, and readiness review.
4. Use Team Durham for brand, interaction, accessibility, visual consistency, and emotional-quality review.
5. Reconcile this proposal into the canonical six-document set and requirement matrix.
6. Obtain explicit human acceptance of the version/hash and unresolved-decision register.
7. Only then create story files, update status through the sanctioned mechanism, and begin one bounded story at a time.
8. Validate each story and log an episodic outcome. Semantic memory promotion remains a separate human decision.

Repository evidence controls current implementation truth. Memory is context, not automatic authority.

## Story 30.14 minimal interface contract

Story 30.14 must define and version the smallest stable interfaces before implementation stories begin.

### `VerifiedExecutionContext`

A server-created, immutable context containing the verified principal, tenant, workspace, membership/delegation/session versions, resolved capability identifiers, policy version, scope version, issue time, and expiry. It is created only at the trusted authentication/authorization boundary. Browser fields, plugin configuration, client packs, cursors, and request bodies may select a resource but may never construct, modify, or grant this context.

### `PluginDefinition`

A declarative, versioned first-party plugin definition containing only a stable plugin ID, definition version, compatible shell range, declared UI contributions, required capability IDs, configuration-schema version, data-port dependencies, health contract, and disable/rollback metadata. It does not execute arbitrary packages, carry credentials, select tenants, define roles, or replace authorization. Runtime handlers receive approved ports plus `VerifiedExecutionContext`.

### `ClientPack`

A presentation-only, versioned configuration containing a client/brand ID, approved tokens/assets, terminology, navigation labels/order, graph taxonomy labels, and `enabledPluginIds`. It contains no roles, capabilities, grants, tenant/workspace selectors, endpoints, credentials, provider settings, executable code, or permitted adapters. Enabling an ID cannot authorize or load an unregistered plugin.

### `GraphSnapshot`

A server-created, versioned authorized projection with `snapshotId`, `scopeVersion`, issue time, expiry, authorized nodes, authorized edges, evidence references, and an opaque bound cursor. The cursor is bound to the verified principal/tenant/workspace, scope version, snapshot, query/filter/sort, and expiry; it grants no authority and fails closed after change, revocation, tamper, or expiry. Every edge requires authorization of both endpoints and the relationship.

### `EvidencePort`

A narrow, read-only interface for resolving already-authorized evidence references into citations, provenance, freshness, and uncertainty/degraded state. It accepts `VerifiedExecutionContext`; it cannot grant authority, accept caller-selected scope, invoke a model/provider, mutate sources, or perform external effects. It returns opaque references rather than leaking inaccessible resource metadata.

### Boundary rule

The shell and plugins consume these interfaces; they do not reach directly into authentication, role tables, raw database pools, provider SDKs, or device secure stores. Contract versions fail closed when incompatible. 30.14 must map each interface into the canonical architecture, design, requirements, risk/decision, and data-dictionary owners before acceptance.

## Architectural rules

### Governed core and registry

The stable core owns verified context, authorization, RLS, audit, provenance, receipts, revocation, the minimal interfaces above, shared accessible states, and observability. The allowlisted first-party registry rejects unknown, incompatible, unhealthy, disabled, or unauthorized plugins without breaking the shell. Graph RAG is the first conformance plugin.

### Presentation-only client packs

Faith Meats is the first proving presentation. A neutral second fixture proves portability. Client packs may narrow visible features through `enabledPluginIds`; actual plugin availability and capability remain registry- and server-controlled.

### Graph modes

1. **Development Example Mode** uses deterministic synthetic fixtures in a physically separate development/test module and route. It never calls governed repositories and always shows `EXAMPLE DATA · NOT LIVE`. Production evidence must prove its route and fixtures are unreachable.
2. **Authorized Mode** uses stored, server-authorized records and relationships only. It never invents nodes, edges, paths, citations, confidence, provenance, or counts. Sparse data remains sparse.

The modes do not share persistence, caches, indexes, analytics, AI context, or exports.

## Limited marketer capability profile

The limited marketer is a proving least-privilege role, not a renamed administrator.

Default allowed only when server-resolved membership grants the named capability and resource scope:

- enter the assigned workspace;
- view enabled first-party plugin surfaces;
- search, view, and graph only assigned marketing/department content;
- inspect citations and provenance for content already readable;
- create marketing drafts and edit their own drafts only when separately granted `content:draft` and `content:update:own`;
- pair an approved device only through accepted Epic 29 policy when separately granted.

Default denied:

- private owner memory and departments/projects not explicitly assigned;
- user, membership, role, capability, client-pack, plugin, tenant, workspace, security, RLS, audit, or device administration;
- final publication, external sharing/messaging, bulk export, deletion, approval, semantic promotion, production release, notification delivery, provider/model selection, agent/tool execution, or policy changes;
- inference of protected names, counts, existence, snippets, relationships, sources, or timing through search, graph, evidence, errors, caches, or notifications.

Explicit denial overrides grants. Administrative status never implies private readership.

## Proposed requirement-to-story map

These non-colliding IDs are proposed only. They do not alter current story files or sprint status.

| Requirement | Proposed story | Outcome | Depends on | Minimum acceptance evidence |
| --- | --- | --- | --- | --- |
| E30-R14 | **30.14 Contract reset and minimal interfaces** | Reconcile authority and version `VerifiedExecutionContext`, `PluginDefinition`, `ClientPack`, `GraphSnapshot`, and `EvidencePort`. | none | Human-accepted hash, canonical reconciliation, interface schemas/tests, old-to-new trace, decision register |
| E30-R15 | **30.15 Workspace shell and presentation-only client packs** | Deliver the accessible Allura shell and presentation-only Faith Meats/neutral packs using `enabledPluginIds`. | 30.14 | Schema/fallback tests, cross-client isolation, viewport screenshots, no-authority proof |
| E30-R16 | **30.16 Capability authority and role reconciliation** | Reconcile current viewer/curator/admin drift and enforce one server-owned capability decision, including the limited marketer profile. | 30.14 | Accepted capability matrix, forged-selector/revocation/deny tests, marketer proof, audit receipts |
| E30-R17 | **30.17 First-party plugin registry** | Deliver the allowlisted registry, compatibility, lifecycle, health isolation, UI contributions, disable, and rollback. | 30.14–30.16 | Contract tests, unknown/incompatible/failed-plugin controlled red, independent interface review |
| E30-R18 | **30.18 GraphSnapshot, EvidencePort, relationship schema, RLS, and audit** | Implement the authorized graph/evidence ports and stored relationship foundation. | 30.14, 30.16, 30.17 | Approved migration/rollback, disposable PostgreSQL restricted-role proof, endpoint/edge isolation, cursor/revocation tests |
| E30-R19 | **30.19 Polished Graph RAG plugin** | Deliver the branded Obsidian-inspired graph, node selection, node inspector, search/filter, calm motion, responsive layout, and dev-only example experience. Evidence-path acceptance is excluded. | 30.15, 30.17, 30.18 | Visual hash/variance, interaction/accessibility tests, production example-exclusion proof |
| E30-R20 | **30.20 Sources and evidence UX** | Deliver openable citations, evidence paths, provenance, freshness, uncertainty, and degraded/revoked evidence states through `EvidencePort`. | 30.18, 30.19 | Evidence-path accuracy, citation openability, derivative isolation, no-existence-leak tests |
| E30-R21 | **30.21 Epic 29 integration and real-client proof** | Consume accepted Epic 29 B1 Clerk and B2 desktop secure-store/device contracts without rebuilding their server or stores. | 30.14–30.17 and accepted Epic 29 B1/B2 | Browser Clerk proof, desktop secure-store/client pair/reconnect/revoke/degraded proof, ownership receipts |
| E30-R22 | **30.22 Final visual, security, performance, and five-human gate** | Prove the proposed workspace is on-brand, safe, accessible, responsive, operable, and ready for release consideration. | 30.15–30.21 | Durham and Team RAM reviews, exact-SHA CI, controlled red, live browser/database/client proof, human protocol |

## Epic 29 ownership boundary

Epic 29 retains acceptance ownership for:

- **B1 Clerk runtime:** identity/session establishment, token/session lifecycle, server trust boundary, and Clerk-specific acceptance evidence.
- **B2 desktop secure store:** device pairing, device keys, OS-backed secret storage, rotation, revocation, and their server/client acceptance evidence.

Proposed Story 30.21 owns only Allura workspace integration against accepted B1/B2 contracts and real browser/desktop client proof. It cannot rebuild, fork, silently close, or claim acceptance for Epic 29. Push delivery is not part of 30.21.

## Allura experience contract

Use the accepted Allura identity: cream ground, ink structure, Allura blue for memory/intelligence, green for trusted connection, and orange for active evidence/review. Use generous spacing, flat rounded surfaces, soft borders, calm language, purposeful motion, and circular graph nodes. Do not ship raw browser controls, generic graph cards, gradients, glow, glass, heavy shadows, or decorative continuous movement.

Support desktop, tablet, mobile, keyboard, screen readers, 200% zoom, high contrast, and reduced motion. Visual acceptance requires direct comparison with the versioned references; functional tests alone are insufficient.

## AI-assisted implementation rules

The disclosure above is mandatory until full human review and PR sign-off. AI output is never self-approving evidence. Record the model/runtime, bounded task, sources, reviewer, validation commands, and artifact/commit hash for material AI work. Do not send governed content to an external model without approved data handling. Agents receive only the intersection of user authority, delegation, capability, resource policy, and tool policy. No autonomous permission change, sharing, deletion, publication, external messaging, release, policy change, or semantic memory promotion.

## Non-goals

- Governed chat, LangChain/framework orchestration, embedded Hermes, assistant tool execution, push delivery, or autonomous agents; these belong in proposed Epic 31 after separate acceptance.
- Rebuilding or accepting Epic 29 B1/B2.
- Production seeding, invented live relationships, organization-wide Brain browsing, private-sharing/admin override, unrestricted export, third-party plugin packages, client forks, or silent protected actions.

## Approval gates

Action-specific approval is required for proposal/contract acceptance, canonical reconciliation, design hash, schema/migration/RLS/role/capability changes, external providers, production release, external sharing, pushes, protected/destructive actions, policy change, semantic promotion, and retrospective acceptance. Owner status or prior general approval does not waive a gate.

## Final acceptance evidence

Proposed Epic 30 closes only after all accepted stories have one frozen-commit packet proving contract/canonical reconciliation, historical traceability, migration/RLS/rollback, authorization/revocation, registry/client-pack isolation, production exclusion of examples, direct visual comparison, accessibility, measured performance, real-client Epic 29 integration, exact-SHA CI, and controlled-red disclosure tests.

Story 30.22 must use **five distinct human users**. For every agreed task, **at least four of the five must succeed**, with **no critical error** and **zero unauthorized disclosure**. Simulated roles, agents, or repeated sessions do not count as distinct people. Evidence records the task, participant identity/pseudonym, role, device/browser, result, error severity, disclosure outcome, consent, timestamp, and remediation/retest. Any critical error or unauthorized disclosure fails the gate regardless of the success count.

## Execution boundary

No implementation story begins until 30.14 receives explicit human acceptance and canonical reconciliation evidence. Use one eligible story and one writer at a time with risk-matched independent review. Use disposable local services and synthetic data; no production database, credentials, LAN exposure, or external model/configuration change. Sprint status uses the sanctioned mechanism only. Stop at unresolved authority, approval, destructive, provider, schema, production, or human gates.
