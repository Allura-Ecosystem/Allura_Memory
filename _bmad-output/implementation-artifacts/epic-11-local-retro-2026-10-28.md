---
epic: 11
date: 2026-10-28
verdict: accepted-with-open-items
criteria: declared
headless: true
scope: authorized-local-experiment-only
phase: finalized
---
# Epic11 local retrospective — governed disposable experiments

## Epic summary / evidence inventory
Explicit Epic11 invocation;11.1–11.3 are locally accepted with completed numbered specs and exercised original criteria. Declared criteria: `../planning-artifacts/epics.md:154–162` and `../planning-artifacts/contracts/branchable-memory-v1.md`; no upstream adoption, second durable authority, automatic promotion, cross-scope inheritance or unbounded retention. This is local experiment acceptance, not product release acceptance.

Final runtime range `77468faea480c6d0d742fd905946fe13e6c07946^..1a7545ca86d404e1f9f82e9acddb8cbb0c499b81` includes five nonmerge commits, zero merges. Native `git_evidence.py` receipts `admission42-retro-evidence.json` and `admission42-retro-final-evidence.json` preserve both initial and final inventories; story attribution arrays are empty because subjects lack numeric story IDs. Actual mapping:11.1=77468faea480c6d0d742fd905946fe13e6c07946;11.2 runtime150780e4a83183c8ee7953edda9053f1ac5bdb8b/acceptanceb41548732a94e533d33ce35b5af6b51702a92596;11.3 runtime47dcbb43c41e1664814302ea92da31a4b3d047e4 and final integration1a7545ca86d404e1f9f82e9acddb8cbb0c499b81. The latter adds selected-only multi-change SQL coverage and narrowly authorized recovery diagnostics. Documentation acceptance follows the tested runtime rather than pretending a future documentation commit was tested.

Installed retrospective resolver/config/evidence-gathering/aggregate/verdict/document references loaded. Native explicit `detect-epic --epic 11` returned `{"ok": false, "error": "[Errno 2] No such file or directory: '_bmad-output/implementation-artifacts/sprint-status.yaml'"}`. No sprint completeness list or operational status write is fabricated. Numbered specs/actual tests provide the local evidence. Raw session and CI receipts reside under `/home/ronin704/Documents/Sabir Asheed/Allura Memory/Operations/direct-build-20261026`.

## Findings / aggregate views / dispositions
- Accept architecture: parser → process-local engine → restricted SQL handoff → existing independent curator decision. Engine imports only crypto/authentication/authority/contract; workflow reuses persistence/capture/correction/decision/WorkBudget. No new migration, dependency, branch storage, general execution endpoint or approval bypass. Canonical transactional helpers retain original checks; exact mutation-after-await test proves issued frozen objects, not caller references, drive persistence (`memory-experiment-workflow.ts`, `capture.ts`, `corrections.ts`).
- Fixed integration defect: original snapshot callback could lend its owner's authority to another same-scope engine caller. Admission41 red demonstrated unexpected success; exact owner/scope plus current provenance permission now gates every operation. Source: `admission41-identity-red.log`, `memory-experiment-workflow.ts:51–54`, registered owner/revoke case. Lesson: adapter identity binding must be tested independently of a generic engine's scope checks.
- Fixed coverage gap: two selected hypothetical changes were not separately exercised through SQL. Admission42 multi-change case proves selected-only witness, separate operation receipts, no canonical mutation before human decision, and rejection of one hypothesis does not reject/promote the other. Source: `memory-experiment-workflow.test.ts:37–53`, full/exact DB logs. No production behavior was invented to satisfy this test.
- Fixed experience defect: long captured evidence overflowed phone viewport; `.inspector` wrapping preserves complete text without hiding evidence or changing the approved graph. Source: admission41 browser red/green and screenshots; `ui/style.css:2`. Accept current verbose JSON with an open usability refinement, not an unimplemented requirement masquerading as polished UI.
- R1, defer release reliability: original `supervisor-admission42-preflight-full.log:565–580` records restore failure after75684.42ms for the whole multi-step test. `recovery.ts` then discarded stderr and child status. This cannot prove timeout, OOM, Docker pressure or a runtime logic bug. Parent reran unchanged47dcbb43c successfully; admission42 full and exact restores passed. New bounded diagnostic captures exit/signal/elapsed/counts/allowlisted hints, never SQL/argv/raw stderr. Real invalid-archive regression proves safe failure telemetry, NOT the historical cause. Retain unresolved risk; do not claim recovery reliability repaired or production readiness.
- Accept narrowed size/duplication analysis: measured current contract86lines, engine318, workflow91; largest net epic addition is398-line engine test. These are separate responsibilities, not evidence of a god class. No new import cycle across these modules; existing authority and WorkBudget reused. This is direct integration self-check and scoped aggregate analysis, not an independent or exhaustive whole-repository audit.

## Behavior verification
Admission42 full run passed291tests/3343assertions and744browser assertions/13scenarios. Actual selected-only SQL case proves unrelated branch content is absent from the selected captured witness, a shared key cannot submit another selection, separate receipts are required and independent rejection/approval affects only the chosen canonical identity. Recovery child negative exercised real pg_restore: exit1, no signal,170ms,81stderr bytes, archive hint, no restored allura schema. This intentionally invalid archive is NOT a reproduction of the historical intermittent restore failure.

Final clean exact-source runtime1a7545ca86d404e1f9f82e9acddb8cbb0c499b81: all six local CI lanes EXIT0,291tests/3345assertions,744browser assertions/13scenarios; all27 experiment cases programmatically matched to actual pass lines. Receipt `releases/1a7545ca86d404e1f9f82e9acddb8cbb0c499b81/allura-ci-uEuskh/attempt.json`, raw logs alongside. The streaming restore test passed in30038.51ms; diagnostic negative produced exit1/archive hint without exposing its synthetic private payload. Pack verified101inputs and SHA2562930749e2e5a4245a3cfa965301b088233bc06d0e49cba7d1f3e1f423abcd3bc. Actual Chromium uses separately signed synthetic identities and real restricted PostgreSQL; no actual human witness/deployed acceptance claimed.

## Previous-retro follow-through
Epic10's response-binding and truthful-current-state lessons are exercised by experiment scope/owner binding, frozen issued candidate, durable exact receipt reconciliation and independent curator controls. External6/7/9 gates remain open. No sprint action selectors exist; no previous item transition written.

## Action items / acceptance verdict / open questions
Verdict: **accepted-with-open-items**, declared LOCAL Epic11 criteria. Disposition: **EXPERIMENT**. Adapt existing immutable capture/correction/decision boundaries; do not adopt AgenticOW/AgentDB/SONA, infer retrieval-learning superiority from tiny diagnostic fixtures, introduce another authority plane, or authorize production use. All original story criteria have local witnesses in spec11.3's matrix; no local story left unfinished. This headless verdict is not human retrospective signoff or canonical semantic promotion.

Open items, proposed ownership rather than remote assignments:
1. R1 — Woz/Brooks: on a recurrence retain new redacted child diagnostics and scoped resource observations; distinguish cause before changing budgets or retry policy. A passing rerun is not root-cause evidence. Operational recovery acceptance stays open.
2. Release boundary — Sabir with Brooks: authorize a named isolated staging target/identity scope and exact runtime artifact before hosted/deployed/actual-human/accessibility/operational witnesses. Parent owns separate remote README/history reconciliation. Real external projection needs its own target-scoped transfer authorization; none inferred here.
3. Usability refinement — Woz with existing approved UX: consider a readable captured-diff presentation while retaining exact evidence and no implied approval. Current raw JSON is bounded and responsive, but no actual human usability result is claimed.
No extra workers, status board, upstream, deferred12–14 or production action is authorized by these proposals.

## Assumptions
Headless explicit11; scope limited to approved local experiment. No independent developer review or fabricated team discussion. Brain unavailable; no remote memory/status receipt. Parent-authorized recovery instrumentation is included as a separate reliability follow-up, not invented as an original Epic11 requirement. Missing sprint-status is documented; no replacement board. Deferred12–14, upstream/production adoption and release-only checks are excluded.
