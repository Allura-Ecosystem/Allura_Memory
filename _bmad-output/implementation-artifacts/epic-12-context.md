# Epic 12 Context: Durable governed run kernel

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Provide a durable, scoped evidence-handoff run outside Brain. An operator must be able to pin a local artifact and definition, measure its integrity, stop for independent human review, and resume after losing the original process without duplicating committed effects. Local adoption covers the existing Epic 12, not release acceptance or a general methodology executor. Current all-14 authority supersedes the historical deferred heading. No live work status is inferred from this context or its associated specifications.

## Stories

- Story 12.1: Concrete use case, immutable run provenance and detailed contracts
- Story 12.2: Durable runs, journals, measured gates and approval continuation
- Story 12.3: Crash, replay, cancellation, drift, inspection and recovery evidence

## Requirements & Constraints

A run records what was admitted and what actually happened; pending, failed, partial and unknown cannot become success merely because HTTP returned successfully. Supplied artifact prose remains an unverified claim even when its bytes match an expected digest. Every new effect and disclosure requires current authenticated tenant/workspace/action authority. Stored approval is evidence, not a substitute for current reviewer authority.

Only a current human workspace administrator may own the initial run. Its designated reviewer must be a different current bound human administrator with audit-read access in that workspace. Machine, device, delegated client, org-only title and curator promotion authority confer no run permission. Preserve current identity issuance and client ceilings. Run approval never promotes semantic memory, updates work items, or changes operational status.

Definitions, inputs, original receipts and journal evidence are immutable. Runtime projections are separate guarded state. Same-key identical requests reconcile to their original admission; changed input conflicts without mutation. Ambiguous acknowledgements remain unknown until the same authoritative database establishes the receipt or confirmed absence. Never issue a fresh key automatically to hide ambiguity.

The initial definition is fixed, linear and data-only: prepare an artifact integrity receipt, wait for exact independent review, then append a local handoff receipt. Caller policy, executable handlers, outcome assertions and definition uploads are forbidden. No shell, network adapter, agent dispatch, service daemon, parallel DAG or external exactly-once guarantee is included.

Finite bounds apply to artifact bytes, goal/rationale size, retained runs, nonterminal runs, definition revisions, journal events, attempts, leases and operation duration. Saturation denies; immutable evidence is not deleted to make room. Private artifact, goal, rationale, identity bindings and lease tokens must not leak through operational logs or content-free projections.

## Technical Decisions

Use the existing Bun/TypeScript/PostgreSQL architecture and one authenticated gateway. Services own short scoped transactions. Normalized PostgreSQL JSON text determines definition, policy, input and command digests; raw UTF-8 bytes determine artifact hashes. Pin handler source identity without accepting a caller-provided executable registry. Definition changes under an existing revision conflict rather than silently upgrade existing runs.

Restricted runtime SQL requires forced row-level security, fixed-search-path guarded functions, explicit human/current-scope predicates, scoped composite foreign keys and immutable-table mutation/truncate guards. Public and application privileges are narrow; private participant/input rows are not general SELECT surfaces. Database context remains a trusted-server assertion, not cryptographic protection against stolen database credentials.

Current owner/reviewer bindings and grants are locked and revalidated before operation replay or effects. Locks cannot span a human pause or executor lifetime. Operation receipts remain separate from fresh inspection. Local effect identity belongs to run/step/effect slot, not attempt or lease. Fences prevent a stale executor from committing after cancellation or replacement.

## UX & Interaction Patterns

The initial implementation needs authenticated API evidence, not a new UI. Future inspection must preserve exact provenance, no-store disclosure and distinct denied, stale, unavailable, partial and unknown states. No board or desktop design decision is reopened by run work.

## Cross-Story Dependencies

Story 12.1 supplies the adopted detailed durable-runs-v1 contract. Current authority and persistence contracts from Epics 1–2 remain binding; existing memory/client behavior from Epics 3–11 must be preserved. Story 12.2 can be built in bounded vertical increments; start admission alone does not prove measured preparation, approval, continuation or Story 12.3 recovery.

Allura PostgreSQL is the sole writable operational-status owner; Notion remains planning only. Story 13.1 still owns precise work-item transactions/conflicts. Epic 14 is Linux-first, remote-connected to the existing server; secure connection/update/platform evidence stays separate. No tunnel or infrastructure work is required. Brain/status is unavailable and not retried under current authority; local test evidence is not remote governance, release or live status.
