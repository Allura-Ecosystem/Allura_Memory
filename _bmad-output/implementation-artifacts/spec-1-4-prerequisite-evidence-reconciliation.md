---
title: '1.4 Review follow-up: source prerequisites and evidence scope'
type: chore
created: '2026-10-31'
status: done
route: oneshot
baseline_commit: b1ae0d1221da72a06e6eb27487eb1d2a0c59acd6
review_loop_iteration: 0
context:
  - '{project-root}/guidelines/ALLURA-BMAD.md'
  - '{project-root}/_bmad-output/planning-artifacts/stories/1.1-local-executable-foundation.md'
  - '{project-root}/_bmad-output/planning-artifacts/stories/1.4-foundation-acceptance-and-handoff.md'
---

<frozen-after-approval reason="bounded review follow-up under explicit continuous BMAD implementation/review authorization">

## Intent

Correct the source-checkout quickstart's missing explicit native-model prerequisite and prevent historical scaffold/self-check receipts from being mistaken for current whole-package acceptance. Document existing behavior and evidence boundaries only. Preserve all original acceptance clauses, historical receipts, current authority and completed product work. Do not change runtime, tests, dependencies, security permissions or story/epic/operational status, fabricate historical proof, waive current independent review, or claim cold-cache/hosted/installed-client/human acceptance. No implicit download, service change, live DB/credential/grant mutation, push, deployment, new branch/worktree, SSH or semantic promotion.

</frozen-after-approval>

## Implementation Notes

- Current approved bounded follow-up, not execution or closure of all Story 1.4 criteria. Installed build renderer and steps01/02 select oneshot: no unresolved intent choice, no irreversible action, three small existing document corrections and this spec. Parent is sole canonical writer; Team RAM Scout supplied the immutable-source investigation and independent Team RAM review remains mandatory. Existing adapter maps missing runtime/architecture/dictionary pointers; no shadow sprint tracker or operational status write.
- Baseline is the verified clean local contract commit above, not a restart of Epic 1. Proposal: `/home/sabira/.hermes/profiles/troy/reports/allura-story-review/epic1-prerequisite-evidence-proposal.md`, SHA256 `4b5dd9169886e33ded12cb5caa3607bc02bd1d6cc3a343fc1986b446dd34c163`. Parent verified all three unique OLD anchors and actual source behavior; recheck against this baseline before applying. The proposal's prior canonical counts describe the committed runner candidate, not a new test run for this follow-up.
- Exact allowlist: `README.md`; `_bmad-output/planning-artifacts/stories/1.1-local-executable-foundation.md`; `_bmad-output/planning-artifacts/stories/1.4-foundation-acceptance-and-handoff.md`; this spec. No other canonical edits.
- Apply R1/E1/E2 from the proposal. Refine R1 to name exactly the rejected `HF_TOKEN` and `HF_ACCESS_TOKEN` variables rather than implying every token variable is rejected. The source command is `bun scripts/prepare-model.ts`, not packed-only `prepare:model`. Preserve the separate full-check prerequisite paragraph and explicit download boundary; do not run preparation or claim a cold-cache witness in this document-only slice.
- Sources: `foundation/package.json:12–20`; `scripts/prepare-model.ts:3–10`; `src/embedding.ts:39–46`; `tests/openai-embedding.test.ts:37–42`. The real default-model test needs the prepared cache. Local unit tests also use isolated keyring and loopback fixtures: offline model inference is not a claim of zero local processes/network.
- E1 inserts historical/current scope before Story1.1 acceptance, preserving the original nine-file/three-test/19-assertion and hash-bound receipt conditions. E2 dates Story1.4's old direct-self-check disposition without rewriting its historical retrospective or current requirements. Preserve all story frontmatter and numbered acceptance clauses exactly. The historical primary-beta naming condition and the current authorized local checkout remain distinct; no branch rename or inferred historical compliance.
- Given each OLD anchor uniquely matches, the replacement must be exact apart from the stated token-variable clarification. Given unchanged acceptance/frontmatter and protected source hashes, the result must preserve them byte-for-byte. Given document links, their local paths/anchors must resolve. Source citations are not execution receipts.
- Verification: capture before/after hashes and the documentary defect, not a fabricated behavioral RED. Independently run pinned `bun run check:toolchain`, `bun run typecheck`, `bun run lint`, `bun run test`, `bun run test:db` from `foundation`; parse exact registered nonzero cases/floors, exclude overlapping preflights, preserve original containers and use only the owned disposable DB harness. No selection override or install/download. Check all changed/new files for whitespace and secrets. Freeze the final diff for actual independent BMAD review; fix findings, verify final bytes, obtain scoped governance, then commit only owned paths.
- Keep current source/test-file compiler-negative and restored-full-check proof gaps separate from older isolated-source receipts; this document slice does not manufacture those probes. Historical private ENT-01/protected/reset evidence, runtime audit gaps, tenant-lock/creation-negative/end-to-end owner proof, Epic1 retrospective and external6.5/9.4 remain open. Next owning evidence/implementation slices continue independently where authorized.
- Activation Brain retrieval used the same explicit allura-system principal through public MCP and returned three old unrelated semantic results; none establishes current status or acceptance. Receipt `prerequisite-brain-retrieval.json`. No outcome write: legacy episodic-only/pending-review enforcement remains unverified, so the existing hold stays in force.

### Parent implementation receipt

Applied R1/E1/E2 to the three allowlisted documents after revalidating every OLD anchor against the clean committed baseline. R1 names the two checked nonempty token variables exactly. No preparation command, dependency download or runtime mutation was executed. Story frontmatter/numbered acceptance clauses, historical retrospective and the separate full-check prerequisite paragraph are preserved; final source/hygiene checks and independent review follow. The document edits are not a cold-cache or historical-evidence witness.

### Independent review triage and corrections

All four layers returned against frozen diff `9d238b49bf1ddef6e9395d5747665de0c85118e4edb1a4c06f0e579a1fe42cbd`. Blind Hunter reported four findings; Edge Case and Verification Gap reported none; Acceptance Auditor verified exact replacement, preservation and executed-count evidence with no substantiated criterion violation. The full diff included this spec, so strict narrative-blind separation was not achieved; reviewers were independently executed, not independent of every author claim.

| ID / source | Verdict | Route | Parent evidence and correction |
|---|---|---|---|
| BH1 / blind-hunter | medium | patch | The newly linked prerequisites omit `/usr/bin/gdbus`, invoked by `device-platform-fixture.ts:15`. D-Bus alone does not supply proof of that executable. Added it; actual read-only `dpkg-query -S /usr/bin/gdbus` returned `libglib2.0-bin`, with installed Ubuntu package version `2.88.0-1ubuntu0.1`. Guidance is Ubuntu-specific, not an asserted universal package name; no install performed. |
| BH2 / blind-hunter | low | patch | README's new unit-prerequisite reference could send headless users to persistent-client desktop-session setup at consumer README:42. Fixture:7–15 constructs its own private directories/environment and bus/keyring. Clarified installed-executable versus real-client session requirements, preserving the client guide and never accessing an existing user vault. |
| BH3 / blind-hunter | medium | patch | The new already-cached exception was ambiguous: `embedding.ts:4–5,39–43` requires the checkout-local model files, not any external cache. Named the exact default cache, linked the pinned identity and explained preparation after removing that cache/rebuilding node_modules; no cold-cache execution claim. |
| BH4 / blind-hunter | low | patch | The new historical scope qualifier omitted the present-tense one-file/three-case Limits paragraph. Extended the qualifier and relabeled its heading as historical while preserving that paragraph and every original numbered acceptance clause. Current inventory still comes from actual runner source/receipts, not an edited historical requirement. |

All four findings are directly corrected, individually retained and not rejected or merged. Changes stay within the four-path allowlist/frozen intent; the initial exact-proposal check remains historical and final review patches are explicit. This does not change runtime/tests, original story frontmatter, acceptance criteria, existing external/historical proof limits or the separate full-check prerequisite paragraph. Final frozen-source verification, independent patch review, hygiene, governance and owned local commit were the subsequent gates at this review checkpoint.

### Bounded documentary repair completion

Pike and Fowler independently APPROVE the final documentary snapshot `b2f8eb6fa64020dfc9a36e66af112e7ee3a18445817a8dbed00f958f414bf5d0` and all four patch dispositions (deleg_651dcff1). Both verified original criteria/frontmatter and source preservation; neither claims narrative-blind review or runtime acceptance. Parent independently executed all five required gates on that final snapshot: 29 unit suites, 161 tests/3,174 assertions plus canonical DB 280 tests/3,804 assertions = 441 tests/6,978 assertions, excluding overlapping preflights. No failed/skipped/missing required cases; 1,386 admitted source hashes unchanged and 12 original containers preserved. Strict four-file secret scan found zero findings and whitespace checks passed. Evidence: `prerequisite-reconciliation-parent-final/` under the profile-local review reports.

Only this bounded repair is done. This completion metadata does not alter the three reviewed documents, frozen intent or runtime. Final metadata hygiene and scoped governance must pass before an owned local commit; exact commit proof belongs in that directory’s commit-verification.json. Story 1.4/Epic 1 and all previously listed historical, compiler-negative, runtime-audit, cold-cache and external/human acceptance gaps remain open. No outcome memory write, push, deployment or live grant/data change.
