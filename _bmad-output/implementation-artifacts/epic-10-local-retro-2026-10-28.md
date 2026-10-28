---
epic: 10
date: 2026-10-28
verdict: accepted-with-open-items
criteria: declared
headless: true
scope: authorized-local-implementation-only
---
# Epic10 local retrospective — bounded scanner and apps

## Epic summary / evidence inventory
All three local stories are done:10.1 pinned contract/provenance,10.2 leased scanner ingestion and installed runtime,10.3 scoped lifecycle and operator views. No deployed acceptance is inferred. Source range `413b7a951f5c119bb16fd74d2c5d586f778e586d^..0eb9607aa2a56bec08eee5e0704bd89f9e813ecc` includes seven nonmerge commits and also Epic7 work, which is excluded from scanner attribution.10.1 preparation is413b7a951f5c119bb16fd74d2c5d586f778e586d and acceptance1158c1ce9ce67a44ff605229acb4c696cd1394a5;10.2 runtimeb52ea3c54bc9f694700416bc4d3ecbc62ec8558d/acceptancedaa91b43f659469f4a33f081c842397e55e4a90b;10.3 runtime0eb9607aa2a56bec08eee5e0704bd89f9e813ecc.

Installed retrospective resolver/config/references and `git_evidence.py` ran. `admission38-retro-evidence.json` has seven commits,zero merges; numeric story attribution arrays are empty because subjects lack story IDs, not because delivery did not occur. Mapping above follows actual specs/commits. Latest complete10.3 diff was directly read in all660 lines before commit; scanner self-check and exact-source evidence are linked in spec10.2. This is a bounded integration retrospective, not a new whole-repository or independent code review. No team discussion fabricated.

## Findings / aggregate views and dispositions
- Accept: source/provenance, current authority, leased population ordering, sanitized persistence and app presentation remain separate boundaries. PostgreSQL is canonical; data-only module descriptors cannot issue credentials or semantic decisions (`bumblebee-contract.ts`, migrations016–019, `app-modules-api.ts`). No arbitrary module code loader or external feed introduced.
- Fixed before acceptance: installed receipt could contradict complete-state replacement;10.2 invariant tests now bind receipt state/replacement/exposure ceiling (`spec-10-2-bumblebee-ingestion.md:50`). Use consumer-side semantic checks, not merely valid JSON.
- Fixed before acceptance: adding Apps to curator created ambiguous browser status locators. Named workspace status preserves independent module notices and exact conflict/unknown assertions (`ui/main.tsx:73`, `dashboard-browser.test.ts:39–45`; admission38 preflight red then full green). Integration checks must exercise existing views after new shared surfaces appear.
- Fixed before acceptance: inventory age could be mistaken for last-run success. Actual partial/late batches preserve the last complete generation and genuine catalog expiry is separately visible (`app-modules.test.ts`, `apps-panel.tsx:15`; admission38 matrix red→green). History is not current trust, and a transport receipt is not a live-state guarantee.
- Accept with limit: module lifecycle never writes domain tables; compatible1.0.0/1.0.1 releases share configuration schema and capabilities. Disable/restore is a new immutable revision, not rollback of canonical data. Lost acknowledgement is explicitly reconciled using the identical operation key, with database count and receipt witnesses (`app-modules.test.ts`).
- Defer release-only: scanner runner is bounded in-process execution, not hostile filesystem/OS isolation; supported installed fixture platforms are Linux-amd64 npm/project and pypi/baseline. No broader platform, real-data enrollment, hosted CI, deployed source/curator or production security certification claim (`spec10.2`, package README).
Architecture/duplication analysis is scoped to these integration boundaries; source volume alone is not a god-class finding. No new dependency/license adoption occurred after the explicitly pinned Apache-2.0 scanner.

## Behavior verification
Actual pinned scanner→verified TLS→restricted disposable PostgreSQL→installed SDK/read-back, exact replay/lost acknowledgement, source/credential/catalog revocation, malformed/bounded wire, partial/late/population isolation and injected deferred failures passed. Actual Chromium exercised populated task apps, update/cancel/disable/restore, failure isolation, scope change/revocation, responsive keyboard navigation and retained interactive graph. Independent human product approval remains enforced by fixtures; no actual human witness claimed.

Full current source admission38:261tests/3034assertions,0fail/skip,+731browser assertions/12scenarios, typecheck/lint passed. Fresh exact committed-source CI at0eb9607aa2a56bec08eee5e0704bd89f9e813ecc repeated all six lanes successfully: `releases/0eb9607aa2a56bec08eee5e0704bd89f9e813ecc/allura-ci-21DAE2/attempt.json`. Exact pack `allura-core-artifact-OzydxK/allura-core-0.1.0-dev.1.tar.gz`: SHA256e9c73b58a4d0a40c6cabb65f9564d5e0ac78e55a035fa6d92c206c07695141c1,97 input digests and clean export source binding verified. Admission39 preflight full exited0 at14:36:44-04:00. Operations root: `/home/ronin704/Documents/Sabir Asheed/Allura Memory/Operations/direct-build-20261026`. Plain source export/private scratch index never changed canonical README or registered a worktree.

## Previous-retro follow-through / action items
Prior7 retro's exact response-binding lesson is exercised by Apps receipt scope/actor/key validation and lost-ack replay; no sprint action selector exists. External6/7/9 release gates remain open, not forgotten. Brooks owns a scoped staging/hosted/human witness request after remaining local11 acceptance; parent owns remote README/history reconciliation. Woz/integrator carries response-binding, independent status names and truthful freshness labels into experiment integration. No new authority or optional12–14 scope requested by this retro.

## Acceptance verdict / assumptions / open questions
`accepted-with-open-items` for the declared LOCAL Epic10 only; all three local story specs have exercised evidence. Headless explicit10 invocation, no human retrospective signoff. Sprint completeness query returned `{"ok": false, "error": "[Errno 2] No such file or directory: '_bmad-output/implementation-artifacts/sprint-status.yaml'"}`; completeness is therefore checked against numbered specs/evidence, not a fabricated status board. No independent development review under the current explicit methodology. Brain unavailable; no remote event/status written. Current authorized next step is verified candidate11 integration under the sole canonical writer, not production adoption or automatic promotion.
