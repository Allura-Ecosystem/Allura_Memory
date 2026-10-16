---
title: "Epic 30 PRD — Governed Modular Workspace"
type: product-requirements
epic: 30
status: proposed
implementation_readiness: blocked
supersession_state: "proposes to supersede after human acceptance and canonical reconciliation"
---

# Epic 30 — Product Requirements

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model (GitHub Copilot).
> Content has not yet been fully reviewed — this is a working design reference, not a final specification.
> AI-generated content may contain inaccuracies or omissions.
> When in doubt, defer to the source code, JSON schemas, and team consensus.

## Document state

**PROPOSED / BLOCKED — NOT READY FOR DEV UNTIL CONTRACT ACCEPTED.**

This PRD proposes a replacement Epic 30 contract. It is not backlog or implementation authority. It creates no story, status, design, migration, provider, policy, release, or completion approval. See the [Epic 30 plan](./epic-30-governed-digital-brain-workspace.md).

After explicit human acceptance and canonical reconciliation, this PRD **proposes to supersede** the earlier 13-story product scope. Until then, that scope remains the operative historical plan. Its files and receipts remain preserved evidence and must not be deleted or relabeled as acceptance.

## Dashboard concept clarification — 2026-10-15

The [dated dashboard revision](./epic-30-governed-digital-brain-workspace.md#dashboard-concept-revision--2026-10-15) records the latest user-directed concept and planning-only requirement delta E30-D01–E30-D07 / E31-D01–E31-D02. Allura is the reusable product; client presets and Mortgage are optional configurations/plugins, not replacement products. Home is personal and welcoming; Graph is optional and context-first. The full Studio-inspired menu is a capability catalog, not an implemented-feature inventory or a commitment to build every domain app in Epic 30.

BYOK/BYOA remains provider- and agent-neutral. Hermes is Sabir's personal test case, not the default for other users. Agent connections and live effects remain Epic 31 work. Proposed plugin rollback preserves data and authorization, separately handles in-flight work and disconnect, and requires post-rollback regression checks. These clarifications do not change readiness/status or accept security/data contracts.

## Current baseline

The reviewed code currently has `edges=[]` on the graph path; an untracked relationship helper but no approved migration/RLS contract; no accepted Ask route/provider; portal Hermes presentation but no handshake receipt; no push implementation; only a Curator-specific module registry; no client pack; and viewer/curator/admin roles alongside conflicting planned role concepts. None of those gaps is closed by this PRD.

## Product purpose

Deliver a governed modular workspace that feels warm, calm, intelligent, trustworthy, and welcoming. Authorized people can explore connected memory, select and inspect nodes, search real sources, and verify evidence. Teams can add first-party features and client presentations without forking the core or creating alternate authority systems.

## Users

- Owners and administrators who configure a workspace but do not automatically gain private-content access.
- Members who search, explore, and verify content within authorized private or department scope.
- A limited marketer who receives only assigned marketing capabilities and content.
- Client implementers who configure presentation without changing authority.
- First-party plugin developers who consume minimal versioned interfaces.

## Proposed outcomes

The [proposed story map](./epic-30-governed-digital-brain-workspace.md#proposed-requirement-to-story-map) uses non-colliding IDs:

1. **30.14 Contract reset and minimal interfaces.**
2. **30.15 Workspace shell and presentation-only client packs.**
3. **30.16 Capability authority and role reconciliation.**
4. **30.17 First-party plugin registry.**
5. **30.18 GraphSnapshot, EvidencePort, relationship schema, RLS, and audit.**
6. **30.19 Polished Graph RAG plugin.**
7. **30.20 Sources and evidence UX.**
8. **30.21 Epic 29 integration and real-client proof.**
9. **30.22 Final visual, security, performance, and five-human gate.**

These are proposed definitions, not created stories or status changes.

## Story 30.14 minimal interface requirements

### `VerifiedExecutionContext`

A server-created immutable envelope for verified principal, tenant, workspace, session/membership/delegation versions, resolved capabilities, policy version, scope version, issue time, and expiry. Only the trusted authentication/authorization boundary creates it. Callers, plugins, packs, and cursors cannot construct or enlarge it.

### `PluginDefinition`

A declarative first-party definition containing stable ID, definition version, compatible shell range, UI contributions, required capability IDs, configuration-schema version, data-port dependencies, health, disable, and rollback metadata. It contains no credentials, tenant selection, roles, arbitrary package loading, or authorization logic. Runtime handlers receive approved ports and `VerifiedExecutionContext`.

### `ClientPack`

A presentation-only versioned object containing client/brand ID, approved visual tokens/assets, terminology, navigation labels/order, taxonomy labels, and `enabledPluginIds` only for feature selection. It contains no roles, permissions, grants, tenant/workspace selectors, endpoints, credentials, provider configuration, executable code, or permitted adapters. Registry and capability checks remain authoritative.

### `GraphSnapshot`

A server-created authorized projection containing contract version, `snapshotId`, `scopeVersion`, issue time, expiry, authorized nodes/edges, evidence references, and an opaque bound cursor. The cursor binds verified scope, snapshot, query/filter/sort, and expiry and grants no authority. Tamper, revocation, scope change, or expiry fails closed.

### `EvidencePort`

A narrow read-only interface that accepts `VerifiedExecutionContext` and already-authorized evidence references and returns citations, provenance, freshness, and uncertainty/degraded state. It cannot grant access, accept caller-selected scope, call providers/models, mutate sources, or perform external effects.

All interfaces are versioned and fail closed on incompatibility. Shell/plugins cannot bypass them through raw auth, database, provider, or secure-store access.

## Functional requirements

### Shell and client packs

- Provide one accessible Allura shell with branded navigation, workspace/session context, plugin contributions, role-aware controls, and truthful loading, empty, forbidden, stale, degraded, conflict, error, and complete states.
- A failed, disabled, incompatible, or unauthorized plugin fails independently.
- Faith Meats proves the first presentation; a neutral fixture proves portability.
- Client packs may choose `enabledPluginIds`, labels, taxonomy, tokens, and assets only. Enabling a plugin ID neither registers it nor grants its capabilities.
- Invalid packs fail safely without tenant crossover.

### Capability authority and limited marketer

The server resolves capabilities from verified identity, workspace membership, delegation, resource policy, explicit denial, and session/policy versions. Navigation is never authorization.

A limited marketer may, only within explicitly assigned resources and separately granted capabilities:

- enter the assigned workspace;
- view enabled plugin surfaces;
- search/view assigned marketing or department content;
- view the authorized graph and inspect citations/provenance for readable content;
- create marketing drafts and edit their own drafts when granted `content:draft` and `content:update:own`;
- pair a permitted device through accepted Epic 29 policy.

The limited marketer is denied by default from private owner/other department content; user/role/capability/client-pack/plugin/tenant/workspace/security/RLS/audit/device administration; final publication; external sharing or messaging; bulk export; deletion; approval; semantic promotion; production release; push delivery; provider/model selection; agent/tool execution; and policy changes. Denials also prohibit protected existence, names, counts, snippets, relationships, sources, and timing leakage. Explicit denial overrides grants.

Current viewer/curator/admin behavior and planned role concepts must be reconciled before capability implementation.

### First-party plugin registry

- Register only accepted `PluginDefinition` objects.
- Reject unknown, incompatible, unhealthy, disabled, or unauthorized plugins.
- Audit authorized workspace enablement without reading authority from `ClientPack`.
- Isolate failures and support deterministic disable/rollback.
- Graph RAG is the first conformance plugin.
- The existing Curator module registry is evidence to assess, not proof of a general plugin system.

### Graph foundation and interaction

- `GraphSnapshot` returns only authorized nodes, edges, counts, labels, evidence references, and bound cursor state.
- Every edge requires authorization of both endpoints and the relationship.
- Revocation invalidates future graph reads, searches, cursors, inspectors, caches, delegated runs, and evidence resolution within the accepted bound.
- Authorized Mode uses stored authorized facts only. It never invents relationships, paths, confidence, provenance, or counts.
- Story 30.19 delivers search/filter, circular nodes, select/inspect, drag, pan, zoom, fit, responsive layout, accessible relationship alternative, and calm reduced-motion behavior.
- Story 30.19 may select a node and open a node inspector; it does not claim evidence-path acceptance.
- Story 30.20 owns evidence paths, citations, provenance, freshness, uncertainty, degraded/revoked evidence behavior, and their acceptance evidence.

### Development Example Mode

- Deterministic synthetic fixtures live in a physically separate development/test module and route.
- The route is unavailable in production and never calls governed repositories.
- `EXAMPLE DATA · NOT LIVE` remains visible in every example screen/inspector and state contract.
- Example data never enters production persistence, caches, indexes, analytics, exports, AI context, or client evidence.
- Production verification proves the route and fixtures are unreachable.

### Sources and evidence UX

- Story 30.20 resolves evidence only through `EvidencePort`.
- Selected results expose openable authorized sources, accurate evidence paths, provenance, freshness, scope, confidence/uncertainty, and degraded state.
- Citations and derivatives never widen source access.
- Denials reveal no protected identity, content, metadata, relationship, count, facet, timing distinction, or existence.
- Audit identifies principal, tenant, workspace, decision, policy/version, disclosed resources, and receipt.

### Epic 29 integration

Epic 29 retains acceptance ownership:

- **B1 Clerk runtime:** identity/session establishment, lifecycle, and server trust boundary.
- **B2 desktop secure store:** pairing, device keys, OS-backed secret storage, rotation, revocation, and their server/client acceptance.

Story 30.21 owns only proving that the Allura workspace consumes accepted B1/B2 contracts in a real browser and supported desktop client: sign in, pair, reconnect, operate offline/degraded, revoke, recover, and preserve audit. It does not rebuild or accept B1/B2 and does not implement push. Typed device-event seams may support proposed Epic 31 later.

## Authorization and privacy

- Verified server state owns principal, tenant, workspace, membership, delegation, session, capability, and resource scope. Caller selectors never grant authority.
- Private ownership, administration, membership, role, capability, denial, and invitation are separate predicates.
- Missing, stale, conflicting, degraded, revoked, or unknown authority fails closed.
- Protected database access uses a restricted `NOBYPASSRLS` application role, forced RLS, and transaction-local verified scope.
- Search authorizes candidates before ranking where possible and again before return.
- Derivatives, embeddings, summaries, caches, analytics, citations, graph paths, and future notifications inherit strictest source authority.
- Unknown routes, plugins, capabilities, resources, edges, tools, workers, clients, and policy versions fail closed and remain observable.

## Brand, accessibility, and reliability

Use accepted Allura typography, logo, spacing, icons, radii, and semantic tokens: cream ground, ink structure, blue for memory/intelligence, green for trusted connection, and orange for active evidence/review. Use circular nodes, fine lines, meaningful clusters, designed controls, flat rounded modules, soft borders, generous space, calm language, and deliberate hierarchy. Do not ship gradients, glow, glass, heavy shadows, raw controls, generic rectangular graph cards, or decorative continuous movement.

Required states include welcome/empty, example, authorized, selected, evidence, search, loading, forbidden, degraded, error, desktop, tablet, mobile, 200% zoom, high contrast, and reduced motion. All functions need keyboard access, visible/restored focus, semantic alternatives, screen-reader meaning, 320-pixel usability, accepted contrast, and zero critical accessibility findings.

30.14 defines authorized graph limits, synthetic stress profiles, target devices/browsers, first-use/search/selection/frame/memory/query budgets, and graceful degradation. Mock node counts are not live claims. Final proof measures the accepted budgets against one frozen commit.

## AI-assisted work controls

The exact disclosure notice above remains until full human review and signed-off PR. AI output remains untrusted and cannot approve itself. Material AI-assisted work records runtime/model, bounded task, sources, reviewer, validation commands, and artifact/commit hash. Governed content cannot reach external models without approved data handling, retention, and training policy. Agents receive only intersected user authority, delegation, capability, resource policy, and tool policy. AI cannot self-approve design, migration, policy, release, external effects, protected actions, or semantic memory promotion.

## Epic boundary and non-goals

Proposed Epic 31, not Epic 30, owns governed chat; evidence-based LangChain/other orchestration choice; Hermes handshake and integration; push delivery, consent, preferences, quiet hours, security, and receipts; and write-capable/autonomous assistants.

Epic 30 also excludes rebuilding/accepting Epic 29 B1/B2, production seeding, invented live relationships, organization-wide Brain browsing, private-sharing/admin override, unrestricted export, third-party plugin package execution, client forks, and silent protected actions.

## Dependencies and approvals

- 30.14 human acceptance and canonical reconciliation are hard prerequisites.
- Schema, migration, RLS, role, capability, provider, device-scope, release, external sharing, destructive, policy, and semantic-promotion changes require action-specific approval.
- 30.21 depends on separately accepted Epic 29 B1/B2 contracts.
- Proposed Epic 31 depends on stable interfaces from Epic 30 and cannot be hidden Epic 30 scope.
- Owner identity, prior general approval, or a passing test does not waive a gate.

## Acceptance and completion gate

This proposal can become operative only after human acceptance and canonical reconciliation. Proposed Epic 30 completes only after accepted 30.14–30.22 evidence against one frozen commit proves historical traceability, interface conformance, migration/RLS/rollback, authorization/revocation, registry/client-pack isolation, production exclusion of examples, direct reference comparison, accessibility, performance, real-client Epic 29 integration, exact-SHA CI, controlled-red disclosure tests, and release/rollback evidence.

Story 30.22 uses **five distinct human users**. For every agreed task, **at least four of five must succeed**, with **no critical error** and **zero unauthorized disclosure**. Simulated roles, agents, or repeated sessions do not count as distinct people. Evidence records task, participant identity/pseudonym, role, device/browser, result, error severity, disclosure outcome, consent, timestamp, remediation, and retest. Any critical error or unauthorized disclosure fails the gate regardless of success count.

Until 30.14 has explicit human acceptance and canonical reconciliation evidence, the only truthful state is: **PROPOSED / BLOCKED — NOT READY FOR DEV UNTIL CONTRACT ACCEPTED.**
