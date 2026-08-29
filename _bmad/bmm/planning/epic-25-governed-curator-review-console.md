# Epic 25 — Governed Curator Review Console

> [!NOTE]
> **AI-Assisted Documentation**
> This repository planning mirror reconciles preserved Epic 25 scope with the tracked story files and authoritative sprint status.
> Private product scope and approvals remain in the linked Notion epic; implementation truth remains in code, tests, PRs, and repository evidence.
> When in doubt, defer to the source code, schemas, tests, and the authoritative sprint record.

**Status:** Done — 25.1 scope/product-truth reconciliation, 25.2a workspace-scope foundation, 25.2b authenticated entry, 25.3a read-contract remediation, and 25.3b module-registry reconciliation all accepted. Retrospective complete 2026-08-28.
**Owner:** Brooks (architecture and trust boundary)
**group_id:** `allura-system`
**Private scope authority:** Notion — [Epic 25 — Governed Curator Review Console](https://app.notion.com/p/3c41d9be65b3819b96c6c9d14a3424ea?pvs=204)
**Repository authority:** [`sprint-status.yaml`](../stories/sprint-status.yaml) for tracked story status; source, tests, PRs, and evidence for implementation truth.

## Goal

An authenticated reviewer sees only tenant/workspace-scoped curator information, inspects evidence, and receives a truthful immutable receipt for any permitted decision. The browser is an optional governed operator surface; MCP/API/CLI remain canonical engine paths.

## UX and design authority

1. [`docs/allura/DESIGN-ALLURA.md`](../../../docs/allura/DESIGN-ALLURA.md) — canonical product and governed-operator design rules.
2. [`docs/design/command-center/operator-surface-contract.md`](../../../docs/design/command-center/operator-surface-contract.md) — approved Epic 25 visual, readability, accessibility, and evidence-first contract.
3. [`docs/design/command-center/project/Allura Memory Command Center.dc.html`](../../../docs/design/command-center/project/Allura%20Memory%20Command%20Center.dc.html) — local implementation handoff prototype; source only, not production code.
4. [`docs/design/command-center/DATA-SOURCES.md`](../../../docs/design/command-center/DATA-SOURCES.md) — live-data/no-fabrication audit.
5. `file:///mnt/projects/git/nexu-io/open-design/.od/projects/allura-enterprise-dashboard-brandlocked/index.html` — approved external local specimen for Epic 25 review flow, modular dashboard shell, evidence-before-action, human-review, and receipt concepts. It declares itself **synthetic / illustrative / not checked** and must never override Allura's canonical product authority, live-data rules, server-owned scope, or approved local operator-surface contract.

## Product boundary

- Server-derived principal, tenant, workspace, role, policy, and capability authority only.
- Evidence is visible before consequential actions; decision success is shown only after a server-issued receipt.
- Unknown, denied, stale, degraded, conflict, and unavailable states are explicit.
- No broad dashboard restoration, caller-supplied authority, direct storage access, or direct `/dashboard/bumblebee` route.

## Tracked story map

| Key | Title | Current status | Evidence / boundary |
| --- | --- | --- | --- |
| 25.1 | Scope/product-truth reconciliation | Historical prerequisite; no retained current story file | Preserved Epic 25 scope record; do not recreate without a source-backed need. |
| 25.2a | Workspace Scope and Evidence Lifecycle Foundation | Done | [`25-2a-workspace-evidence-lifecycle-foundation.md`](../stories/25-2a-workspace-evidence-lifecycle-foundation.md) |
| 25.2b | Authenticated Session Entry Point | Done | [`25-2b-authenticated-session-entry-point.md`](../stories/25-2b-authenticated-session-entry-point.md) |
| 25.3a | Curator Read Contract and Workspace Authority Remediation | Done | [`25-3a-curator-read-contract-remediation.md`](../stories/25-3a-curator-read-contract-remediation.md) |
| 25.3b | Modular Dashboard Workflow Contract Registry | In review | [`25-3b-modular-dashboard-workflow-contract-registry.md`](../stories/25-3b-modular-dashboard-workflow-contract-registry.md) |

## Exit gate

- The current story status and repository evidence agree with the private Notion scope.
- A reviewer can authenticate, receive server-derived scope, inspect scoped evidence, and see only truthful system states.
- Any decision capability remains server-authorized, rationale-bound, and receipt-backed.
- Story 25.3b receives canonical independent-acceptance/status reconciliation before it advances to done.

## Non-goals

- No separate scanner, route, authorization plane, or storage authority belongs to the dashboard.
- No feature beyond the tracked story map is implied by a prototype, a recovered planning file, or a visual contract.
- Future browser workflows require a source-backed story before implementation.
