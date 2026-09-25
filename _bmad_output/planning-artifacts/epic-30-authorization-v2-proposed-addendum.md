# Epic 30 — Proposed Authorization v2 Addendum

**Status:** proposed for Story 30.3 review; not an approved policy, implementation order, production permission, or ADR.  
**Base contract:** [provisional v1](./epic-30-local-authorization-contract.md), SHA-256 `0020cfea14a5a6fa18a6e373731982f8d1094cf3f00757e87440342fe48edaa2`, bound to candidate `f08404f0cb5b7ec41a12a1acaf12d1ea45b96fd0`.  
**Reason for addendum:** independent AI security and data preflights found the v1 principles credible for a bounded synthetic read but insufficient for full Story 30.3 acceptance. See the [approval packet](./epic-30-authorization-approval-packet.md).  
**Scope:** this document proposes precise resolutions to review findings. It does not mutate the v1 artifact or supersede its hash-bound approval request until an authorized approver accepts an exact combined candidate.

## A. Independent workspace membership — proposed required predicate

For every protected document read, require all three current records: tenant membership, workspace membership for the exact `(group_id, workspace_id, principal_id)`, and—only for department content—matching department membership. A private owner must also be the exact `owner_id`; an administrative role is never an override. A document's composite workspace foreign key proves resource placement, not reader membership. Unknown, missing, revoked, or conflicting membership denies before disclosing names, counts, existence, or snippets.

The current `memberships` table is tenant-wide and the Epic 30 migration has no independent workspace-membership record. The proposed model is a separate current-state membership with tenant/workspace/principal key, approval provenance, revocation time, and policy epoch. Its write path and approver authority require data/security review. Until the model and both RLS/service predicates exist, the synthetic reader remains a bounded preflight—not full enforcement of this proposal.

**Decision requested:** accept independent workspace membership for both visibility classes, amend its scope, or explicitly reject it with rationale. The secure recommendation is **accept**.

## B. One server-issued authority envelope

The protected evaluator receives a server-issued envelope containing principal, tenant, workspace, session, effective roles, and policy epoch. It validates source authenticity, current session and memberships, policy version, and exact resource scope. UI state, headers supplied by a client, model text, tool arguments, and cached results are assertions only. Missing, stale, or mismatched required fields deny. DevAuth may issue an envelope only in explicit non-production synthetic mode; it cannot become a production fallback.

Browser, API, MCP, worker, cursor, and cache paths must consume the same envelope semantics. Each protected read and each disclosure or side effect rechecks authority at the surface boundary; a validated browser page cannot authorize a later tool call by itself. The current reader's server-owned tenant/workspace/principal tuple is narrower than this proposal and must remain labelled as such.

## C. Durable, content-free decision receipts and audit outage

**Proposed required-receipt classification:** private and department read response envelopes; search result/count/snippet disclosure; link/backlink and citation disclosure; Ask context/output; messaging discovery, invitation, send and read; worker/agent protected output and sensitive side effects; delegation and policy/membership changes. The final reviewers may narrow or expand this list only with an explicit threat-row disposition. A receipt records action, allow/deny, reason code, principal/session/tenant/workspace identifiers, resource or query identifier, policy version/epoch, timestamp, and witness hash—never raw content, secrets, prompts, or protected snippets.

For an allow on a required-receipt surface, a durable append-only receipt must succeed **before** the response or effect is released. A read may compute candidates in a restricted transaction, but it may not disclose them if the receipt cannot be persisted. If the sink is unavailable, return a non-content denial. A denial never becomes an allow because its receipt cannot be stored; bounded operational telemetry may be attempted without protected data. Receipt identifiers are unique and bound to the exact decision envelope; replay, wrong-scope, missing witness, or unverifiable receipts cannot grant authority. The existing fire-and-forget generic principal audit is not this gate.

The restricted document-read role remains SELECT-only. Reviewers must choose a separate narrowly scoped append-only receipt writer or transactional outbox before implementation; owner credentials, RLS bypass, or a broad database writer are not acceptable fallbacks.

**Decision requested:** accept synchronous durable receipts for the classified protected allows and the fail-closed outage rule, amend the classification, or reject with rationale. The secure recommendation is **accept**.

## D. Derivative and invitation containment

Unknown surfaces deny. Search, links, citations, summaries, embeddings, Ask, cache entries, cursors, and worker outputs retain strict source lineage and the intersection of source, user, delegation, surface, and provider policy. Missing lineage or stale epoch denies before disclosure. Revocation applies to generated output and already-open streams, not merely a new page load.

Contractor contact remains limited to approved named roles. A project-channel invitation needs independent durable approvals from the project owner and workspace membership administrator for that exact channel; neither a tenant role nor the invitation alone grants Brain browsing. No messaging or real-content Ask is enabled by this addendum.

## E. Required verification before acceptance

1. Independent security and data reviewers disposition every row of the v1 adversarial matrix against this addendum and the resulting full candidate. They record reviewer identity, role, amendments, and evidence; AI preflights are supporting evidence only.
2. Hermetic tests cover missing/forged/stale session, role and epoch; tenant-only versus workspace membership; owner/private and department isolation; receipt uniqueness/replay/wrong scope; audit outage; and no protected data in denial or receipts.
3. Disposable PostgreSQL/HTTP tests run under the restricted role with revoked/cross-tenant/cross-workspace/cross-department/admin/contractor actors. Measure the proposed ordinary 60-second and observed-stream 5-second revocation bounds; verify rollback and audit outage.
4. Each later search, link, Ask, messaging, worker, cache, and cursor implementation adds source-lineage, authorization and revocation tests before its surface is enabled. Hosted exact-SHA CI and human validation remain separate epic gates.

## Decision record to be completed by authorized reviewers

```text
Decision: APPROVE | APPROVE WITH AMENDMENTS | REJECT
Approver name and policy role:
Base v1 contract SHA-256: 0020cfea14a5a6fa18a6e373731982f8d1094cf3f00757e87440342fe48edaa2
This addendum SHA-256: <calculate after final review edits>
Independent workspace membership for private and department reads: ACCEPT | AMEND | REJECT
Required-receipt classification and outage behavior: ACCEPT | AMEND | REJECT
Other amendments and threat-row dispositions:
Independent security reviewer and evidence:
Independent data reviewer and evidence:
Durable Notion board receipt:
```

The Story 30.3 board item remains `Not Started` until the exact combined candidate is approved and independently reviewed. No code, database, status, provider, or production behavior changes follow from this proposal alone.
