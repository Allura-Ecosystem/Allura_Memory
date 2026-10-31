---
title: '1.2–1.3 Review reconciliation: authority and persistence contracts'
type: documentation
created: '2026-10-31'
status: done
route: dispatch
baseline_commit: 68af289561b052a42b56bbccda24d0f3d74f34df
review_loop_iteration: 0
context:
  - '{project-root}/guidelines/ALLURA-BMAD.md'
  - '{project-root}/_bmad-output/planning-artifacts/stories/1.2-authority-and-service-contracts.md'
  - '{project-root}/_bmad-output/planning-artifacts/stories/1.3-persistence-and-security-contracts.md'
---

<frozen-after-approval reason="bounded contract reconciliation under explicit continuous BMAD development/review direction">

## Intent

Resolve the independently identified Epic1 authority/persistence contract contradictions by documenting the already-adopted stricter implementation and later owner-linked client authority. Preserve historical adoption and decision provenance. Do not change implementation or rewrite acceptance criteria to manufacture a pass.

## Boundaries

Preserve ordinary machine/device ceilings, Sabir's legitimate explicitly owner-linked authority, individually approved immutable Gabe/Sam sharing, independent authorized human promotion, consent, tenant/workspace isolation and append-only evidence. No new authority, deployment, public routing, remote push, live credentials/grants/data change, SSH, automatic promotion or adoption of deferred Epics12–14. No changes to runtime source, migrations, dependencies, tests, inventories, story acceptance text or historical receipts. Source presence and source inspection are not executed test evidence.

## Acceptance matrix

1. Clarify deletion authority by identity class: ordinary machine/device ceilings remain; only explicitly owner-linked clients intersect current owner/delegation/credential authority, with no human-only powers or fallback.
2. Clarify grantless tenant-member admission separately from command-specific permission, preserving exact participant, current-role, scope, consent, revision and state checks; admission supplies no workspace content grant.
3. Clarify different-human and service-created nominations remain pending until the exact active nominee accepts, with current creator authority revalidated; decline and denial never create a workspace or initial grant.
4. State active tenant as an independent RLS prerequisite; active membership cannot override disabled tenant state.
5. State the complete existing base authority lock set and applicable later owner-link extension, including current-authority protected-read boundaries. Do not invent tenant-row concurrency evidence or remove other credential-class requirements.
6. Date the reconciliation as current, retaining original adoption dates/owner-decision provenance and later-contract attribution. Map every change to actual final source, existing executed cases where available and explicit proof limits. Preserve unperformed historical, hosted, client and human acceptance, especially6.5/9.4. Do not close Stories1.2/1.3 or Epic1 merely because prose was edited.

</frozen-after-approval>

## Inputs and plan

Use the parent-checked six exact OLD→NEW replacements in `/home/sabira/.hermes/profiles/troy/reports/allura-story-review/epic1-contract-reconciliation-proposal.md` (SHA25612e678d1dbfed04530c0116c39a5e62ef02e615d951110c35688b5966031d5a7), plus its existing parent-check receipt. Revalidate every OLD occurrence and primary source against the current committed baseline before applying. The current baseline differs from the proposal snapshot only by the separately completed runner remediation; no contract/runtime authority change is inferred.

Read actual installed bmad-build SKILL, resolve customization/config against this repository and follow rendered step03. The missing TEAM-RAM-RUNTIME maps only to guidelines/ALLURA-BMAD.md plus loaded Team RAM skill. Latest user direction explicitly supersedes historical direct-self-check-only developer review and SSH prerequisite. Independent developer review is required; product human approval remains separate. No shadow sprint-status file or operational board mutation.

Apply four authority-v1 replacements and two persistence-v1 replacements, with a short dated reconciliation note distinguishing original contracts from later adoption. Produce a narrow acceptance/evidence matrix for the affected1.2/1.3 criteria. Capture the old contradictory clauses before edits as documentary defect evidence, not a fabricated runtime TDD failure. No production behavior changes are intended; if source contradicts the proposed NEW wording, stop that edit and report the exact discrepancy instead of altering behavior or expanding policy.

## Exact writer allowlist

- `_bmad-output/planning-artifacts/contracts/authority-v1.md`
- `_bmad-output/planning-artifacts/contracts/persistence-v1.md`
- `_bmad-output/implementation-artifacts/epic1-authority-contract-review-matrix.md` (new bounded evidence matrix)
- This spec: append evidence/status outside frozen block only.

No other canonical writes. Parent alone owns review/closure/commit. Tests needing new behavior or expanded negative/concurrency coverage are recorded with their exact owning implementation story and proof limit, not silently claimed covered or patched inside this documentation slice.

## Verification

Read actual authority/access/persistence code, SQL001/002/021 and later credential-class wrappers as necessary to ensure the wording is not broader than implemented current authority. Cite exact paths/lines and separate ordinary machine, owner-linked and selected identity classes. Map current registered tests without treating a source match as runtime evidence. Explicitly retain missing historical ENT-01/private receipts and any dedicated tenant-lock/nomination-negative matrix gap.

Run check:toolchain, typecheck, lint, test and test:db from foundation using pinned Bun1.3.14/Node24.19.0 and the existing disposable owned DB harness. Preserve all cases/floors; no selection override, implicit downloads or live DB target. Return actual nonzero counts and logs, no overlapping preflight double-counting, original containers preserved, exact diff/new files, frozen-intent hash and unrelated-file preservation. Whitespace-check new files too. Parent independently verifies final bytes, reviews the actual contracts/matrix, runs applicable gates and governance before any local commit. External acceptance and legacy outcome-write hold remain open.

## Woz step03 receipt — 2026-10-31; candidate, not closed

- Executed the installed bmad-build renderer once and resolved workflow customization/central config against this exact repository; all exited 0. Read the rendered step03 and every spec-context file. Existing baseline/status remain unchanged. This worker is the delegated single Woz writer; no nested agent ran. Missing TEAM-RAM-RUNTIME was mapped only to the actual adapter plus loaded Team RAM. Network/Brain retrieval and completion writes were not authorized in this worker slice and were not attempted. Parent owns independent review and the next step04 gate; historical no-review/SSH instructions do not override current direction.
- Revalidated the proposal SHA256 and all six unique OLD strings against unchanged admission/HEAD contracts, then read the primary authority/access/persistence TypeScript and SQL001/002/021 plus applicable device/OAuth/selected-class boundaries. Applied exactly four authority and two persistence clarifications; no primary-source contradiction was found. Added dated notes distinguishing original 2026-10-26 provenance from later 2026-10-30 owner-client adoption. Historical story criteria, supplied private ENT-01 receipt and original self-check prose are preserved, not reaccepted.
- Added the [bounded criterion/source/current-test/proof-limit matrix](epic1-authority-contract-review-matrix.md). Old clauses are documentary defect evidence, not fabricated behavioral RED. Existing registered cases were checked against actual canonical execution. Dedicated tenant-lock concurrency, creation decline/human-creator revocation/complete no-partial-activation negatives and missing historical private/protected proof remain explicit; no source-only assertion is presented as runtime evidence.
- All five unchanged canonical gates exited 0 with pinned Bun 1.3.14 / Node v24.19.0: `bun run check:toolchain`, `bun run typecheck`, `bun run lint`, `bun run test`, `bun run test:db`. Unit: 161 pass / 3,174 assertions across 29 files; full DB: 280 pass / 3,804 assertions, zero failures/skips/missing cases. Unique total: 441 tests / 6,978 assertions. Distinct overlapping DB preflights: OAuth/browser 40 / 502 and client-authority 12 / 160, each exit 0, not added to the total. No runner repair was restarted or test selection/floor changed.
- Existing owned disposable harness used PostgreSQL 16.15 with its pinned image. Exact container `allura-direct-test-52960175-9413-4e88-8fb7-69ea88e946fc` removal was verified; all 12 pre-existing container IDs/names/states remained identical. Original services and live credentials/grants/data were untouched.
- Evidence directory: `/home/sabira/.hermes/profiles/troy/reports/allura-story-review/contract-reconciliation-woz/`. `gate-receipts.json` contains every canonical command/exit/log/hash; `workflow-commands.json` records renderer/resolvers; `documentary-defects-before.json`, `replacement-checks.json`, `mapped-case-execution.json`, `test-summary.json`, `source-hashes.json`, `candidate.diff` and `verification.json` preserve exact documentary/test/source/diff/preservation evidence.
- Only the four allowed Markdown paths changed. Final candidate whitespace checks include both untracked files without staging. Admission tracked-file preservation, original spec-prefix preservation, unchanged frozen intent and exact six replacement checks are recorded in the final receipt. Parent independently verifies these candidate bytes before review/commit.
- **No acceptance/status closure:** this spec remains in-progress; no story/catalog/operational status was updated. Independent BMAD review, parent reruns/governance and epic retrospective are parent-owned subsequent gates, not writer receipts. Hosted/actual-client/human/operational acceptance, especially 6.5/9.4, remains open. No staging/commit/push/SSH/deployment/install/download, live DB/grant mutation, profile/goal/config edit, external outcome write or semantic promotion occurred.

## Review Triage Log — 2026-10-31

All four installed BMAD layers completed against frozen diff `73ffe98846c1b548145bdc1f3035e91a6667cdce291a279a4bcc6776fdd589a0`. Blind Hunter supplied three grounded findings, not an invented seven to meet its requested floor. Edge Case Hunter and Verification Gap Reviewer reported none; Acceptance Auditor reported no substantiated R1–R6 violation and verified all 1,385 source hashes. Their bounded results do not establish whole-story acceptance.

| ID / source | Verdict | Route | Parent evidence and action |
|---|---|---|---|
| BH1 / blind-hunter | medium | patch | The newly expanded command map omitted existing org-admin membership removal (`access.ts:9`; SQL002:126–133), leaving a tenant-wide revocation operation outside the mapped authority description. Added the actual null/self-target and unlocked-workspace last-admin guards, without new permission. T8 proves last-admin denial only, not exhaustive removal behavior. |
| BH2 / blind-hunter | medium | patch | New command-map/matrix audit wording could be read as universal successful-transition proof, but SQL002:44–56,101–103,114,137–149,166 returns from nomination/request/expiry paths without access-audit insertion. Wrapper and migration-reference inspection found no compensating write. T10 injects a grant-audit failure only. Added exact implementation/requirement discrepancy and proof limit while preserving the required atomic-audit obligation; the existing runtime gap belongs to Story 2.3 and remains open, not fixed or accepted by prose. |
| BH3 / blind-hunter | medium | patch | The new owner-class reconciliation and retained human-only audit/health rows conflict within this candidate. `operations-api.ts:15–18`, `operations.ts:14–20`, `authority.ts:13–16,37–41,63–75` and client T1 establish machine routes plus explicit current-action intersection. Corrected those rows for explicitly owner-linked service clients, retaining ordinary/device/selected ceilings and no human impersonation; no broader machine grant or new runtime surface. |

### Review Findings

- [x] [Review][Patch] BH1: document existing membership-removal authority and bounded test coverage.
- [x] [Review][Patch] BH2: distinguish grant-audit rollback proof from unaudited state-transition paths; preserve the requirement and owning implementation gap.
- [x] [Review][Patch] BH3: reconcile audit/health rows with existing explicit owner-linked authority, without ordinary-machine elevation.

No findings were merged or silently dropped; none was rejected. These are direct documentary corrections within the frozen intent, not new product decisions or changes to story criteria. Source/test/SQL behavior is unchanged. The completed Woz cannot be continued through the native active-child steering interface, so the parent used installed build step04:110's direct-patch fallback with no active writer/reviewer. The original six-replacement writer receipt remains historical; the added corrections are explicitly dated separately. No operational sprint/status sync or outcome memory write is authorized; the legacy outcome-write hold remains.

## Parent bounded completion — local documentation only

Pike and Fowler independently APPROVE the final documentary patches and BH1–BH3 dispositions, with no remaining blocking documentary finding. Both verified final review diff `6199907cdba16394055b5244a047bb243f1389e7f89357b73d6e5d7929a5d960`, all four candidate hashes, all 1,385 admitted source hashes and the unchanged frozen intent. Their reviews are static, not new runtime or human acceptance.

Parent independently reran all five canonical gates on that frozen candidate: each exit 0; 29 unit files / 161 tests / 3,174 assertions, full restricted-postgres 280 tests / 3,804 assertions; unique total 441 tests / 6,978 assertions, no failures/skips/missing cases. Overlapping preflights are not added. All 1,385 source hashes and 12 original container IDs/names/states were preserved. Exact candidate secret scan had zero findings. The first final whitespace check caught an extra EOF blank line in this spec; that failed receipt is retained and the final metadata pass removes it rather than hiding it. Evidence: `/home/sabira/.hermes/profiles/troy/reports/allura-story-review/contract-reconciliation-parent-final/`.

Only this spec's completion metadata and EOF whitespace changed after review/testing; the three reviewed contract/matrix documents and all executable/test/SQL bytes remain unchanged. Final-byte hygiene/secret checks and scoped governance precede the owned local commit; their receipts bind the actual commit candidate separately from the frozen review diff. No deployment, push, live credential/grant/data change or operational status update is implied.

This marks the bounded documentary repair done, not Stories 1.2/1.3, Epic 1 or the overall product. Story 2.3's audit implementation discrepancy, tenant-lock concurrency, creation-negative and owner-client end-to-end proof, historical private ENT-01/protected evidence, and actual-human/hosted/installed-client acceptance (including 6.5/9.4) remain open. The legacy outcome-write hold prevents an outcome memory write; governance evaluation is not an audit receipt or product approval.
