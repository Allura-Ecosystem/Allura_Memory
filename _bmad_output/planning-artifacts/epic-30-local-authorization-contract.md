> Reconciliation note (2026-09-17): the bounded candidate and interrupted repairs were integrated into canonical `main`. Earlier test/demo statements remain historical unless repeated in the current readiness record. Integration does not grant story acceptance.

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

These bindings describe the bounded code now integrated into current `main`. Proposed revocation timings remain test targets, not measured guarantees or approved production policy. Full enforcement review remains required before affected stories advance.

## 9. Remaining gates

Independent security/data review, live disposable-PostgreSQL execution, browser role journeys, exact-SHA CI, design acceptance and five distinct human participants remain pending. This contract allows bounded local implementation only; it does not make Story 30.3, Story 30.4, Story 30.6 or Epic 30 done.


## 10. Approved access policy — 2026-09-28 (Sabir Asheed)

Approved as policy input. It does not supply human test results, external reviews, provider contracts, hosted branch protection, deployment or release evidence.

### 10.1 The approved rules

1. The three Faith Meats founders — Sabir Asheed, Gabriel Cohen and Samuel Montgomery — may access every Faith Meats project. **Clarified 2026-09-28: this is project eligibility/membership only. Founder status never overrides owner-private document visibility, which stays limited to the owner and specifically approved people. Founder is not a superuser or content-override role.** See §10.2.
2. Every other human may access only the projects they are explicitly added to.
3. **Allura and every other AI agent MUST NOT have automatic cross-project access.** An agent is assigned project by project with least privilege. Removal terminates access.
4. Also approved: the current design for testing, strict zero-retention and zero-training AI privacy, limited contractor messaging, five-person user and accessibility testing, full release gates, and keeping Epic 30 open until evidence is complete.

The fail-closed direction of rule 3 is the binding constraint: **absent an explicit assignment, an agent holds nothing.** Rule 1 must never reach an agent. A founder delegating to an agent does not lend that agent founder reach; §4's intersection rule is necessary but not sufficient, because intersecting with a founder's all-project authority would otherwise produce an all-project agent. An agent's own explicit assignment is an independent, additional requirement.

### 10.2 RESOLVED 2026-09-28 — founder access is project eligibility, never a content override

The owner resolved the conflict in favour of reading **(a)**:

> Faith Meats founders Sabir Asheed, Gabriel Cohen and Samuel Montgomery may access every Faith Meats project, but **founder status NEVER overrides owner-private document visibility**. Owner-private documents remain visible only to the document owner and specifically approved people. Founder status is project eligibility/membership, not a superuser or content-override role.

This is fully compatible with the decisions it appeared to conflict with, all of which stand unchanged:

- §2, verbatim: "Roles, including `admin`, authorize administrative actions only. They do not satisfy private ownership or department membership. **Owner-private resources are not shareable in this MVP.**"
- Approval packet decision 2, verbatim: "Owner-private content has no administrator override and is not shareable in this MVP."
- Accepted epic default 3, verbatim: "Private content is owner-only: **no private sharing**, emergency access, or administrator override in MVP."

**One divergence, stated rather than absorbed.** The approved wording permits owner-private documents to reach "specifically approved people". Accepted default 3 forbids private sharing in MVP and no per-document approval or share mechanism exists, so the stricter owner-only behaviour is what ships. That is a gap between the wording and MVP scope, not an implemented capability; see the §10.4 Gap column.

**No code change was required, because the existing enforcement already implements this.** The general control is the RLS policy in migration `72-digital-brain-workspace-membership.sql`, whose private disjunct is `owner_id = current_setting('app.current_principal', true)` alone; `allura_app` is `NOBYPASSRLS` with `FORCE ROW LEVEL SECURITY` and no SELECT policy for any other role. The admin predicate `brain_has_current_workspace_admin()` exists but is applied only to membership and messaging tables, never to `brain_documents`. On top of that, the synthetic read path re-checks in TypeScript: `canDisclose` (`src/lib/digital-brain/read-service.ts`) resolves a private row purely by `row.owner_id === scope.principalId`, with no role branch, and the envelope annotates roles as administrative-only.

Two precision notes rather than broader claims. `migration-contract.test.ts` regex-checks migration 71 only, for same-line `admin`/`private` co-occurrence — it does not cover migration 72, which owns the live policy. And `src/lib/digital-brain/production-reader.ts` has no owner/visibility predicate of its own and relies entirely on RLS; it has no route, page or MCP consumer today, so this is a pre-existing defence-in-depth gap to close before that module is wired, not something introduced here.

What was added is a **regression guard**, not a new control: `read-service.test.ts` now proves that a principal carrying a `founder` role — including when it also carries `admin` — still reads nothing of another user's owner-private document, while the owner still reads their own. Verified to bite: injecting a `roles`-keyed founder override into `canDisclose` fails all three cases, and removing it restores 35/35.

**Scope of that guard, stated precisely.** `canDisclose` takes a scope with no `role` field, so parameterising over `viewer`/`curator`/`admin` does not vary the function under test; those three collapse onto the pre-existing admin assertion. `roles` is currently dead on the read path — `issueReadEnvelope` never copies it. What the guard genuinely defends is the specific drift this decision invites: someone wiring `roles` into the envelope and branching on a founder value. It is not a proof across the role space.

**The eligibility half is not enforced and is not claimed to be.** Founders being members of every Faith Meats project requires project-grained membership, which does not exist (§10.3). Nothing in this repository grants or denies at project grain today.

### 10.3 Project grain does not exist yet

There is no project-grained authority anywhere in the schema. `projects` (migration 26) is tenant-scoped with tenant-wide RLS and no `workspace_id`; `project_id` appears on `lanes`, `work_items` and the messaging tables as an organising column that carries no authority. There is no `project_members` table, and no membership, approval or credential table carries a principal-type discriminator, so no policy can currently say "deny because the principal is an agent".

The finest authority grain that exists is **tenant (`group_id`) plus workspace (`workspace_id`)**, with department membership inside it. Rules 2 and 3 are therefore enforced at the grain that exists, and the project grain is an open implementation gap — not something these changes silently imply.

### 10.4 What is enforced in the repository as of 2026-09-28

| Approved rule | Enforcement now | Gap |
| --- | --- | --- |
| Agents never automatic (3) | The agent registry no longer grants `fallback_group_id` to an unlisted agent: an unassigned agent gets an empty tenant list, every `isAgentAllowedGroupId` check is false, `getAgentAllowedGroupIds` returns an empty list and `getDefaultGroupId` refuses rather than inventing a tenant. | **This module has no production consumer.** Its only importers are three test files; no route, MCP tool, middleware, script or plugin consults it for an access decision. This is therefore latent-API hardening, not an enforced control, and the previous fallback was likewise never a live grant. The live agent-scope grain is the `mcp_tokens` row. The registry is also a YAML file, not a governed table: assignment and removal leave no audit trail and terminate no live session, and the module caches by path for the process lifetime, so an edit does not take effect until reload or restart. |
| Agents least privilege (3) | A delegated `mcp_token` principal with no verified workspace binding is refused on **every** tool. Previously only `memory_search`, `memory_get` and `memory_list` refused; delete, update, export, restore, promote and the audit and governance readers ran tenant-wide on the absence of an assignment. Those three reads still refuse for every auth method — narrowing that would have removed an existing control and turned an audited deny into an audited allow. | **Open risk, not closed.** The all-tool refusal is scoped to `mcp_token` because widening it breaks the AC-10 shared-token compatibility contract. `dev_local` is fenced out of production, but the **HTTP shared-token `service_identity` path is not**, and such a principal has no workspace binding while `audit_query_events`, `governance_audit_log` and `memory_export` filter on `group_id` alone — tenant-wide audit and export reach. Shared-token tenants also default to `allura-system` and roles to `viewer` with no explicitness required, so the earlier claim that these principals "carry their own explicit tenant allowlists" and are "fenced out of production" was wrong and is withdrawn. |
| Removal terminates access (3) | Credential revocation is proved live on reused and fresh pooled connections. Registry removal yields no access **after the registry is reloaded**. | Membership and project revocation timing is still an unmeasured target; the registry has no revocation event, and its process-lifetime cache means an edit leaves the stale grant live until reload or restart. A test pins both the reloaded behaviour and the un-reloaded stale grant so the gap is visible rather than implied solved. |
| Humans explicit only (2) | Workspace and department membership already require a current, non-revoked, approval-backed record. | Project grain absent (§10.3). |
| Founder eligibility (1) | The **non-override half is enforced**: RLS resolves a private row by owner identity alone and the synthetic read path re-checks it, with no role branch anywhere. A regression guard pins it against a `roles`-keyed override, including when the principal also carries `admin`. | Two gaps. (i) The **eligibility half is not enforced**: founders being members of every Faith Meats project needs project-grained membership, which does not exist (§10.3). No founder principal set, role grant, allowlist or flag was added, and none of the three founders is named in any source, schema or config file. (ii) **"Specifically approved people" is not enforced either**: no per-document approval or share mechanism exists and accepted default 3 forbids private sharing in MVP, so owner-only ships. The owner should confirm owner-only is intended or scope sharing as separate work. |

### 10.5 Cross-tenant grants already present, referred to the owner

`.opencode/config/group-id-registry.yaml` currently grants `gilliam`, `troy` and `openwork` all four tenants. These are explicit assignments, so they do not violate the "never automatic" rule, but four tenants each is unlikely to be least privilege. **Reducing them is an access-removal decision and is not taken here**; it is referred to the owner with the note that removal terminates access.
