---
title: "Epic 31 — Governed Intelligence and Connected Clients"
type: epic-plan
epic: 31
status: proposed
registration_status: unregistered
owner: Brooks
story_count: 8
implementation_readiness: blocked
---

# Epic 31 — Governed Intelligence and Connected Clients

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model (GitHub Copilot).
> Content has not yet been fully reviewed — this is a working design reference, not a final specification.
> AI-generated content may contain inaccuracies or omissions.
> When in doubt, defer to the source code, JSON schemas, and team consensus.

## Planning status

**Proposed, unregistered, blocked, and not ready for development.**

This draft does not register Epic 31, change sprint status, supersede any plan or memory, approve an architecture, authorize implementation, or claim that a dependency is complete. Human review and canonical-document reconciliation are prerequisites.

## User clarification — 2026-10-15

Allura supports bring-your-own-key and bring-your-own-agent through explicitly supported integrations. **Hermes is Sabir's personal agent for the first test, not a product default, mandatory runtime or universal account setting.** Other users choose their own supported agents/providers. An unconfigured workspace must show no connected agent, not silently select Hermes or a system-funded provider. A key does not grant Allura permissions, and arbitrary agent compatibility is not promised.

Trace the [dashboard concept revision](./epic-30-governed-digital-brain-workspace.md#dashboard-concept-revision--2026-10-15), especially E31-D01 and E31-D02, into 31.1/31.3/31.4/31.5/31.8 before implementation. Chat must expose useful action/result status, stop/retry, scoped context, health, and usage with unavailable/estimated values labeled. Activity is an auditable action summary, not hidden model reasoning. Persisted chat history and export still require their separately reviewed data contracts.

Connection testing uses synthetic input and disclosed cost/egress under approved policy. Test supported-agent replacement without changing Allura data authority; test disconnect, revocation, cancellation, timeout and pending/unknown outcomes. Disabling an optional agent integration leaves non-agent dashboard work usable. Retry and rollback must not silently repeat external effects or switch provider/payer. No connection, key entry, model API call or live-data transmission is authorized by this document update.

## Intended outcome

Epic 31 proposes modular, provider-neutral intelligence for the Allura workspace:

- an authorized read-only Ask service;
- a warm, accessible chat plugin;
- a governed Connections dashboard for bring-your-own-key (BYOK), provider/model choice, and bring-your-own-agent (BYOA);
- governed actions that do not depend on any particular model, provider, gateway, or agent;
- in-app notifications followed by separately gated browser push; and
- release evidence proving security, usability, accessibility, portability, and performance.

The epic consumes approved Epic 30 contracts for the plugin shell, client packs, authorized knowledge reads, GraphSnapshot/evidence paths, visual system, and provenance. It may consume verified Epic 29 server foundations for persistent paired-device proof. Neither dependency may be inferred from an epic label or an old planning claim.

## Dependency boundary

### Epic 30

Epic 31 cannot move to ready-for-development until Epic 30 has accepted, versioned contracts for:

- plugin manifests, lifecycle, isolation, client-pack customization, and degraded states;
- current server-owned tenant/workspace/principal authorization;
- authorized read/search/relationship disclosure and provenance;
- the shared Allura visual and accessibility contract; and
- audit, idempotency, receipt, revocation, and rollback behavior.

### Epic 29 and B1/B2

Epic 29 is a dependency only where Epic 31 uses paired-device identity. Its evidence gates remain distinct:

- **B1 — dedicated Clerk test instance:** required to prove the real browser-to-device enrollment and approval path. A skipped or fixture-only test is not acceptance.
- **B2 — desktop client repository and supported secure-store adapters:** required to prove private-key persistence and proof-of-possession behavior on each claimed platform. Server tests alone do not satisfy this gate.

Epic 31 may design agent-adapter protocol fixtures without B1/B2. It may not claim real paired-device agent identity, reconnect, revocation, or platform acceptance until the relevant Epic 29 server behavior and B1/B2 evidence have been freshly verified. Browser chat that uses the ordinary authenticated web session must not be falsely made dependent on device pairing.

## Component boundaries

```text
Caller
  -> AskChatService
       -> Authorization/Retrieval/Provenance services
       -> ModelPort (generation and streaming only)
            -> ProviderConnectionPort -> server-held SecretRef

Optional external agent
  -> AgentAdapter (verified connection and bounded delegation only)
       -> AskChatService or ActionProposalService through normal contracts

Governed action
  -> ActionProposalService -> ApprovalService -> ActionExecutor

Notification event
  -> NotificationService -> NotificationDeliveryPort
```

Hard boundaries:

- `ModelPort` performs model generation and streaming only. It does not retrieve data, decide authorization, execute tools, approve actions, manage provider secrets, transport agent messages, manage conversations, or deliver notifications.
- `AskChatService` owns request orchestration, authorized retrieval, evidence assembly, provider invocation, response validation, and citation projection.
- `ProviderConnectionPort` resolves a policy-approved provider/model connection from a server-held secret reference. A provider key authenticates to that provider only; it never grants Allura tenant, workspace, source, tool, or action authority.
- `AgentAdapter` owns optional protocol negotiation, challenge/response, capability declaration, session transport, and disconnect/reconnect signals. It grants no product capability and is not required for actions.
- `ActionProposalService` creates normalized, previewable proposals. `ActionExecutor` executes an already-approved proposal with least privilege. Neither is embedded in `ModelPort` or an agent adapter.
- `NotificationService` owns subscriptions, consent, policy, deduplication, and queue state. `NotificationDeliveryPort` only attempts delivery through a channel adapter.
- Plugins and client packs may narrow or hide features. They may not alter identity, tenant isolation, policy, provenance, approval, audit, idempotency, or receipt rules.

## Trust-envelope separation

Caller input, verified execution state, and outcome evidence are different objects. They must never be collapsed into one request envelope.

### Caller request

The caller may supply intent and presentation inputs only:

```ts
interface CallerRequest {
  requestId: string;
  workspaceSelector?: string;
  conversationId?: string;
  userText: string;
  presentation?: {
    locale?: string;
    responseStyle?: "brief" | "standard";
  };
  idempotencyKey?: string; // required only for a state-changing proposal/command
}
```

The request must not carry derived roles, capabilities, policy results, source provenance, trusted principal identity, trusted device identity, approval status, execution status, or a receipt identifier. Selectors are never authority.

### Server-only verified execution context

The server constructs this context after authentication and current-state checks. It is never accepted from the caller or model:

```ts
interface VerifiedExecutionContext {
  groupId: string;
  workspaceId: string;
  principalId: string;
  sessionId: string;
  pairedDeviceId?: string;
  delegationId?: string;
  effectiveCapabilities: readonly string[];
  policyVersion: string;
  authorizationDecisionId: string;
  correlationId: string;
  sourceScope: readonly string[];
  verifiedAt: string;
  expiresAt: string;
}
```

`effectiveCapabilities`, policy, authority, and source scope are derived server-side as the intersection of current identity, membership, resource policy, explicit denials, workspace lock, plugin policy, delegation, device state where applicable, and action/tool policy.

### Immutable result receipt

The server creates the receipt after a decision or effect. Callers cannot choose its identifier or authoritative fields:

```ts
interface ResultReceipt {
  receiptId: string;
  correlationId: string;
  requestDigest: string;
  actorPrincipalId: string;
  groupId: string;
  workspaceId: string;
  decision: "allowed" | "denied" | "cancelled" | "failed" | "succeeded" | "pending_unknown";
  policyVersion: string;
  effectType: string;
  targetDigest?: string;
  idempotencyKey?: string;
  createdAt: string;
  safeReasonCode?: string;
}
```

Receipts are append-only evidence. They contain safe identifiers and digests, not secrets, model prompts, protected notification bodies, or unauthorized source content.

## Minimal interfaces

These are planning-level boundaries, not accepted code schemas:

```ts
interface ModelPort {
  generate(input: ModelGenerationInput, signal: AbortSignal): Promise<ModelGenerationResult>;
  stream(input: ModelGenerationInput, signal: AbortSignal): AsyncIterable<ModelStreamEvent>;
  capabilities(): Promise<ModelAdapterCapabilities>;
  health(): Promise<AdapterHealth>;
}

interface ProviderConnectionPort {
  list(context: VerifiedExecutionContext): Promise<ProviderConnectionSummary[]>;
  test(connectionId: string, context: VerifiedExecutionContext): Promise<ConnectionHealth>;
  resolve(connectionId: string, context: VerifiedExecutionContext): Promise<ResolvedProviderConnection>;
  revoke(connectionId: string, context: VerifiedExecutionContext): Promise<ResultReceipt>;
}

interface AskChatService {
  ask(request: CallerRequest, context: VerifiedExecutionContext): Promise<AskResult>;
  stream(request: CallerRequest, context: VerifiedExecutionContext, signal: AbortSignal): AsyncIterable<AskEvent>;
}

interface AgentAdapter {
  challenge(input: AgentHello): Promise<AgentChallenge>;
  verify(input: AgentProof, context: VerifiedExecutionContext): Promise<AgentSessionHandle>;
  capabilities(session: AgentSessionHandle): Promise<DeclaredAgentCapabilities>;
  receive(session: AgentSessionHandle, signal: AbortSignal): AsyncIterable<AgentMessage>;
  send(session: AgentSessionHandle, message: AgentMessage): Promise<TransportResult>;
  disconnect(session: AgentSessionHandle, reason: string): Promise<void>;
}

interface ActionProposalService {
  propose(intent: ActionIntent, context: VerifiedExecutionContext): Promise<ActionProposal>;
  validate(proposalId: string, context: VerifiedExecutionContext): Promise<ActionValidation>;
}

interface ActionExecutor {
  execute(approved: ApprovedAction, context: VerifiedExecutionContext): Promise<ResultReceipt>;
  reconcile(idempotencyKey: string, context: VerifiedExecutionContext): Promise<ResultReceipt | null>;
}

interface NotificationDeliveryPort {
  deliver(message: MinimalNotificationPayload, endpoint: VerifiedEndpoint): Promise<DeliveryAttempt>;
  health(): Promise<AdapterHealth>;
}
```

Model input is assembled by the server from already-authorized evidence. A model adapter never receives unrestricted database handles, approval credentials, action executors, notification credentials, or mutable policy objects.

## Story map

| Story | Outcome | Dependencies | Status |
| --- | --- | --- | --- |
| **31.1 Provider-neutral `ModelPort`, direct-provider baseline, and narrow framework spike** | Define generation/streaming-only `ModelPort`; implement or prototype a minimal direct-provider baseline; benchmark only qualifying frameworks against the same fixtures and constraints; record a proposed reversible decision. | Accepted Epic 30 authorization/provenance/plugin contracts; provider-governance approval for any governed-data call | proposed / blocked |
| **31.2 Read-only Ask service and API** | Build authorized retrieval, evidence assembly, generation, response validation, citation projection, cancellation, refusal, and revocation behavior without tools or state changes. | 31.1; Epic 30 authorized read/search/evidence contracts | proposed / blocked |
| **31.3 Chat plugin and accessible UI** | Deliver a warm modular chat surface with citations, evidence inspection, stop/retry, transparent scope/provider state, and honest degraded states. | 31.2; approved Epic 30 design hash and plugin shell | proposed / blocked |
| **31.4 Connections dashboard: BYOK, provider choice, and BYOA** | Add governed create/test/list/label/disable/rotate/revoke flows for provider credentials and replaceable agent adapters, using server-held secret references, policy allowlists, verified handshakes, bounded delegation, capability intersection, health, audit, and receipts. | 31.1 interface boundaries; approved secret store and provider policy; verified Epic 29 capability only where device proof is claimed | proposed / blocked |
| **31.5 Governed actions independent of provider or agent** | Add proposal, preview, action-specific approval, least-privilege execution, idempotent reconciliation, revocation, and immutable receipts through ordinary service interfaces usable by web chat or an approved agent adapter. | 31.2; approved action taxonomy/policy; no dependency on 31.4 | proposed / blocked |
| **31.6 In-app notification foundation** | Add consented in-app subscriptions, preference controls, quiet hours, minimal payloads, deduplication, receipts, revocation, and accessible notification UI. | Epic 30 plugin shell; 31.3; 31.5 only for action-result topics | proposed / blocked |
| **31.7 Separately gated browser push** | Add service-worker and push-delivery adapters only after browser security, key management, privacy, payload, consent, endpoint lifecycle, and revocation gates pass. | 31.6; separate browser-push approval; Epic 29 only where a paired-device correlation is claimed | proposed / blocked |
| **31.8 Intelligence release, security, accessibility, performance, and human-validation gate** | Prove provider portability, BYOK secret safety, agent-adapter isolation, injection resistance, action integrity, optional device behavior, notification consent, visual quality, accessibility, performance, rollback, controlled-red CI, and required human validation. | 31.1–31.7 | proposed / blocked |

## Story contracts

### 31.1 — `ModelPort` and measured selection

Start with a minimal direct-provider baseline. It defines the behavior and cost of the smallest viable adapter before adding a framework.

A framework enters the benchmark only if it can:

- stay behind `ModelPort` without owning retrieval, authorization, secrets, tools, actions, chat persistence, agent transport, or notifications;
- support cancellation, bounded streaming, structured result validation, usage reporting, deterministic test doubles, observability hooks, and provider replacement;
- meet approved license, dependency, maintenance, data-retention, residency, secret, and supply-chain constraints; and
- pass the same frozen synthetic fixtures and threat cases as the direct baseline.

LangChain is an optional candidate, not a commitment. Vercel AI SDK, NanoClaw, or another candidate is considered only if it first meets the entry constraints. The spike measures dependency size, cold start, latency, memory, streaming/cancellation, structured output, error mapping, testability, maintenance burden, token/cost reporting, and rollback. Human approval of a documented architectural decision is required before production selection.

### 31.2 — Read-only Ask

`AskChatService` authenticates the request, constructs `VerifiedExecutionContext`, authorizes candidates before ranking where possible, re-authorizes every disclosed source and relationship, builds bounded model input, validates the generated response, and projects only authorized citations.

Read-only Ask cannot invoke tools, submit or approve actions, change permissions, write memory, send messages, or register notification endpoints. Required outcomes include cited answer, insufficient-evidence refusal, denial without existence leakage, provider unavailable, policy unavailable, stale-source warning, user cancellation, and revocation during stream.

### 31.3 — Chat plugin

Chat is an Epic 30 plugin, not a privileged shortcut. It shows active workspace, answer scope, citations, provenance, freshness, uncertainty, streaming/cancel state, provider health at the approved disclosure level, and plain-language denied/degraded states. Conversation retention, deletion, export, summarization, durable memory, and cross-device sync remain out of scope until separate data contracts are approved.

### 31.4 — Connections dashboard: BYOK, provider choice, and BYOA

The dashboard gives an authorized user one clear **Connections** surface to add a supported provider credential, choose an allowed provider/model, test health with an explicitly disclosed minimal-cost request, label the connection, inspect safe metadata, disable it, rotate it, or revoke it. It also permits an authorized user to register a supported external agent through a versioned `AgentAdapter` contract. Hermes is not a product dependency or default.

Raw credentials are accepted only by a protected server endpoint and are never returned after submission, placed in client packs, browser storage, URLs, analytics, prompts, logs, events, receipts, or ordinary database columns. The durable record stores an opaque `SecretRef`, provider kind, owner/scope, safe fingerprint or last-four marker, creation/rotation timestamps, status, policy metadata, and audit references. Secret material resides in an approved encrypted secret store or external vault. Test, use, rotation, and revocation re-authorize current principal and workspace state. Removing a connection clears derived caches and makes subsequent use fail closed.

Provider authentication and Allura authorization remain separate. A valid OpenAI, Anthropic, Google, gateway, or other supported credential proves only that the provider accepted that credential. It never grants tenant/workspace membership, source access, tool rights, approval authority, or standing delegation. Provider/model allowlists, budget limits, data retention/training posture, residency, routing, and fallback behavior are explicit. Allura must not silently fall back to a system-funded or differently governed provider when a BYOK connection fails.

BYOA uses a replaceable, versioned agent adapter with protocol negotiation, nonce/audience/expiry/replay protection, verified identity, current workspace membership, optional paired-device proof, explicit expiring delegation, declared capabilities, server-side capability intersection, health, disconnect, and receipts. A successful connection or device proof establishes only the verified facts named in the receipt; it does not establish notification consent, source access, action approval, or standing write authority. Failed proof never downgrades to an anonymous or weaker bearer session.

### 31.5 — Governed actions

Actions are available through approved product services regardless of provider, gateway, or external agent. The assistant may suggest an action, but the server creates the normalized proposal and payload digest. Preview, approval, and execution are separate decisions.

Approval identifies authenticated actor, action type, target tenant/workspace/resource, exact payload digest, intended effect, capability, policy version, expiry, and one-time-use boundary. Broad phrases are not credentials. Retries use the original idempotency key. An ambiguous result becomes `pending_unknown` and is reconciled against the original target; it is never rerouted or blindly repeated.

### 31.6 — In-app notifications

In-app notification is the foundation. Each subscription records current principal, tenant/workspace, topic classes, consent version, preferences, quiet hours, and revocation state. Delivery re-authorizes the target before display. Membership removal, workspace lock, plugin disablement, delegation revocation, and subscription removal stop future delivery within the approved bound.

### 31.7 — Browser push

Browser push is a separate slice with separate human approval. Browser permission is necessary but insufficient: Allura subscription consent and current server authority are also required. Payloads are privacy-minimized and must not expose protected content on a lock screen. Opening a notification performs a fresh application authorization before content is displayed.

Endpoint rotation, browser data clearing, unsubscribe, device loss/revocation where correlated, membership removal, workspace lock, client/plugin disablement, expiration, retry, deduplication, and dead-letter redaction require evidence. Push keys, service-worker scope, CSP, endpoint storage, and provider terms require focused security review.

### 31.8 — Final gate

This story owns the integrated product-release recommendation only if the accepted canonical plan assigns Epic 31 that responsibility. If it does, human validation is exact:

- five distinct real human users participate;
- at least four users successfully complete each required task;
- no critical error occurs; and
- zero unauthorized disclosure occurs.

Simulated roles, agents, scripted browsers, duplicate people, or developer self-runs do not count as the five humans. Missing human, provider, browser, database, device, or platform evidence is `not proven`, not a pass. If product release is owned elsewhere, 31.8 produces the Epic 31 evidence packet for that later release gate and makes no release claim.

## State machines and failure semantics

### Ask request

```text
RECEIVED -> CONTEXT_VERIFIED -> RETRIEVING -> GENERATING -> VALIDATING -> STREAMING -> COMPLETED
     |             |                |             |             |            |
     +-----------> DENIED | REFUSED | CANCELLED | REVOKED | DEGRADED | FAILED
```

- Missing, stale, conflicting, or unavailable authority/policy fails closed before disclosure.
- Provider failure may return authorized citation-only degradation when policy permits; it never invents an answer.
- Cancellation stops provider work and downstream output as promptly as supported.
- Revocation stops future chunks, invalidates affected cursors/caches, and emits safe outcome evidence.

### External-agent session

```text
DISCONNECTED -> CHALLENGED -> PROOF_VERIFIED -> CONTEXT_VERIFIED -> CONNECTED
      |              |               |                  |              |
      +------------> DENIED | EXPIRED | REPLAYED | REVOKED | DEGRADED
CONNECTED -> EXPIRED | REVOKED | DISCONNECTED
```

Every reconnect re-resolves server authority. Cached roles and negotiated capabilities are not grants.

### Governed action

```text
DRAFT -> VALIDATED -> AWAITING_APPROVAL -> APPROVED -> EXECUTING -> SUCCEEDED
  |         |                |              |            |-> FAILED_WITH_RECEIPT
  |         |                |              |            |-> PENDING_UNKNOWN
  |         |                |              |-> EXPIRED | REVOKED
  |         |                |-> REJECTED | EXPIRED
  |         |-> DENIED
  |-> CANCELLED
```

Only the approved proposal digest executes. Audit/receipt persistence failure blocks a protected effect. `PENDING_UNKNOWN` permits receipt lookup and same-key reconciliation only.

### Notification subscription and delivery

```text
UNSUBSCRIBED -> CONSENT_PENDING -> ACTIVE -> PAUSED | REVOKED | EXPIRED
ACTIVE -> ROTATING_ENDPOINT -> ACTIVE

QUEUED -> REAUTHORIZED -> SENDING -> DELIVERED
   |          |             |-> RETRY_WAIT -> SENDING
   |          |             |-> EXPIRED | DEAD_LETTERED
   |          |-> SUPPRESSED | REVOKED
   |-> CANCELLED
```

Suppression is a successful privacy outcome. Delivery receipts contain safe metadata and reason codes, never protected bodies.

## Failure matrix

| Failure | Required behavior |
| --- | --- |
| Provider unavailable, rate-limited, or timed out | Bounded safe retry; honest degradation; no silent provider switch that changes retention, residency, or policy. |
| Invalid, unsupported, or malicious model output | Reject or refuse; never manufacture citations or treat model text as authority. |
| Prompt/retrieved content asks for permissions, tools, or secrets | Treat as untrusted data; server context and policy remain authoritative. |
| Membership, lock, policy, delegation, source access, or device state changes mid-operation | Stop affected disclosure/effect/delivery, invalidate affected state, and create safe evidence. |
| Agent adapter protocol/version/audience/nonce/proof mismatch | Deny without protected topology disclosure; never downgrade security. |
| Provider key is invalid, exposed, over budget, disallowed, or revoked | Do not reveal the secret; disable or fail the connection safely, preserve a redacted receipt, and never substitute a differently governed credential without explicit policy and user choice. |
| Approval is altered, expired, replayed, or targets another resource | Deny execution and issue a safe receipt. |
| Action result is ambiguous | Record `pending_unknown`; reconcile with same idempotency key and exact target. |
| Notification endpoint is invalid or revoked | Stop delivery, mark endpoint state, redact dead-letter data, and require fresh consent where appropriate. |
| Plugin or adapter crashes | Isolate failure, preserve workspace shell and other plugins, cancel bounded work, and clear protected transient state. |
| Audit/receipt store unavailable | Fail closed before any protected or external effect. Read-only behavior follows its separately approved degraded policy. |

## Plugin and client extension rules

Each Epic 31 plugin declares a stable identifier, version, compatibility range, routes/UI slots, configuration schema, events, required capabilities, protected-action classes, provider dependencies, retention behavior, health, degraded states, migration, disable/uninstall cleanup, and rollback behavior.

Client packs may customize approved brand tokens, navigation, terminology, prompt starters, enabled plugins, entity labels, and notification topic labels. They cannot increase authority or replace core authorization, provenance, approval, audit, idempotency, receipt, revocation, or privacy rules. A failed optional plugin must not take down the core workspace.

## Non-goals

- No autonomous background agent, self-approval, standing write authority, or silent tool execution.
- No governed-core commitment to LangChain, Vercel AI SDK, NanoClaw, any named agent, a model vendor, gateway, or hosted vector service.
- No model- or agent-owned retrieval, policy, capability derivation, action execution, approval, secret storage, or notification delivery.
- No unrestricted browsing, arbitrary connector, code/shell execution, money movement, contract execution, production release, regulated decision, or cross-workspace transfer.
- No Xterra access or fallback tenant, and no organization-wide content access.
- No email, SMS, native-mobile push, or marketing campaign in this epic.
- No durable conversation memory, provider training/retention of governed content, or cross-client transcript sync without separate approved contracts.
- No claim that Epic 29, Epic 30, or B1/B2 evidence is complete merely because this plan references it.

## Approval and readiness gates

| Gate | Required before |
| --- | --- |
| Accepted Epic 30 plugin, client-pack, authorization, provenance, evidence, visual, and revocation contracts | Story files or implementation for 31.1–31.7 |
| Canonical six-document reconciliation with requirement IDs, interfaces, states, fields, decisions, and risks | Any story becomes ready-for-development |
| Direct-provider baseline and reproducible benchmark protocol approved | Framework candidate evaluation |
| Human-approved architectural decision and rollback plan | Production adapter selection |
| Provider data-use, retention, training, residency, secret, and budget policy | Any governed-data provider request |
| Approved secret-store design, provider/model allowlists, budgets, retention/residency policy, redaction rules, and fallback policy | Persistent BYOK activation |
| Approved versioned agent-adapter protocol and capability envelope | BYOA activation |
| Verified Epic 29 server capability plus B1/B2 evidence for each claimed path/platform | Paired-device agent acceptance |
| Approved action taxonomy and exact approval envelope | 31.5 implementation |
| Approved in-app consent, topic, retention, privacy, retry, and revocation policy | 31.6 implementation |
| Separately approved push keys, service-worker scope, payload, endpoint, privacy, and browser-security design | 31.7 implementation |
| Exact design hash and variance process | 31.3, 31.6, and 31.7 visual acceptance |
| Independent security, accessibility, performance, visual, and reality-check review | 31.8 recommendation |

## Acceptance evidence

1. The selected `ModelPort` adapter and direct-provider baseline pass the same conformance suite without changes to Ask, action, agent-adapter, or notification services.
2. Authorization tests cover tenant, workspace, private, department, relationship, citation, count, timing, cache, cursor, revocation, and existence-leakage boundaries.
3. Prompt-injection, indirect-injection, forged-citation, confused-deputy, approval-substitution, replay, and malicious-output tests fail safely.
4. Read-only Ask cannot invoke tools, mutate state, submit/approve an action, register an endpoint, or widen scope.
5. Every action has preview, exact approval, payload digest, least-privilege execution, idempotency proof, immutable receipt, ambiguous-result reconciliation, and rollback/compensation statement.
6. BYOK tests prove raw keys never appear in client storage, responses, logs, analytics, prompts, events, receipts, or ordinary database rows; create/test/use/rotate/disable/revoke enforce current scope, policy, budget, retention/residency, and explicit no-silent-fallback behavior. BYOA tests cover wrong tenant, workspace, audience, principal, device, delegation, capability, protocol version, nonce, expiry, replay, revocation, disconnect, and reconnect.
7. Notification tests cover consent, minimal payloads, quiet hours, deduplication, expiry, endpoint rotation/removal, plugin disablement, membership removal, workspace lock, delegation revocation, device loss where applicable, and receipt/dead-letter redaction.
8. Interfaces pass keyboard, focus, screen-reader, contrast, reduced-motion, 320px, 200%-zoom, slow-network, offline, denied, stale, revoked, and degraded-state review.
9. Frozen synthetic fixtures prove approved budgets for first useful response, cancellation, stream stability, queue latency, and bounded CPU/memory/token use.
10. Restricted-role PostgreSQL tests, supported-browser tests, real device/client evidence where claimed, exact frozen-SHA CI, rollback proof, and a merge-blocked controlled-red privacy regression pass.
11. Plugin disable/removal and provider/framework rollback do not strand secrets, subscriptions, delegations, pending actions, or protected caches.
12. If assigned product-release ownership, 31.8 records five distinct humans, at least four successes per required task, no critical error, and zero unauthorized disclosure.

## Planning checklist

Epic 31 remains blocked until:

- [ ] Epic 30 contracts listed above are accepted and versioned.
- [ ] Consumed Epic 29 server behavior is freshly verified and B1/B2 evidence is available for every claimed device/platform path.
- [ ] Canonical six-document requirements, architecture, design, data dictionary, risk/decision, and traceability changes are human reviewed.
- [ ] The direct-provider baseline, qualifying-candidate rules, fixtures, benchmark, and human selection gate are accepted.
- [ ] Provider governance, BYOK lifecycle, secret-store, redaction, budget, data-use, and no-silent-fallback policies are accepted.
- [ ] BYOA adapter protocol and optional device/delegation boundaries are accepted.
- [ ] Action taxonomy, approval envelope, idempotency, receipt, rollback, and compensation rules are accepted.
- [ ] In-app and browser-push consent/privacy/security contracts are approved separately.
- [ ] Exact design references, accessibility targets, performance budgets, controlled-red cases, evidence owners, and human-test protocol are recorded.
- [ ] Epic registration and sprint-status changes are performed only through the sanctioned planning workflow after approval.

## Proposed sequence

`31.1 → 31.2 → 31.3 → 31.5 → 31.6 → 31.7 → 31.8`

31.4 may conduct connection and protocol-fixture work after the 31.1 boundaries are stable. It does not block 31.5. Browser push never begins as an implicit continuation of in-app notification work; it crosses its own approval gate. One writer owns each shared contract at a time, with independent specialist review and no status promotion from generated code, mocks, or simulated evidence alone.
