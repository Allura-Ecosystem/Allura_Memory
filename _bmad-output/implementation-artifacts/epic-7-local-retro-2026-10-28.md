---
epic: 7
date: 2026-10-28
verdict: accepted-with-open-items
criteria: declared
headless: true
scope: authorized-local-implementation-only
---
# Epic7 local retrospective — confirmed projection

## Epic summary / evidence inventory
Local7.1 contract,7.2 durable handoff and7.3 actual bounded transport/operator behavior are accepted for the explicitly adopted local scope. Full external/release acceptance is NOT closed. Range `413b7a951f5c119bb16fd74d2c5d586f778e586d^..2f03d0c5b01f98c4d44c30a8401b40f24267170d` includes three nonmerge commits;7.1=413b7a951f5c119bb16fd74d2c5d586f778e586d,7.2=8bc33180b2afb3a122e7ff72482eab3273418f39,7.3=2f03d0c5b01f98c4d44c30a8401b40f24267170d. First commit also preserved10.1 preparation; do not attribute its scanner work to7.

Read current catalog/PRD/architecture, contracts/projection-v1.md, specs7.1–7.3, full current diff and cross-story schema/service/comparator. Installed retrospective resolver/references and git_evidence.py ran; raw `admission28-retro-evidence.json` records volume/range. Commit subjects lack numeric story IDs, so script `stories:[]` is not automatic attribution; explicit mapping above comes from specs/commit contents. No independent developer review or fictional discussion.

## Findings / aggregate views
- Accept: PostgreSQL remains sole durable authority. Immutable decision/transfer receipts, current source/authority locks, fenced claim/write marker and append-only separate observations compose correctly across7.1–7.3 (`015-projection.sql`, `projection.ts`, `projection-delivery.ts`). No client-supplied synced/page endpoint. Shared comparator avoids digest drift; source/destination/Unicode bytes remain exact.
- Fixed before local acceptance: Bun request-close occurred before response-end, prematurely yielding unknown. Real HTTP probe and admission27 failed logs exposed this; response lifecycle now owns completion (`projection-delivery.ts:31–50`). Direct wire/restart tests and full28 pass. Prevention: verify actual transport event order, not API-name assumptions.
- Fixed: response ID was not explicitly bound by projection panel validation; wrong-transfer response now yields unknown and no rendered observation. Browser regression exercises it (`projection-panel.ts:6–15`, `projection-browser.test.ts`). Screenshot destination now uses caller-provided evidence directory or owned fixture scratch, not developer home paths.
- Accept with limit: configuration is not health/sync; `configured_not_probed` is separate. Unknown after a possible write only reconciles, never rewrites. This sacrifices automatic recovery of some empty ambiguous targets in favor of duplicate-write safety;5-attempt exhaustion requires human disposition.
- Defer release-only: no actual approved Notion destination/exclusive target policy/credentials/transfer or external compatibility witness. Default runtime registry remains empty. Fixture read-back cannot satisfy deployed DOC-J09. Shared helper boundaries are trusted server APIs, not hostile-code sandboxes.
- Defer unproven hazard: admission27 heldout retrieval had one degraded timing result; unchanged later runs pass. No causal fix or production reliability claim. Raw retry log retained.
Architecture/duplication analysis is directly scoped to projection boundaries; deterministic git volume is not a god-class verdict. No whole-repository structural or independent review claimed.

## Behavior verification
Actual restricted PostgreSQL plus loopback HTTP: independent GET/PATCH/GET, false acknowledgment, delayed write/new process reconciliation, committed-marker crash, concurrent workers, revocation, source/head checks, conflict/malformed/redirect/overflow/rate/deadline/cancellation, failure atomicity and due ceilings. Actual Chromium clicks: authorize, inspect, cancel, process, revoke, unknown, wrong-transfer response and revoked access; retained interactive graph and responsive/keyboard/axe suites remain passing. Desktop screenshot `admission28-browser/projection-delivery.png` inspected: readable observation/controls, no observed clipping/overlap.

`bun run check:all`:216tests/2176assertions +617browser/10scenarios, exit0 (`admission28-projection-full.log`). Exact committed-source six-lane local CI at2f03d0c5b01f98c4d44c30a8401b40f24267170d: all lanes0,216/2176 (`releases/2f03d0c5b01f98c4d44c30a8401b40f24267170d/allura-ci-B1ejUy/attempt.json`). Used byte-manifested plain git archive and isolated scratch index against existing immutable objects, not a registered checkout/branch/worktree; parent README stayed untouched. Canonical working tree was not falsely called clean. No CI integrity checks disabled.
Packed archive `allura-core-artifact-Ri732G/allura-core-0.1.0-dev.1.tar.gz` in that release directory:SHA256 a9e77bf310e2b7f91a07be4e7581deacd103d22e9f32e8534afc0c8431e85530,80 input member digests and clean export source binding verified. This is local CI/pack evidence, not hosted/deployed acceptance. Operations root is `/home/ronin704/Documents/Sabir Asheed/Allura Memory/Operations/direct-build-20261026`.

## Previous-retro follow-through / actions
No sprint-status file/action selector exists; no status transitions made. Prior6/9 hosted/deployed/human/operational recovery requirements remain open, as documented by their release packet and user Correct Course. Brooks owns scoped release witness request after remaining local work. Woz/integrator preserves transport response lifecycle, exact ID/digest binding and portable evidence destinations in later adapters. Parent owns remote README/history reconciliation; no push inferred.

## Acceptance verdict / assumptions / open questions
`accepted-with-open-items` ONLY for declared local7 scope, all three local story specs done. Actual external7 release remains unaccepted. Explicit headless Epic7 invocation; no human retro signoff fabricated. Sprint completeness script returned `{"ok": false, "error": "[Errno 2] No such file or directory: '_bmad-output/implementation-artifacts/sprint-status.yaml'"}`; status completeness unavailable, checked numbered specs and actual evidence instead. No replacement tracker created. Current user permits continued local10/11 without closing external gates.

Next: finalize retained10.1, verify parent-created candidate hashes and integrate dependency-ready modules under sole canonical writer. Candidate readiness is not acceptance. Specific external target/transfer/hosted/staging authority remains a later consequential decision; no routine design question blocks local continuation.
