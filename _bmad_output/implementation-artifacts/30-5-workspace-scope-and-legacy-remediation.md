> Reconciliation note (2026-09-17): the bounded candidate and interrupted repairs were integrated into canonical `main`. Earlier test/demo statements remain historical unless repeated in the current readiness record. Integration does not grant story acceptance.

# Story 30.5 — Workspace Scope and Legacy Remediation

**Epic:** 30 — Governed Digital Brain Workspace  
**Status:** backlog  
**Owner:** Woz / Knuth  
**Planning authority:** [Epic 30](../planning-artifacts/epic-30-governed-digital-brain-workspace.md)  
**Requirement:** E30-R05  
**Dependencies:** 30.4

## User Story
As a tenant member, I want server-owned workspace scope so that forged selectors and unclear legacy records cannot cross boundaries.

## Acceptance Criteria
- Tenant, workspace, principal and delegation are server-derived on every protected path; runs carry verified workspace identity.
- Remove permissive client-selected scope and anonymous/hard-coded authority fallbacks without inventing upstream dependencies.
- Quarantine unclear ownership/visibility records; never automatically classify them or widen derived data.
- Membership/session/delegation revocation blocks future reads and runs according to 30.3, including pooled-connection reuse.

## Required Evidence / Definition of Done
Forged ID/header/query/body/local-state tests, missing scope and pool-leak tests, quarantine/rollback proof, independent review and epic CI/publication/receipt gates. Local synthetic fixtures only.

## Current Preparation State

2026-09-24: the cross-surface inventory found `/api/memory/[id]` trusted query-selected tenant/user identifiers, lacked handler-level role checks, and omitted canonical workspace scope. GET/PUT/DELETE now require viewer/curator/admin respectively, assert tenant equality, bind server-derived workspace/actor/session scope, and ignore forged user, metadata actor, and body scope. Four adversarial tests are in the exact Epic 30 preflight. This repairs a legacy REST boundary; it does not classify legacy data, prove pooled live revocation, or accept Story 30.5.

2026-09-24: `/api/memory/count` and `/api/memory/stats` previously used the legacy owner pool, accepted caller-selected tenant scope, and aggregated without workspace predicates. Both now reject forged tenant/workspace selectors before querying and run workspace-filtered episodic and semantic aggregates through the restricted workspace transaction. Four hermetic tests cover non-disclosing selector denial, scope binding and deduped results. Live RLS/pool-reuse proof and Story 30.5 acceptance remain open.

2026-09-24: `/api/memory/traces` previously read through the owner pool without workspace scope, allowed viewer writes, trusted caller-selected agent/scope fields, and dropped workspace identity before the event insert. Reads now require an authenticated workspace and use a restricted workspace transaction plus explicit predicate. Writes require curator authority, bind tenant/workspace/actor to the verified principal, validate the trace envelope, and insert the workspace discriminator through the restricted application role. Eleven hermetic route/storage assertions are in the exact Epic 30 gate. Live RLS/pool-reuse proof and Story 30.5 acceptance remain open.

2026-09-24: `/api/memory/graph` previously accepted header/query tenant authority, used the owner pool, omitted workspace predicates, queried obsolete edge-column names, and returned raw backend error text. The structural graph, counts, and degraded event fallback now derive tenant/workspace/principal from authentication, use restricted workspace transactions, enforce explicit workspace filters, use `from_id`/`to_id`/`rel_type`, and sanitize failures. Six adversarial hermetic tests cover the boundary. Live RLS/pool-reuse proof and Story 30.5 acceptance remain open.

2026-09-24: `/api/memory/[id]/restore` previously trusted query-selected tenant and audit user and omitted canonical workspace/session scope. Restore now requires administrator authority, binds tenant/workspace/actor/session to the authenticated principal, and rejects forged selectors before the canonical tool call. Five hermetic assertions cover the boundary. Live database proof and Story 30.5 acceptance remain open.

2026-09-22: `/api/brain/memories` and `/api/brain/search` were quarantined after authentication. Their tenant-only/client-selected user filters lacked Epic 30 workspace, visibility and required-receipt proof, so both now return generic 503 envelopes with no content, names or counts and make no Brain call. The non-content health route remains unchanged. The exact hermetic lane passed 112/112 tests and typecheck passed. This is a reversible protected-surface quarantine, not migration/classification of legacy records, a replacement search service, or Story 30.5 acceptance.

2026-09-17: canonical checkout is `main`. The bounded synthetic reader foundation and interrupted repair set are now integrated without the unrelated Epic 29 branch changes. Fresh local evidence is recorded in [current readiness](../planning-artifacts/implementation-readiness-epic-30.md). This story remains backlog: the integrated slice does not implement the full requirement, and no design, authorization-policy, board, live-database, hosted-CI, human-study or release approval is implied. Follow the [consolidated requirements](../planning-artifacts/epic-30-prd.md) and [completed course correction](../planning-artifacts/sprint-change-proposal-2026-09-17.md).

## Historical Evidence — before repository consolidation
No implementation, migration or tests in this increment.
