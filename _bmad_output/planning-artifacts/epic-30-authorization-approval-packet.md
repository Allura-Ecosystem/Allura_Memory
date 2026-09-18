# Epic 30 — Authorization Approval Packet

Date: 2026-09-17  
Status: **approval requested; not approved**  
Candidate commit: `f08404f0cb5b7ec41a12a1acaf12d1ea45b96fd0`

This packet turns the provisional authorization contract into one reviewable decision. It does not approve production use, advance a story, or replace independent security/data review.

## Bound artifacts

| Artifact                                                    | SHA-256                                                            |
| ----------------------------------------------------------- | ------------------------------------------------------------------ |
| `epic-30-local-authorization-contract.md`                   | `0020cfea14a5a6fa18a6e373731982f8d1094cf3f00757e87440342fe48edaa2` |
| `docker/postgres-init/71-digital-brain-read-foundation.sql` | `3854003642d35f30772ddc90f1df72eb255a7f4affc3fde8616306165f52d54f` |
| `src/lib/digital-brain/read-service.ts`                     | `4bdcb760fbf1743728ca04ced8b52b632cbd1f7b0e2aa8431d2e6603611ad53e` |
| `src/lib/digital-brain/local-confinement.ts`                | `aae4af1ec40ac23d6d24a7a340211bec7bac4aaa011d4ac98ac3e931b3937047` |
| `scripts/ci/run-epic30-live-tests.sh`                       | `94ea73b8dd9062c7b21297ea73bb8e1af30cc51543c9aa2401719eb7dad33719` |
| `.github/workflows/epic-30-evidence.yml`                    | `bc4407ba6fa74743a68aee436738300ba37aefc9410a107eb3133ee5e0d3b400` |

## Decisions requested

Approve or amend these exact defaults:

1. Authority is server-derived from principal, tenant, workspace, session, roles and policy epoch; client, model and tool inputs cannot widen it.
2. Owner-private content has no administrator override and is not shareable in this MVP.
3. Department access requires current tenant membership plus matching, non-revoked department membership.
4. Contractor messaging requires an approved named role and an exact-channel invitation independently approved by the project owner and workspace membership administrator.
5. Search, links, citations, Ask, derivatives, workers and caches retain the strictest source authority and fail closed on missing lineage, stale policy or unknown surfaces.
6. Revocation targets are next request and at most 60 seconds for ordinary reads/cursors/runs; protected stream emissions stop within 5 seconds after observed revocation.
7. Protected decisions produce append-only, content-free receipts; required-receipt surfaces fail closed when their audit sink is unavailable.

## Adversarial review matrix

| Threat                                        | Required decision                                                  | Current evidence                                          | Remaining proof                           |
| --------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------- | ----------------------------------------- |
| Forged tenant/workspace/principal             | Deny; server tuple wins                                            | Parameterized query, transaction scope, confinement tests | Live restricted-role journey              |
| Admin reads another owner's private note      | Deny `OWNER_REQUIRED`                                              | SQL owner predicate and unit regression                   | Live role matrix                          |
| Revoked or cross-department membership        | Deny without existence hints                                       | RLS membership predicates and row recheck tests           | Timed live revocation proof               |
| Confused deputy / delegated agent             | Intersect user, delegation, source, surface and provider authority | Contract only                                             | Stories 30.6/30.9 execution tests         |
| Prompt or tool scope injection                | Treat as assertion only; deny mismatch                             | Contract and server-derived scope boundary                | MCP/Ask adversarial tests                 |
| Missing derivative lineage                    | Deny `POLICY_UNKNOWN`                                              | Contract only                                             | Search/link/citation implementation tests |
| Replayed, wrong-scope or unverifiable receipt | Deny; receipt never grants authority                               | Contract only                                             | Immutable audit implementation tests      |
| Audit or authority outage                     | Fail closed for protected disclosures/effects                      | Synthetic unavailable state                               | Live outage and rollback proof            |
| Cached allow after revocation                 | Policy-epoch mismatch denies                                       | Contract target                                           | Cache/cursor/run invalidation tests       |
| Production or remote target in synthetic lane | Refuse before connection                                           | Loopback/database/user/process confinement tests          | Hosted exact-SHA run                      |

## Current verification

- Maintained focused Epic 30 unit lane: **78 tests across 9 files passed** on 2026-09-17.
- Explicit non-null department scope, exact-scope row checks, no admin private override, local target confinement, ordinary-route preservation and owned-process cleanup are covered.
- Live disposable PostgreSQL/HTTP, hosted CI, full derivatives, immutable audit, timed revocation and provider-policy evidence remain open.

## Approval record

An authorized human approval must identify the candidate commit and contract hash, record amendments or accepted defaults, name the approver and role, and link the durable board receipt. The board receipt now exists in the [reconciliation packet](./epic-30-board-reconciliation-packet.md). Independent security and data reviewers must still record dispositions for every threat row. Until those approval and review records exist, Story 30.3 remains backlog and dependent implementation stories do not advance.
