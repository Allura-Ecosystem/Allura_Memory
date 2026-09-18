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

2026-09-17: canonical checkout is `main`. The bounded synthetic reader foundation and interrupted repair set are now integrated without the unrelated Epic 29 branch changes. Fresh local evidence is recorded in [current readiness](../planning-artifacts/implementation-readiness-epic-30.md). This story remains backlog: the integrated slice does not implement the full requirement, and no design, authorization-policy, board, live-database, hosted-CI, human-study or release approval is implied. Follow the [consolidated requirements](../planning-artifacts/epic-30-prd.md) and [completed course correction](../planning-artifacts/sprint-change-proposal-2026-09-17.md).

## Historical Evidence — before repository consolidation

Policy defaults are accepted and the provisional v1 contract is documented in `../planning-artifacts/epic-30-local-authorization-contract.md`, including server-derived inputs, deny reason codes, enforcement inventory, derivative rules, audit behavior, and measurable revocation targets. The contract is implemented only for a bounded synthetic local read slice. Independent security/data review and production approval remain open; status stays backlog.

2026-09-17: the exact contract and implementation bindings are now hash-bound in the [authorization approval packet](../planning-artifacts/epic-30-authorization-approval-packet.md), with an adversarial threat matrix and explicit approval record requirements. The maintained focused lane passed 78 tests across 9 files. This prepares review but does not supply human authorization-policy approval, independent reviewer dispositions, live restricted-role proof, or story acceptance; status remains backlog.
