---
title: "Epic 30 — Governed Digital Brain Workspace"
type: epic-plan
epic: 30
status: backlog
owner: Brooks
story_count: 13
implementation_readiness: blocked
---

> Reconciliation note (2026-09-17): the bounded candidate and interrupted repairs were integrated into canonical `main`. Earlier test/demo statements remain historical unless repeated in the current readiness record. Integration does not grant story acceptance.

# Epic 30 — Governed Digital Brain Workspace

## Authority and scope

This is the single local Epic 30 planning authority, not an implementation approval or a replacement for the Notion human work board. All stories remain backlog.

- Loop authorization and six accepted defaults: Brain `ea28b0bf-7abf-4eae-a048-6fc32c9822ca`, recorded during prior hydration.
- Approved council: Brain `5c3304f9-93e7-4b85-8d78-216eabb5e537`, recorded during prior hydration.
- Full source: `/home/ronin704/.hermes/cache/delegation/subagent-summary-0-20260917_020254_310900.txt`, sections Numbered Story Map, Trust Rules, Controlled-Red Proof Families, and Epic Close Gates.
- Historical planning baseline: `1934d211c239310d498794ec0c5dbaa532faeeb8`, formerly a detached worktree. Current user direction authorizes preparation commits on canonical `main`; it does not authorize a push or wholesale `develop` merge. See the [PRD](./epic-30-prd.md), [current readiness](./implementation-readiness-epic-30.md), and [integration proposal](./sprint-change-proposal-2026-09-17.md).
- [Readiness evidence](./implementation-readiness-epic-30.md). Policy approval does not approve a design hash or settle the detailed authorization contract.

## Accepted defaults

1. Browser-first delivery; Epic 29 B1 Clerk runtime and B2 desktop secure-store evidence stay separate, neither silently closed nor made an Epic 30 dependency.
2. My private Brain plus approved department Brains only. No organization-wide or project Brain browsing.
3. Private content is owner-only: no private sharing, emergency access, or administrator override in MVP.
4. Contractor direct contact is limited to named project-owner/project-manager roles. Project channels require current invitations approved by the project owner and workspace membership administrator.
5. Ask Allura is read-only and cited: no tools, protected-action submission, external model retention, or training on governed content.
6. Five distinct human users; at least four successful users per task, no critical error, and zero unauthorized disclosure. Simulated roles do not count as people.

## Bounded experience

One `/dashboard` front door named **My Work** offers an authorized Brain tree, memory tabs, one primary reading pane, and at most one optional right-hand comparison pane. Text links, backlinks, and focused lineage replace a graph canvas. Search covers authorized private and department content only. A collapsed Ask Allura rail shows openable citations, scope, freshness, uncertainty, and degraded states. Contractor messaging is limited to the accepted contacts and invited channels.

All surfaces expose truthful loading, empty, forbidden, stale, degraded, conflict, error, and complete states; support keyboard and screen readers, narrow screens, and 200% zoom.

### Non-goals

No full graph canvas/Memory Map, arbitrary or saved pane layouts, advanced command palette, bulk export, embedded Hermes/Agent Workbench, autonomous or write-capable Ask agents, unrestricted contractor DMs, silent promotion/sharing/deletion/permission changes/messages, or automatic classification of unclear legacy rows. Existing dashboard and historical visual evidence are not Epic 30 acceptance proof.

## Requirement-to-story and dependency map

Each numbered requirement has one lead story. Downstream stories consume earlier contracts rather than inventing them. Dependencies are prerequisites to implementation, not claims that stories are ready.

| Requirement | Lead story / outcome | Depends on |
| --- | --- | --- |
| E30-R01 | [30.1 Authority and readiness](../implementation-artifacts/30-1-epic-authority-and-readiness.md) | none |
| E30-R02 | [30.2 Approved workspace design and user-test plan](../implementation-artifacts/30-2-approved-workspace-design-and-user-test-plan.md) | 30.1 |
| E30-R03 | [30.3 Authorization and threat contract](../implementation-artifacts/30-3-authorization-and-threat-contract.md) | 30.1, 30.2 |
| E30-R04 | [30.4 Knowledge schema, RLS, and audit](../implementation-artifacts/30-4-knowledge-schema-rls-and-audit-foundation.md) | 30.3 |
| E30-R05 | [30.5 Workspace scope and legacy remediation](../implementation-artifacts/30-5-workspace-scope-and-legacy-remediation.md) | 30.4 |
| E30-R06 | [30.6 Safe read services](../implementation-artifacts/30-6-safe-read-services.md) | 30.5 |
| E30-R07 | [30.7 My Work reading shell](../implementation-artifacts/30-7-my-work-reading-shell.md) | 30.2, 30.6 |
| E30-R08 | [30.8 Search, links, and backlinks](../implementation-artifacts/30-8-search-links-and-backlinks.md) | 30.6, 30.7 |
| E30-R09 | [30.9 Read-only Ask Allura](../implementation-artifacts/30-9-read-only-ask-allura.md) | 30.6, 30.7, 30.8 |
| E30-R10 | [30.10 Restricted contractor messaging](../implementation-artifacts/30-10-restricted-contractor-messaging.md) | 30.3, 30.5, 30.7 |
| E30-R11 | [30.11 Integrated review, CI, controlled red](../implementation-artifacts/30-11-integrated-review-ci-and-controlled-red.md) | 30.4–30.10 |
| E30-R12 | [30.12 Five-user validation](../implementation-artifacts/30-12-five-user-validation-and-remediation.md) | 30.2, 30.11 |
| E30-R13 | [30.13 Release evidence and retrospective](../implementation-artifacts/30-13-release-evidence-receipts-and-retrospective.md) | 30.11, 30.12 |

## Non-negotiable trust rules

- Verified server state owns tenant, workspace, principal, delegation, and run scope. Browser fields select resources, never grant authority. Missing/stale/conflicting/degraded authority fails closed.
- Ownership, department membership, role, permission, explicit denial, and project invitation remain distinct facts. Administration is not private readership.
- One authorization decision contract governs UI, API, MCP, search, backlinks, chat, AI, and workers. Agents get only the intersection of user authority, delegation, resource policy, and tool policy.
- Protected database paths require restricted `allura_app`, `NOBYPASSRLS`, forced RLS, and transaction-local scope. Detailed implementation awaits 30.3 and current documentation before code changes.
- Authorize search candidates before scoring where possible and again before returning content, names, counts, snippets, facets, pagination, or citations. Relationships require permission for both disclosed endpoints and the relationship.
- Summaries, embeddings, citations, caches, and other derivatives never widen source access. Revocation invalidates future reads, cursors, channels, runs, and delegated capabilities; 30.3 must define testable timing bounds.
- Unclear legacy records are quarantined, not guessed. Protected changes and external effects need approval, immutable audit evidence, and receipts. No hard-coded production tenant, caller-selected principal, permissive workspace fallback, or anonymous authority.

## Validation and close gates

Security proof covers tenant/workspace/private/department isolation; admin denial; forged selectors; absent and pooled-connection scope; role/membership/permission/deny combinations; session/cache/cursor/invitation/delegation revocation; search timing and existence leakage; relationship and derivative leakage; prompt injection and confused-deputy attacks; contractor discovery, mentions, bots, attachments and history; owner/view/function/RLS bypass; audit omission/mutation/replay/outage; legacy quarantine and rollback; unknown route/tool/table/view/function/channel/worker coverage; accessibility regressions.

Close only with an exact approved design hash and variance record; TDD plus independent security/maintainability/data/UX/deployment reviews with no unresolved BLOCK/HIGH; fresh local PostgreSQL restricted-role, migration, revocation, quarantine and rollback proof; browser keyboard/focus/screen-reader/WCAG/320px/200%-zoom proof; five-person task evidence meeting the accepted threshold; exact frozen-SHA green CI and a merge-blocked controlled-red privacy regression; verified story/approval/CI/study/release receipts; origin-main reconciliation and rollback evidence; accepted retrospective and owned follow-ups. Story 30.13 prepares the packet; accept the epic retrospective only once all story delivery gates are satisfied, without premature done labels.

## Execution boundary

One eligible story and one writer at a time; focused independent review, at most two repair cycles per finding. Reuse the council, do not convene another. Local synthetic fixtures only; bind test services to loopback, UI 4000+, API 6000+, documented infra exceptions. No LAN, production DB/data, credentials, or model configuration changes. Browser role simulations are permitted but are not human validation. Stop at approval/publication/human gates or unavailable mandatory tooling. Sprint YAML changes require the sanctioned planning script and evidence; no hand edits.
