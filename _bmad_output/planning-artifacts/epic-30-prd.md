# Epic 30 — Product Requirements

Updated 2026-09-17. Status: consolidated requirements draft, not design approval. This restates accepted scope; it introduces no new product requirements.

## Purpose and users

Provide one browser-first My Work workspace for owner-private knowledge and approved department knowledge. Private content is owner-only, including against administrators. Server-verified tenant, workspace, principal and delegation control every disclosure. Department membership, roles, permissions, explicit denial and invitations remain separate predicates.

Contractors may contact named project-owner/project-manager roles. Project channels require a current invitation independently approved by the project owner and workspace membership administrator. Invitations never grant project Brain browsing.

## Required outcomes

The [epic requirement map](./epic-30-governed-digital-brain-workspace.md#requirement-to-story-and-dependency-map) assigns each requirement E30-R01 through E30-R13 to exactly one lead story:

1. One authority and honest readiness evidence.
2. Approved exact design artifact, variances and user-test protocol.
3. Shared deny-by-default authorization/threat contract.
4. Restricted app role, forced RLS and immutable audit.
5. Server-derived workspace scope and quarantine for unclear legacy records.
6. Shared authorized read services, including derivatives and revocation.
7. Private/department tree, memory tabs, primary reader and at most one comparison pane.
8. Authorized search, text links, backlinks and focused lineage.
9. Collapsed read-only Ask with grounded answers and openable authorized citations.
10. Restricted contractor discovery, contact and invited messaging.
11. Independent integrated review, exact-SHA CI and merge-blocking controlled-red proof.
12. Five distinct humans; at least four successes per task, no critical error or unauthorized disclosure.
13. Reconciled release evidence, receipts and accepted retrospective.

All user-facing surfaces support loading, empty, forbidden, stale, degraded, conflict, error and complete states; keyboard/focus, screen readers, 320px layout and actual 200% zoom. Denials must not reveal protected names, counts, existence or snippets.

Ask has no tools, mutations, protected-action submission or autonomous actions. Governed content cannot reach a provider until no-retention/no-training evidence is verified. Scope, freshness, uncertainty and unavailability must be explicit. Derivatives cannot widen source authority.

## Non-goals

No organization/project Brain browsing, private sharing/admin override, graph canvas, arbitrary layouts, bulk exports, embedded agent workbench, unrestricted contractor DMs or silent protected actions. Missing features in the saved synthetic reader remain implementation gaps, not scope reductions. Epic 29 desktop/secure-store acceptance remains separate.

## Entry and completion gates

Preparation and the bounded reader foundation are integrated on `main`, in the single canonical checkout. Product implementation beyond that foundation requires approved design/variances, reviewed authorization decisions and human-board reconciliation. All 13 stories remain backlog.

Live tests, verified provider policy, hosted CI, five-human validation, publication and retrospective remain the relevant story/release gates. Live PostgreSQL/HTTP verification is pending by user choice. This PRD claims none of those passes. See [readiness](./implementation-readiness-epic-30.md) and [course correction](./sprint-change-proposal-2026-09-17.md).
