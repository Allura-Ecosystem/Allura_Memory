# Story 25.4a — Governed Assistant API, SDK, and Connector Harness

**Status:** Planned / dependency-blocked
**Owner:** Troy + Brooks + Bellard
**Depends on:** 25.2a workspace/evidence/retrieval foundation; 25.2 authenticated read contract; 25.4 evidence-first queue; 24.5 deterministic scenario harness
**Blocks:** Assistant claims in 25.6 demo/evidence gate

## Outcome

Make `/dashboard/curator` an AI operations surface through a server-owned assistant that explains governed workspace context, proposals, evidence, traces, and allowed next actions. The assistant uses the same typed API/SDK/CLI contracts as external agents; it is not a browser-side chatbot or a second authority plane.

## Product Boundary

```text
Dashboard assistant / external agent SDK / MCP / CLI
  → GovernedAssistant service
  → relational-first RetrievalPlan
  → optional SemanticProjection expansion
  → answer + evidence + allowed actions + degraded state
```

The first assistant capability is read-only. It may explain scope, summarize evidence, answer "what changed?", and link to governed traces/receipts. It may not make a decision, write memory, call an external connector, or claim a result without the normal policy/action path.

## Acceptance Criteria

- [ ] Define typed `AssistantQuery`, `AssistantAnswer`, `AssistantCitation`, and `AssistantAction` contracts. Every answer returns the same server-owned `RetrievalPlan`, authorized evidence references, freshness/degraded state, and declarative allowed actions used by the selected map/detail view.
- [ ] The first user interaction is one selected-item prompt, `Ask about this item`. It returns either cited facts with a plain state label or `I can’t verify that yet` with inspectable known sources; it does not become a free-form workbench.
- [ ] Expose a server-owned API surface with authenticated tenant/workspace derivation. The browser sends intent and receives a typed response; it never sends authority scope or direct SQL/vector queries.
- [ ] Extend the existing `@allura/sdk` with a typed `client.assistant.query()` read operation after the API contract is stable. Add corresponding MCP and CLI read commands only after parity tests exist.
- [ ] Add a connector adapter contract: declared capability, connector identity/version, requested scopes, allowed operations, audit event, evidence output, idempotency behavior, retry classification, and rollback/disable path.
- [ ] Connector actions are deny-by-default. Each external write requires server-derived policy permission, a human rationale where governed, an append-only audit event, and a truthful receipt/outbox state.
- [ ] Implement no vendor SDK in the Allura authority core. Supabase is optional external/deployment interoperability, not Allura's canonical store or authority provider. Composio and LangChain are optional connector/framework adapters, not policy bypasses.
- [ ] First connector proof is one narrow, read-only integration with deterministic fixture/harness coverage; no broad marketplace or OAuth/key UI ships in this story.
- [ ] Scenario tests cover authorized read, forbidden/cross-tenant denial, stale/degraded retrieval, connector timeout, connector schema drift, denied external write, idempotent retry, and receipt/audit continuity.

## Explicit Exclusions

- No generic chat workbench or free-form autonomous assistant.
- No browser-held provider keys, connector tokens, or direct external writes.
- No vendor-specific claims before a tested adapter exists.
- No Supabase replacement for PostgreSQL/RLS/Allura governed authority.
- No Composio action catalog exposed without a policy manifest and harness.
- No LangChain dependency in the core retrieval/authority path; only a later interoperability adapter if a verified use case requires it.

## Evidence

```text
docs/archive/allura/evidence/epic-25/25.4a/
```

Include typed contract snapshots, API/SDK/MCP/CLI parity tests, connector capability manifest, deterministic harness traces, authorization/denial cases, and rollback proof.
