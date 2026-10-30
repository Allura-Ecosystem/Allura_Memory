---
title: '9.4 Operator acceptance evidence and human release boundary'
type: feature
created: 2026-10-27
status: in-progress
route: dispatch
baseline_commit: 21147f0e6c73c51cd4c6aba7a3b6396b80a55719
---

## Intent and boundaries

Exercise the actual9.2/9.3 interface across approved routes, identities and viewports, while keeping automated self-check separate from independent authorized humans and deployed acceptance. Existing9.1 task protocol is controlling. No independent developer-review agents, invented witnesses or deployment permission. No source/brand redesign, production credentials, optional modules or new policy grants.

## Existing evidence / code map

Runtime81cecb7bd7937486c79ffb9a01a16050b0063254 passed exact six-lane192tests/1764assertions. `foundation/tests/dashboard-browser.test.ts`, `dashboard-admin-browser.test.ts`, `dashboard-graph-browser.test.ts` already exercise actual signed multi-principal/current grant, independent product decision, stale409, exact ambiguous retry, correction, audit/device/access, graph filters/pan/zoom/keyboard and revocation clearing against HTTPS/restricted disposable PostgreSQL. This is synthetic local identity evidence, not actual human acceptance. `dashboard-contract.ts` enumerates the approved routes; `dashboard-browser-fixture.ts` builds the current actual UI. New `dashboard-surface-browser.test.ts` expands route/viewport/name/size evidence, not a mock acceptance.

## Tasks / acceptance

- [x] Given all approved routes at1440/820/390px, actual authenticated pages render without screen errors or horizontal document overflow; visible buttons have accessible text/aria-label and44px minimum height. Save actual screenshots and enumerated source-local observations; require nonzero case discovery. Graph uses actual data and phone List default. Existing flow tests remain mandatory.
- [x] Exercise remaining applicable local focus/ARIA/contrast and multi-user negative cases; inspect actual screenshots against retained manifest. Any scanner/tool output is a limited check, not accessibility certification. Real-human assistive-technology evaluation remains open.
- [x] Freeze exact tested runtime/archive/receipts and prepare minimal staging/human task packet: target isolation, identity/onboarding owners, participants, task results, rollback/restore preservation. Do not execute release actions without explicit scoped authorization.
- [ ] Actual authorized independent human tasks, exact deployed target/visual acceptance, hosted CI and operational rollback evidence. These are NOT locally satisfiable by agent assertions. Keep9.4/Epic9 open until observed; any later epic sequencing must respect current approved dependency gates.

## Verification

Real browser fixture plus typecheck/lint, mandatory test-db discovery and full/exact CI for final code. Reports under direct-build Operations are execution evidence, not a task board. At the admission boundary record exact owned files/hashes and remaining specific work. No whole-product completion claim.

Admission22 local evidence: `admission22-accepted-full.log`, `bun run check:all`, exit0 at2026-10-27T19:17:06-04:00;194tests/1767assertions plus579 actual Chromium assertions across9 scenarios. `admission22-accepted-screens/surface-observations.json` enumerates all27 route/viewport combinations.28 axe4.14.0 scans have zero reported violations; forced-colors dialog scan retains manual/incomplete aria-hidden-focus and color-contrast checks, not a certification. Keyboard tests directly verify focus containment/Cancel-first/escape/restoration/no writes; real assistive-technology/human tasks remain open.

Red-first findings fixed: graph button accessible name omitted visible lifecycle/version and adjacent DOM text lacked a separating space; scrollable structured data lacked keyboard focus; confirmation first focus was not Cancel. Actual tablet screenshot inspection then found collapsed root/depth controls despite no document overflow; `admission22-tablet-red.log` reproduces insufficient input width, bounded flex bases fix it and all viewports pass. Visible zoom labels replace ambiguous symbol-only controls. Retained protected assets unchanged; no authority changes. `admission22-axe-check2.log` also observed transient graph unknown/timeouts; subsequent focused/full gates pass, but no causal network repair is asserted. Exact clean-source CI/archive and release packet were subsequently verified in admission23 below; Story9.4 remains in-progress.

## Frozen candidate / release boundary

Subsequent approved sequencing amendment after admission23: [local10–11 Correct Course](../planning-artifacts/sprint-change-proposal-2026-10-27-local-10-11.md) supersedes the stop-before10/11 conclusion below. Local9.4 result accepted for that continuation; this story remains in-progress for external release/human acceptance. No missing acceptance is relabeled performed.

Runtime `0c274294ba57123b1167a0b103f3943e3e7781f1` contains the owned14-path implementation. Fresh exact six-lane CI passed at2026-10-27T19:32:07-04:00,194tests/1767assertions plus579 Chromium assertions/9 scenarios. Source, lock, invocation and six log digests verified in Operations `releases/0c274294ba57123b1167a0b103f3943e3e7781f1/allura-ci-9MUisw/attempt.json`.27 enumerated route/viewport combinations and28 axe scans were read/aggregated, zero reported violations; forced-colors manual incompletes retained.

Actual `bun scripts/pack-core.ts` produced the clean-source archive with SHA256 `4c0952f220f9ba95010280ab31c4cab1e0042497ae590ad3b662f14cc178d87d`; archive bytes and all74 shipped input hashes verified. [Release acceptance packet](release-acceptance-2026-10-27.md) binds exact paths, unperformed human tasks, use instructions, authority/onboarding owners and evidence-preserving operational rollback requirements. [Partial retrospective](epic-9-local-retro-2026-10-27.md) rejects FULL Epic9 acceptance while recognizing verified local behavior; no independent developer review occurred.

No additional ordinary local design choice is needed to perform these already-implemented flows. Remaining9.4 acceptance needs a named authorized staging/hosted/identity/human/rollback scope. Per current catalog/Correct Course, later10/11 work is not silently admitted over this distinct9 gate. Seek scoped release authority or a specific new local-continuation sequencing decision. No product completion, deployment, actual-human signoff or remote status write is implied.

## Private hosted browser follow-up

The subsequently approved private CI run `41007092459` at `1ea476ec4098911d57af4c49ca174534257b1df7` passed the cold-cache unit regression (124 tests / 1,677 assertions) but retained one actual browser failure: Chromium discarded a response body before the test called `Response.json()`. The failure view already contained the rendered indexing receipt. This is not evidence of missing indexing or permission failure, and the failed run remains failed.

Bounded test-only repair in `foundation/tests/dashboard-admin-browser.test.ts`: assert the actual displayed `Decision outcome` / `Structured service data` receipt contains exactly one job, retaining the independent database assertion of exactly one vector and all device approval/revocation checks. Remove only the race against CDP response-body retention; do not relax permissions, add retries, increase timeouts, skip a case or change application UI. The hosted failure is the observed RED. Three separate actual-browser diagnostic runs then passed; the owned diagnostic DB was removed. Full installed `allura-dev run check:all` passed with 193 DB/browser/package tests / 2,021 assertions and no missing required case, plus unit/typecheck/lint lanes. A fresh hosted six-lane attempt remains required; earlier failed runs stay failed. Original production and beta runtime remain untouched; real human acceptance is still open.

Run `41008173920` at `288b5b2b1b149e61970f2c8baba9a455a7daf5ff` passed the receipt scenario but exposed a separate keyboard synchronization error: Tab was sent immediately after navigation, before React mounted the skip link. A diagnostic using the real app with delayed module evaluation reproduced `Received: inactive` without readiness and passed with the rendered-control wait. `dashboard-surface-browser.test.ts` now waits up to the existing 5-second expectation bound for the skip link to attach, then uses the original keyboard input and unchanged focus/cancel/no-write assertions. No programmatic skip-link focus, retry, test skip or UI change. Full installed checks passed: 317 tests / 3,698 assertions, zero failures or skips, owned DB removed. This is local GREEN; a fresh exact hosted attempt is still required.
