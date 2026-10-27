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
- [ ] Freeze exact tested runtime/archive/receipts and prepare minimal staging/human task packet: target isolation, identity/onboarding owners, participants, task results, rollback/restore preservation. Do not execute release actions without explicit scoped authorization.
- [ ] Actual authorized independent human tasks, exact deployed target/visual acceptance, hosted CI and operational rollback evidence. These are NOT locally satisfiable by agent assertions. Keep9.4/Epic9 open until observed; any later epic sequencing must respect current approved dependency gates.

## Verification

Real browser fixture plus typecheck/lint, mandatory test-db discovery and full/exact CI for final code. Reports under direct-build Operations are execution evidence, not a task board. At the admission boundary record exact owned files/hashes and remaining specific work. No whole-product completion claim.

Admission22 local evidence: `admission22-accepted-full.log`, `bun run check:all`, exit0 at2026-10-27T19:17:06-04:00;194tests/1767assertions plus579 actual Chromium assertions across9 scenarios. `admission22-accepted-screens/surface-observations.json` enumerates all27 route/viewport combinations.28 axe4.14.0 scans have zero reported violations; forced-colors dialog scan retains manual/incomplete aria-hidden-focus and color-contrast checks, not a certification. Keyboard tests directly verify focus containment/Cancel-first/escape/restoration/no writes; real assistive-technology/human tasks remain open.

Red-first findings fixed: graph button accessible name omitted visible lifecycle/version and adjacent DOM text lacked a separating space; scrollable structured data lacked keyboard focus; confirmation first focus was not Cancel. Actual tablet screenshot inspection then found collapsed root/depth controls despite no document overflow; `admission22-tablet-red.log` reproduces insufficient input width, bounded flex bases fix it and all viewports pass. Visible zoom labels replace ambiguous symbol-only controls. Retained protected assets unchanged; no authority changes. `admission22-axe-check2.log` also observed transient graph unknown/timeouts; subsequent focused/full gates pass, but no causal network repair is asserted. Exact clean-source CI/archive and final human release packet are the next evidence step; Story9.4 remains in-progress.
