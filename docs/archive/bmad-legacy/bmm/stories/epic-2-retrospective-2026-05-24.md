# Epic 2 Retrospective: Governed Dashboard Foundation

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model.
> Content has not yet been fully reviewed — this is a BMAD retrospective artifact, not a final specification.
> When in doubt, defer to Notion Work Board state, source code, validation output, canonical docs in `docs/allura/`, and team consensus.

## Epic Reviewed

- Epic: `2 — Governed Dashboard Foundation`
- Local story completion: `4/4` stories marked `done` in `_bmad/bmm/stories/sprint-status.yaml`.
- Canonical board caveat: Notion Work Board update is pending because no Notion tool is available in this runtime.
- Brain query: `Epic 2 retrospective Governed Dashboard Foundation blockers decisions outcomes`.
- Drift classification: `none` for retrospective readiness; known board reconciliation remains pending.

## Completed Stories

1. `2-1-build-thin-dashboard-shell-and-route-contract`
   - Established the dashboard shell, route contracts, source/degraded declarations, and dashboard guard baseline.
2. `2-2-add-honest-system-hygiene-and-approval-panels`
   - Added honest system, hygiene, and approval panels without fabricated health or proposal counts.
3. `2-3-implement-dashboard-empty-and-degraded-states`
   - Added shared empty/degraded route state guidance and kept graph failures non-crashing.
4. `2-4-preserve-allura-separation-and-cutover-boundaries`
   - Enforced `/dashboard` versus `/allura` route-family separation, kept `3100` protected until Epic 5 evidence, and added approval-audit role/SoD coverage.

## What Went Well

- The epic preserved truthfulness as a product invariant: every panel and route needed source/degraded language rather than optimistic placeholders.
- Pike/Fowler review found material blockers early enough to correct them, especially around generated degraded titles, route-family ownership, production audit wiring, and duplicate legacy audit inserts.
- TDD was useful: Story 2.3 and 2.4 both recorded meaningful RED failures before implementation.
- The `/allura` Mission Control boundary survived the dashboard foundation work; no `/allura` route files were changed in Story 2.4.

## What Did Not Go Smoothly

- Review repeatedly uncovered evidence and integration gaps after initial implementation, showing that local story completion can still outrun production-path proof.
- Story 2.4 initially tested helper behavior before proving the production approval route passed role/SoD metadata into the audit path.
- Combined test execution exposed mock pollution in the route test; individual passing tests were not sufficient evidence.
- Notion status remains pending because this runtime lacks board tooling.

## Lessons Learned

- Boundary stories must test the route family, not just exact paths. `/allura`, `/allura/child`, query strings, and fragments all matter.
- Audit helper contracts are insufficient unless production routes pass the required metadata and remove bypassing legacy writes.
- Combined targeted test runs catch cross-test mock pollution that separate file runs can miss.
- `3100` cutover protection belongs in an explicit contract until Epic 5 provides parity, auth, smoke, no-fabrication, and rollback evidence.

## Action Items

| Priority | Owner | Action | Success Criteria |
| --- | --- | --- | --- |
| P0 | Brooks/Scout | Before Epic 3 starts, run the drift gate for Story 3.1 and confirm provenance/read-side scope against Brain and local schemas. | Story 3.1 does not move to Ready without drift evidence and validation targets. |
| P0 | Woz/Knuth | Treat read-side memory UI as scoped, read-only, and provenance-preserving; no approval/mutation affordance enters Epic 3 stories. | Epic 3 tests prove `group_id` scoping and no mutation side effects. |
| P1 | Pike/Fowler | Keep combined targeted test runs for stories that touch mocks and route/API contracts. | Review evidence includes at least one combined command when tests share modules. |
| P1 | Brooks/Hightower | Restore or provide Notion board tooling before relying on board state updates. | Local statuses can be reconciled with actual board receipts. |

## Next Epic Preparation

Epic 3 is `Memory Provenance and Review`. It depends on Epic 2 work and must preserve these constraints:

- `/dashboard` read-side surfaces remain truthful and scoped.
- Memory detail, listing, copy, and export preserve provenance rather than inventing missing evidence.
- No approval, rejection, promotion, deletion, or semantic mutation action is exposed in Epic 3 read-side stories.
- All query/list/detail/export paths carry `group_id=allura-system` for this project unless a story explicitly defines another valid `allura-*` tenant.
- Notion remains the canonical board; local BMAD status is reconciliation only.

## Closeout Decision

Epic 2 is locally complete and ready to proceed to Epic 3 with caveats:

- Notion board update remains pending.
- Browser/visual screenshot evidence remains limited in this runtime; current completion is based on targeted contract/unit/type validation and review evidence.
- Epic 5 still owns `3100` cutover and rollback proof; Epic 2 did not approve replacement of the protected target.
- Brain outcome memory: `a5fecf0a-e1c1-467c-b0ea-a594f38f8e31`.
