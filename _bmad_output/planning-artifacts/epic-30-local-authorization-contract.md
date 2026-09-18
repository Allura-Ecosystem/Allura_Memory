> Recovery note (2026-09-17): planning restored into the canonical checkout. Earlier code/demo/test statements describe the separate saved candidate, not this branch. No story readiness or acceptance is granted by recovery. See implementation-readiness-epic-30.md in planning-artifacts for current gates.

# Epic 30 Local Authorization Contract (Provisional v1)

**Status:** provisional implementation contract. Accepted defaults are binding; detailed enforcement and timing targets still require review. Not production authorization approval.
**Applies to:** `/dashboard` My Work reads, future API/MCP/search/link/citation/chat/AI/worker reads, and synthetic PostgreSQL fixtures.  
**Does not authorize:** production data, migrations, writes, exports, messaging, model calls, publication, or admin private-content override.

## 1. Server-verified authority input

Every protected decision receives one server-derived tuple:

```text
principal_id + group_id + workspace_id + session_id + role_ids + policy_epoch
```

Clerk server claims are the production source. Non-production DevAuth is allowed only when Clerk is disabled and the runtime is not production. Request headers, query strings, request bodies, UI selectors, model text, tool arguments, route parameters and cached client state are assertions only; they never create or widen authority.

A resource carries:

```text
group_id + workspace_id + owner_id + visibility + department_id? + source_policy
```

`visibility` is exactly `private` or `department` in this slice. Unknown values and incomplete tuples deny.

## 2. Decision order and reason codes

The evaluator follows this order and returns no protected names, counts, snippets, links or existence hints on denial.

| Order | Condition | Outcome / reason code |
| --- | --- | --- |
| 1 | Principal/session missing or malformed | deny `AUTH_MISSING` |
| 2 | Tenant mismatch | deny `TENANT_MISMATCH` |
| 3 | Workspace missing or mismatched | deny `WORKSPACE_MISMATCH` |
| 4 | Explicit deny or revoked authority | deny `EXPLICIT_DENY` / `AUTHORITY_REVOKED` |
| 5 | Unknown visibility, surface, policy or stale epoch | deny `POLICY_UNKNOWN` / `POLICY_STALE` |
| 6 | Private resource and `owner_id !== principal_id` | deny `OWNER_REQUIRED` |
| 7 | Department resource without a current approved membership | deny `DEPARTMENT_MEMBERSHIP_REQUIRED` |
| 8 | All required predicates are verified | allow `OWNER_PRIVATE_READ` or `DEPARTMENT_READ` |

Roles, including `admin`, authorize administrative actions only. They do not satisfy private ownership or department membership. Owner-private resources are not shareable in this MVP.

## 3. Department, contractor and invitation rules

Ownership, tenant membership, workspace membership, department membership, administrative role, permission and project invitation are separate predicates.

- A department read requires a current, non-revoked membership for the same tenant, workspace, department and principal.
- A contractor cannot read private or department content merely because the contractor is a tenant member.
- Future messaging requires both an approved named contractor role and a current invitation to the exact workspace/project channel. Either predicate missing or revoked denies.
- Dual approval for contractor invitations requires the project owner and the workspace membership administrator; the two approvals must be independent durable records. A department/channel owner is not a substitute for the required project-owner authority.

## 4. Derivative and agent authority

Effective agent authority is the intersection of user authority, explicit delegation, source policy, surface policy and current model/vendor policy. Agents never receive broader access than the invoking principal.

Search candidates are authorized before scoring where practical and reauthorized before disclosure. Links and backlinks require both endpoint decisions plus relationship authority. Citations, summaries, embeddings, counts, snippets, Ask context and generated output retain the strictest source restriction. A derivative with missing source lineage denies. Prompt text and model output cannot alter policy.

Real-content Ask Allura remains unavailable until no-retention/no-training evidence is verified. No placeholder or fabricated answer is permitted.

## 5. Enforcement inventory

| Surface | Mandatory enforcement |
| --- | --- |
| UI page | `requireDashboardScope()` before render; no client authority selector |
| Read service/API | restricted app-role transaction; candidate authorization in SQL; reauthorization before mapping response |
| PostgreSQL | `allura_app` is `NOBYPASSRLS`; `FORCE ROW LEVEL SECURITY`; exact tenant/workspace/principal settings |
| MCP/tool | token-derived tenant/workspace/principal; request scope is equality assertion only |
| Search | authorize before scoring and before returning hit/count/snippet |
| Link/backlink | authorize source, target and relationship before returning either endpoint |
| Chat/messaging | approved role plus current exact-channel invitation; recheck before send/read |
| Ask/AI | source-by-source authorization, verified vendor policy, citation recheck before output |
| Worker/agent | server-issued scope envelope; recheck at each protected read and before side effect/output |
| Cache/cursor/run | scope plus policy epoch binding; stale, missing or mismatched epoch denies |
| Unknown route/tool/surface | deny `POLICY_UNKNOWN`; no fallback to tenant-wide read |

## 6. Revocation and stale-authority bounds

The initial read path has no authorization cache. Membership revocation becomes effective on the next database transaction. Production acceptance targets, which still require live proof, are:

- ordinary reads: next request, never more than 60 seconds after authoritative revocation;
- cursors and cached result envelopes: policy-epoch mismatch denies; maximum age 60 seconds;
- open streams, chat and AI output: recheck before each protected emission and stop within 5 seconds after revocation is observed;
- agent/worker runs: recheck at every protected read and before output or side effect; cancel within 60 seconds;
- session tenant/workspace/role change: old scope denies on the next protected request and within 60 seconds maximum.

A stale, unavailable or conflicting authority source denies. Availability must never fall back to owner credentials, tenant-wide content or cached allow.

## 7. Audit, replay and outage behavior

Protected allow/deny, invitation approval/revocation, policy change, agent delegation, AI disclosure and sensitive side-effect decisions require an append-only receipt containing the scope tuple, resource/policy identifiers, action, reason code, policy version/epoch, actor, timestamp and witness hash. Receipts must not contain raw private content, secrets or model prompts.

A receipt cannot grant authority. Wrong-scope, replayed, duplicate or unverifiable receipts deny. Read-only denials may use bounded non-content operational telemetry, but any surface whose approved contract requires a durable receipt fails closed when the audit sink is unavailable. No autonomous promotion or mutation is introduced by this slice.

## 8. Local implementation binding

- Migration `docker/postgres-init/71-digital-brain-read-foundation.sql` creates `brain_documents` and `brain_department_memberships`, forces RLS, grants `allura_app` SELECT only and provides no admin override.
- Fixture `docker/epic30-postgres/99-epic30-synthetic-fixtures.sql` contains only `.invalid` identities and synthetic content.
- `src/lib/digital-brain/read-service.ts` binds server-derived tenant/workspace/principal parameters, authorizes candidates in SQL and rechecks each returned row.
- Outside explicit synthetic local mode, preserve the ordinary governed dashboard overview and its authorization checks. In explicit local mode, failed confinement or reads show an unavailable state; never substitute production data or static content.

These bindings describe the saved candidate, not code integrated into current `main`. Proposed revocation timings are test targets, not measured guarantees or approved production policy. Verify actual enforcement after code reconciliation.

## 9. Remaining gates

Independent security/data review, live disposable-PostgreSQL execution, browser role journeys, exact-SHA CI, design acceptance and five distinct human participants remain pending. This contract allows bounded local implementation only; it does not make Story 30.3, Story 30.4, Story 30.6 or Epic 30 done.
