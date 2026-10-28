---
epic: 9
date: 2026-10-27
verdict: rejected
criteria: declared
headless: true
---
# Epic9 local retrospective — release acceptance incomplete

## Epic summary and assumptions

Partial, headless retrospective selected explicitly for the active Epic9, not auto-detected. Brooks owns architecture/delivery; Woz guidance applied in the existing sole writer. No independent developer review or invented team discussion. User-authorized direct self-check replaces reviewer delegation. Product independent authorized human approval remains unchanged.

Local9.1–9.3 are accepted in their source specifications.9.4 remains in-progress: local browser/accessibility evidence and release packet are prepared, while actual humans, authorized deployment/visual acceptance, hosted CI and operational rollback are unperformed. The rejected verdict is based on these known unmet declared criteria, NOT on absence of sprint-status data. No human override is claimed.

Actual retrospective skill/references, workflow/config resolvers were read/run; prepend/append/facts/on_complete were empty. No sprint-status.yaml exists, so script-backed story completeness and previous action-status transitions were unavailable; no replacement tracker or fabricated sprint key was created. This partial evidence review proceeds under the headless Assumptions trail, not a claim of the full automated sprint-mode workflow.

## Evidence inventory

Range `103f5206a460b74bc88b1677c3dc457c8375f979..0c274294ba57123b1167a0b103f3943e3e7781f1` includes9.1's first commit. Bundled git_evidence.py ran with9.1–9.4 and produced Operations `admission23-retro-git.json`: six commits, zero merges. Subjects omit numeric story IDs, so script story associations are empty; association below comes from actual specs/files, not invented Git inference.

-9.1: `49b76c907fde0d020e403d592f793e231bf0f79b`, retained design manifest/strict routes/states and human protocol.
-9.2: runtime `700dd15b6063ff35f529379a9c9c2624b3fcd6c3`, acceptance docs `27f1ecd3bd7c1f937bdeea82d2427f9713f2363f`, actual governed surfaces/packed browser assets/negative journeys.
-9.3: runtime `81cecb7bd7937486c79ffb9a01a16050b0063254`, acceptance docs `21147f0e6c73c51cd4c6aba7a3b6396b80a55719`, persisted interactive graph/selection/List/camera/current authority.
-9.4 local candidate: `0c274294ba57123b1167a0b103f3943e3e7781f1`, real route/viewport/axe/keyboard tests and defects fixed. Final exact CI/package receipts and human release procedure are indexed in [release packet](release-acceptance-2026-10-27.md).

Source tests/specs, current actual diff and recorded browser logs/screenshots are available. Hosted/deployed/human results are not. Aggregate analysis was narrowed to changed UI/service/transport boundaries, spec reconciliation and source-linked observed defects; no independent code review, full duplication/cycle/god-class audit or new proof of production performance is claimed. Compact source lines are not a proxy for simplicity. No broad style refactor was performed.

## Findings and dispositions

- Architecture: UI invokes governed same-origin routes via `dashboard-transport.ts`; graph reuses `retrieval-api.ts` persisted same-scope relationships, never a new authority or inferred people graph. Capability displays do not authorize mutations. Accept this boundary; preserve current-authority denial tests when adding any later module surface. Sources:9.2/9.3 specs; dashboard HTTP/transport/browser tests in exact CI.
- Race correctness: late inspector/access work required generation fencing, not merely aborting fetch.9.2 tests now exercise late replies and preserve needs-evidence/rejected states without semantic promotion. Accept fixed behavior; keep exact asynchronous negative journeys. Sources: `ui/main.tsx`, `dashboard-browser.test.ts`, admission20 logs referenced in9.2.
- Accessible controls: axe exposed graph visible-name mismatch and non-focusable scrolling JSON; keyboard tests exposed confirmation initial focus. Fixed all sibling data surfaces and selected Cancel as safe initial focus. Accept fixes, retain tests. Sources: `admission22-axe-check.log`, `admission22-axe-check3.log`, `admission22-focus-check.log`; final `controls.tsx`, `main.tsx`, `access-panel.tsx`, `device-approval.tsx`, `memory-map.tsx`.
- Visual evidence: a green no-horizontal-overflow assertion missed unusably narrow tablet graph inputs. Screenshot self-inspection found it; explicit width red case and bounded flex basis corrected it. Accept fix; retain source-specific geometry assertions plus actual screenshot inspection rather than claiming all layout quality from a scanner. Sources: `admission22-tablet-red.log`, `ui/graph.css`, `dashboard-surface-browser.test.ts`, exact-CI tablet screenshot.
- Browser runtime: actual Node Playwright scenarios with Bun-owned HTTPS/restricted database fixtures are exercised. Loading browser code under Bun had failed earlier; no simulated browser substituted. Accept this tested fixture split. Sources: `tests/browser-runtime.ts`,9.2 evidence.
- Reliability unknowns: historical recovery_startup_failed and admission22 graph unknown/timeouts were observed; later full/exact runs pass. Defer root-cause claims, not the facts. Brooks/Woz must preserve sanitized diagnostics and investigate any recurrence during staging without weakening deadlines or combining failed and green receipts. Sources:9.2/9.4 specs and admission22-axe-check2.log.
- Acceptance gap: actual independent human tasks and authorized deployed/rollback/hosted evidence remain missing. Fix at the release boundary after Sabir supplies authority, not by relabeling automated fixtures as humans. Sources: epics.md9.4,9.1 human protocol,9.4 checklist, release packet.

## Behavior verification

Fresh exact six-lane `bun run ci 0c274294ba57123b1167a0b103f3943e3e7781f1` passed at2026-10-27T19:32:07-04:00:194tests/1767assertions,579 actual Chromium assertions across9 scenarios. The system exercised real signed HTTPS/current restricted PostgreSQL, persisted approvals/corrections, graph inspection/pan/zoom/List, denial/revocation/stale responses, access/device actions, fresh audit exports and bounded indexing, not just scaffold functions.27 route/viewport screenshots,28 axe scans with zero reported violations; forced-colors dialog incompletes still need manual assessment.74 packaged inputs/archive hash and all six lane log/source/lock/invocation identities verified. Exact receipts are in the release packet. These observations do not certify accessibility, usability or a deployed service.

## Previous-retro follow-through

Epic8 requested exact retained design/human protocol followed by governed UI and interactive graph;9.1 manifest/protocol and9.2/9.3 actual behavior supply that local evidence. Its caution to preserve6.5/9.4 actual-human/deployed requirements still applies. Epic6 extracted-package, restricted-role, native model, restart/recovery and complete synthetic journey tests remain in current exact CI; deployment/operational requirements remain open. No previous sprint action statuses were changed.

## Next owners and acceptance verdict

Subsequent owner decision after admission23: Sabir approved [dependency-ready LOCAL10 then11](../planning-artifacts/sprint-change-proposal-2026-10-27-local-10-11.md), keeping release checks open. This resolves the local sequencing boundary below; the full Epic9 rejected/incomplete acceptance verdict remains accurate.

Sabir: authorize an isolated staging target, allowed hosted push/CI scope separately, identity/onboarding and independent participants, or provide a specific new Correct Course decision for local10/11 continuation while retaining9's release requirements. Brooks: bind that authority to exact bytes, retain unmet requirements and stop rather than infer approval. Woz: execute only the authorized target/flows and fix demonstrated defects with retesting. These are proposed release actions, not actions already performed or a new board.

Verdict: rejected for full Epic9 acceptance because declared9.4 human/deployed/rollback/hosted criteria are unmet. Local implementation and automated evidence are verified; rejection is not an invented code-review blocker. Epic10/11 prerequisites remain as cataloged. Optional7 and deferred12–14 were not adopted. The existing Correct Course exception explicitly covers6.5, not a blanket waiver of later gates. No whole-product completion claim or acceptance override.
