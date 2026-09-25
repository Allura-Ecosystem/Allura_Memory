# Epic 30 — Authorization Approval Packet

Date: 2026-09-17; independent AI preflight added 2026-09-21
Status: **review concerns; approval requested; not approved**
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

- Maintained focused Epic 30 unit lane: **88 tests across 9 files passed** on 2026-09-17 against `4370cac3`.
- The same focused lane passed **88 tests across 9 files** again on 2026-09-21; `bun run typecheck` passed. All six bound artifact hashes still match current `main`.
- Explicit non-null department scope, exact-scope row checks, no admin private override, local target confinement, ordinary-route preservation and owned-process cleanup are covered.
- Live disposable PostgreSQL/HTTP, hosted CI, full derivatives, immutable audit, timed revocation and provider-policy evidence remain open.

## Independent AI specialist preflight — 2026-09-21

Two real, read-only specialist reviews were run after the Story 30.2 design decision: an agentic-trust-architect security review and a Knuth data/schema/RLS review. Both returned **FAIL for Story 30.3 acceptance**, not a human policy decision or independent human security/data sign-off. They made no code, status, memory, or database changes.

| Decision area                                            | Preflight disposition                         | Required resolution                                                                                                                                                                                                                                                                                                            |
| -------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Server-derived authority                                 | Concerns                                      | The bounded reader uses a server-owned tenant/workspace/principal tuple, but the proposed session, roles and policy-epoch authority envelope is not yet shared across protected surfaces.                                                                                                                                      |
| Owner-private and department reads                       | Supported only in the bounded synthetic slice | SQL RLS and service rechecks deny admin private override and require current tenant/department membership. Verify the intended independent workspace-membership predicate; current slice has a workspace FK but no separate workspace-membership table/predicate. Run the live restricted-role matrix.                         |
| Contractor invitations, derivatives and unknown surfaces | Open                                          | Implement the named-role/dual-approved exact-channel invitation; enumerate every protected enforcement point; enforce source lineage and strictest-authority propagation across search, links, Ask, workers, caches and messaging.                                                                                             |
| Revocation                                               | Concerns                                      | Current reads re-query inside transactions, but session/epoch invalidation and measured cursor/run/stream bounds are absent. Test the proposed 60-second and 5-second targets live.                                                                                                                                            |
| Required receipts and audit outage                       | Fail                                          | The Epic 30 slice has no synchronous durable content-free allow/deny receipt gate. Existing generic MCP auth audit is fire-and-forget (`src/lib/auth/principal-audit.ts`), so receipt-required Epic 30 surfaces must not rely on it for fail-closed behavior. Define the surface classification and prove audit-outage denial. |
| Adversarial and operational proof                        | Open                                          | Confused-deputy, prompt/tool injection, derivative lineage, receipt replay, cache-after-revocation, live outage/rollback and hosted exact-SHA checks are not yet demonstrated.                                                                                                                                                 |

This preflight validates the packet's explicit open risks; it does not reject the seven proposed defaults as design principles. It does prevent claiming the contract is fully enforced or that Story 30.3 has independent approval. Preserve the review findings when amending the contract and obtaining the authorized policy decision.

### Proposed resolution for the next contract candidate — not approved

These are review questions and implementation boundaries, not amendments to the hash-bound v1 candidate above. Do not advance a dependent story or treat a passing synthetic test as a policy decision.

1. **Workspace membership:** Decide whether Epic 30 requires an independent, current `(group_id, workspace_id, principal_id)` membership record for every private and department read. The existing `memberships` table is tenant-wide; the workspace foreign keys prove a document's workspace exists, not that the reader belongs to it. If the independent predicate is required, add a governed membership model and require it in both RLS and the service before returning either visibility class. Missing, revoked, or conflicting membership must deny without revealing document existence.
2. **Authority envelope:** Specify the authoritative source and invalidation rule for `session_id`, effective roles, and `policy_epoch` across browser, API, MCP, worker, cache, and cursor surfaces. The current bounded reader passes tenant, workspace, and principal; it must not be described as enforcing the full proposed tuple. A missing or stale required field denies, and tests must show that client-supplied replacements cannot widen scope.
3. **Required receipts:** Classify each protected disclosure and side effect by whether a durable, content-free allow/deny receipt is mandatory. For a receipt-required allow, persistence must succeed before disclosure or effect; an unavailable sink denies. For a receipt-required deny when the sink is unavailable, return the denial without content and record only bounded operational telemetry if available—never turn audit failure into an allow. The existing fire-and-forget principal audit is not this gate. Define replay, uniqueness, scope binding, and outage tests before integrating a new writer.
4. **Derivatives and invitations:** Keep search, links, citations, Ask, workers, caches, and contractor messaging unavailable until each surface has an enumerated enforcement point, strict source-lineage propagation, revocation behavior, and the exact dual-approved invitation contract where applicable. Unknown surfaces deny; a UI affordance is not evidence of authority.
5. **Acceptance order:** First obtain the amended policy decision and independent human security/data dispositions on the exact contract candidate. Then implement schema/authority/receipt slices with hermetic tests, run the restricted-role disposable-PostgreSQL/HTTP matrix and outage/revocation adversarial tests, and finally run hosted exact-SHA CI. No local-only result closes a live or human gate.

The next reviewer should explicitly accept or amend each item, especially whether workspace membership is independently required and which surfaces require synchronous receipts. Until then, the v1 candidate remains provisional and the two AI preflight FAIL findings stand.

The reviewable [proposed v2 addendum](./epic-30-authorization-v2-proposed-addendum.md) makes the recommended semantics and verification order explicit. Its SHA-256 is `46c4efd01a42f1b08741f8d5cb83a95c8c98d3f0bdb58522fd395ebc4df7ad8d`. It is **not approved** and does not alter the six v1 bound artifact hashes or the Story 30.3 board status; any amendment requires a new hash before an exact combined-candidate decision.

The [Notion Story 30.3](https://app.notion.com/p/3df1d9be65b3819eb670e4379a263962) Decision Log and Handoff Context were updated with this bounded AI-review outcome and read back on 2026-09-21. Its `Not Started` status and dependencies were preserved; no policy approval was recorded there.

On 2026-09-22, after the exact proposed v2 addendum hash was presented in the Codex task, the user replied “approve full approval.” This is recorded as an approval-intent signal for the proposal as written, not as a completed policy decision: the approver's name and policy role were not supplied, the exact combined-candidate record and durable board receipt have not been updated, and independent human security/data threat-row dispositions remain open. Preserve the v2 addendum hash and Story 30.3 backlog status until those gates are satisfied.

### Administrative approval and proposed stakeholder roster — 2026-09-25

Sabir Asheed identified himself as an Allura administrator and confirmed his prior approval intent for the v1 contract plus the exact v2 addendum. Record this as the named administrative approval of the proposed policy defaults, not as independent security review, independent data-owner approval, a production access grant, or Story 30.3 acceptance. The hashes remain:

- v1 authorization contract: `0020cfea14a5a6fa18a6e373731982f8d1094cf3f00757e87440342fe48edaa2`
- v2 proposed addendum: `46c4efd01a42f1b08741f8d5cb83a95c8c98d3f0bdb58522fd395ebc4df7ad8d`

The proposed human roster is:

| Person | Recorded or proposed role | Current effect |
| --- | --- | --- |
| Sabir Asheed | Allura administrator; administrative policy approver | Approval identity recorded; no new runtime access granted |
| Gabriel Cohen | Designated Epic 30 human security reviewer; Allura-hydrated Faith Meats launch stakeholder and human principal; approved access plan assigns `reviewer`. User-stated: Faith Meats owner, Allura administrator, and works on Measured Course. | Reviewer assignment recorded; runtime-role conflict still requires reconciliation and no access grant is created by this record |
| Samuel Montgomery | Designated Epic 30 human data reviewer; Allura-hydrated Faith Meats launch stakeholder in the CRM. User-stated: Faith Meats owner. | Reviewer assignment recorded; ownership is not yet confirmed by approved Allura memory and no access grant is created by this record |
| Tabitha Wells | Future limited marketing and creative stakeholder; public profile verifies founder, brand strategist, and lead designer of Tabitha & Co. | Not currently onboarded; no account or runtime access exists |
| Future stakeholders | Not yet named | Add through the governed membership and approval process |

Sabir Asheed approved and later clarified the following least-privilege definition for Tabitha Wells's future limited marketing and creative role in the Codex task on 2026-09-25:

- May view approved marketing documents only in her assigned workspace and approved department scope.
- May use search and citations only over those currently authorized documents.
- Once onboarded through the governed process, may create and edit SEO, website, social/personal media, and content-writing drafts only in the assigned marketing workspace.
- Draft creation does not grant publication authority; release or publication requires the designated owner approval.
- Cannot view another person's private notes.
- Cannot manage users, memberships, roles, permissions, policy, or audit records.
- Cannot access another workspace or department without a separate governed grant.
- Cannot approve contractor invitations or protected messaging channels.
- Cannot delete or export protected Brain data, or write outside the assigned marketing-draft area.
- Cannot use production Ask until the provider policy and cited read-only Ask gates are approved; any later use remains limited to her authorized documents.
- Cannot approve security, data, deployment, release, or retrospective gates.

This is a policy definition, not an account, invitation, membership, or production access grant. The limited marketer role must not inherit administrator, private-owner, security-review, data-owner, membership-administration, contractor-invitation, release, database-write, or cross-workspace authority. Faith Meats ownership does not by itself grant Brain access or satisfy independent security-review, data-review, membership-administration, or release gates. An administrator role never overrides private ownership or workspace/department membership rules. Samuel Montgomery's Faith Meats owner role does not imply an Allura administrator role.

Allura hydration note (2026-09-25): tenant-wide approved-memory searches in `allura-system` corrected the earlier desktop-user-scoped zero-result search.

- Gabriel Cohen is an approved semantic-memory match under IDs `80c61ee0-fd9c-4224-b2c0-f6be55791e52` and `d14cd8ee-d928-497d-822d-49d1b0c2ec91`. The first identifies him as a human principal, assigns planned role `reviewer`, separates his Jeeves agent and credentials, and requires the Bumblebee guard before access. It names isolated Faith Meats, Difference Driven, and personal tenant plans. The second confirms his Faith Meats launch CRM stakeholder record. Approved memory did not confirm an Allura `admin` role or Measured Course assignment, so those remain user-stated and must not widen access until reconciled.
- Samuel Montgomery matches approved semantic memory `d14cd8ee-d928-497d-822d-49d1b0c2ec91`, which confirms a Faith Meats launch CRM stakeholder record. It does not state his duties, owner status, or Allura role; those details remain pending confirmation.
- Tabitha Wells returned no approved-memory result, including the `Tabatha` spelling variant and marketing/Faith Meats searches. Sabir described her as one of the first future users, focused on SEO, website design, social/personal media, and content writing. Her public [Tabitha & Co.](https://tabithaandco.com/) site and [About page](https://tabithaandco.com/about-us/) were reviewed on 2026-09-25. The site identifies Tabitha Wells as founder, brand strategist, and lead designer with more than 12 years of experience. It describes SEO-optimized website design, content strategy and messaging, branding and visual identity, acquisition funnels, legal/healthcare-compliant marketing, small-business/local SEO, social media, advertising, photography/video, and marketing automation. It also states that she began as a content writer and has designed and launched hundreds of websites. These are public professional-profile facts, not proof of a Faith Meats role or an Allura access grant. She is not currently present or onboarded, and her limited marketing and creative definition remains a future onboarding policy.
- Sabir Asheed has approved semantic records identifying him as CEO and an Allura architecture decider. The separate administrative policy approval above remains self-attested in this task.

The earlier conversation-sourced pending memory `e3fba3cd-66af-4e5f-8224-5b18f122cd5a` is not an approved profile. The desktop principal lacked `memory:delete` permission to remove it; correction trace `6a1d4e76-775a-4181-b4a8-c59e283df7d8` records that limitation.

### Approved Epic 30 closure defaults — 2026-09-25

Sabir Asheed approved the recommended closure defaults in the Codex task:

- Gabriel Cohen is the named human security reviewer for Epic 30.
- Samuel Montgomery is the named human data reviewer for Epic 30.
- Sabir Asheed is the final release authority.
- Legacy records remain read-only and quarantined. Only verified records may be migrated, and nothing is deleted automatically.
- Production Ask remains disabled until a written provider contract proves the required no-training and retention limits and receives approval.
- Development and verification may use disposable temporary databases only. The live database remains prohibited.
- Codex may create Epic 30 commits, branches, pull requests, evidence, CI runs, and required GitHub checks within the approved repository scope.
- Production deployment remains prohibited until Sabir Asheed gives final approval for the frozen release candidate.
- Five distinct uncoached testers will be named later. Their study cannot be replaced by simulation or automated agents.

These decisions name authorities and constrain execution. They do not count as completed security/data reviews, provider-contract evidence, human-study evidence, release approval, runtime membership, or production access.

## Approval record

An authorized human approval must identify the candidate commit and contract hash, record amendments or accepted defaults, name the approver and role, and link the durable board receipt. The board receipt now exists in the [reconciliation packet](./epic-30-board-reconciliation-packet.md). Independent security and data reviewers must still record dispositions for every threat row. Until those approval and review records exist, Story 30.3 remains backlog and dependent implementation stories do not advance.

### Reviewer response template

```text
Decision: APPROVE | APPROVE WITH AMENDMENTS | REJECT
Approver name and role:
Candidate: f08404f0cb5b7ec41a12a1acaf12d1ea45b96fd0
Authorization contract SHA-256: 0020cfea14a5a6fa18a6e373731982f8d1094cf3f00757e87440342fe48edaa2
Accepted defaults or amendments:
Threat-row dispositions or required reviewers:
Notes:
```

### Recorded administrative decision — 2026-09-25

```text
Decision: APPROVE
Approver name and role: Sabir Asheed, Allura administrator
Candidate: f08404f0cb5b7ec41a12a1acaf12d1ea45b96fd0
Authorization contract SHA-256: 0020cfea14a5a6fa18a6e373731982f8d1094cf3f00757e87440342fe48edaa2
Authorization v2 addendum SHA-256: 46c4efd01a42f1b08741f8d5cb83a95c8c98d3f0bdb58522fd395ebc4df7ad8d
Accepted defaults or amendments: Accept the seven packet defaults and v2 sections A-E without amendment.
Threat-row dispositions or required reviewers: Independent human security and data-owner reviews remain required.
Notes: Administrative approval only. No production access, implementation activation, story advancement or release authority follows from this record. Durable board read-back remains pending.
```

The Story 30.2 design decision prerequisite is now recorded and reconciled. Any later Story 30.3 policy decision does not substitute for independent human security/data disposition, implementation, live restricted-role proof, hosted CI, human validation, publication or release acceptance.
