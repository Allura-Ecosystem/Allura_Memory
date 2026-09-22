> Reconciliation note (2026-09-17): the bounded candidate and interrupted repairs were integrated into canonical `main`. Earlier test/demo statements remain historical unless repeated in the current readiness record. Integration does not grant story acceptance.

# Story 30.3 — Authorization and Threat Contract

**Epic:** 30 — Governed Digital Brain Workspace  
**Status:** backlog  
**Owner:** Brooks / Knuth  
**Planning authority:** [Epic 30](../planning-artifacts/epic-30-governed-digital-brain-workspace.md)  
**Requirement:** E30-R03  
**Dependencies:** 30.1, 30.2

## User Story

As a content owner, I want one deny-by-default contract so that no route, administrator, agent or derivative can widen access.

## Acceptance Criteria

- Define server-verified inputs, allow/deny outcomes and reason codes across UI/API/MCP/search/links/chat/AI/workers; inventory all protected enforcement points and unknown-path denial.
- Keep ownership, department, role, permission, explicit deny and invitation separate. Owner-only private reads exclude admin override and sharing.
- Define approved contractor role contacts, dual-approved invitations, revocation timing, session/cache/cursor/run invalidation and non-disclosing denials.
- Agents receive intersected authority; derivatives cannot widen it. Define immutable audit, outage, replay, approval and receipt behavior.

## Required Evidence / Definition of Done

Reviewed decision matrix and adversarial threat cases including forged scope, confused deputy, prompt injection and unknown surfaces. Set measurable revocation bounds before code. Exact contracts, independent security/data review and verified receipts are required; epic publication gates apply.

## Current Preparation State

2026-09-17: canonical checkout is `main`. The bounded synthetic reader foundation and interrupted repair set are now integrated without the unrelated Epic 29 branch changes. Fresh local evidence is recorded in [current readiness](../planning-artifacts/implementation-readiness-epic-30.md). The exact Story 30.2 design decision was subsequently approved and reconciled on 2026-09-21, but Story 30.2 remains backlog. This story also remains backlog: the integrated slice does not implement the full authorization requirement, and no authorization-policy, live-database, hosted-CI, human-study or release approval is implied. Follow the [consolidated requirements](../planning-artifacts/epic-30-prd.md) and [completed course correction](../planning-artifacts/sprint-change-proposal-2026-09-17.md).

## Historical Evidence — before repository consolidation

Provisional policy defaults were accepted for drafting, not approved for production, and the v1 contract is documented in `../planning-artifacts/epic-30-local-authorization-contract.md`, including server-derived inputs, deny reason codes, enforcement inventory, derivative rules, audit behavior, and measurable revocation targets. The contract is implemented only for a bounded synthetic local read slice. Independent human security/data disposition and production approval remain open; status stays backlog.

2026-09-17: the exact contract and implementation bindings are now hash-bound in the [authorization approval packet](../planning-artifacts/epic-30-authorization-approval-packet.md), with an adversarial threat matrix and explicit approval record requirements. The maintained focused lane most recently passed 88 tests across 9 files against `4370cac3`. This prepares review but does not supply human authorization-policy approval, independent reviewer dispositions, live restricted-role proof, or story acceptance; status remains backlog.

2026-09-21: a real agentic-trust-architect security specialist and Team RAM Knuth data reviewer completed read-only AI preflights recorded in the [authorization packet](../planning-artifacts/epic-30-authorization-approval-packet.md). Both found the bounded synthetic read isolation credible but returned FAIL for full Story 30.3 acceptance: shared session/role/epoch authority, independent workspace-membership semantics, synchronous required receipts, derivatives, revocation and adversarial/live proof remain open. The focused local lane passed 88/88 tests and typecheck passed. These AI findings are not human security/data sign-off or policy approval; status remains backlog.

2026-09-22: the proposed independent workspace-membership predicate now has a development-only migration (`072`), exact-scope RLS and service recheck, synthetic fixture memberships, and negative hermetic/restricted-role test cases. The local nine-file lane passed 94/94 tests and typecheck passed. The disposable PostgreSQL/HTTP lane could not run without approved injected settings, so the new SQL and revocation test remain unverified live. This does not implement the shared authority envelope, durable required receipts, derivatives, or full threat matrix, and does not change the policy/reviewer/status gates.
