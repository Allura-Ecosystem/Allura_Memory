# Publication candidate isolation

AI-Assisted Documentation: Fowler isolation preparation, 2026-10-20. **A concrete local candidate is prepared; nothing has been committed, pushed or published.** Only this report and `/tmp/allura-reddit-public-candidate/` were written by this preparation task. Shared source files and other agents' reports were not changed.

## Authoritative base and scope

The parent independently resolved public main through unauthenticated API/raw reads at `2026-10-20T23:10:52Z` to **`fa396a20258100cb5496b46142e9a1c1ef86526f`**, matching local `origin/main` and the immutable local commit object. This task used those existing objects and made no network fetch. The goal work started at `28d90e84364d1f99e67df4f8a4ebdaafb6fcf0d9` with substantial unrelated dirty changes already present.

The 86-file local review manifest is a source-delta receipt, not automatically a publication patch. All 86 input hashes matched it at the first isolation snapshot. Files clean at goal start use local HEAD as their three-way base; nine documented initial snapshots distinguish goal edits from existing dirty content. Current reader-path README/guide rewrites and the related audit are within the explicit task scope. The accepted documentation audience is recorded in the shared authority receipt; no global brand lock or publication permission follows.

## Concrete result

Candidate tree: `/tmp/allura-reddit-public-candidate/tree/`.

- 85 of the original 86 input files are selected for the public candidate.
- One local historical-profile README is excluded: `_bmad/bmm/planning/profiles/README.md` and its described YAML exports are absent from the verified public tree. Its local correction remains preserved in the shared worktree; publication does not need to introduce that unsupported historical inventory.
- Four later goal-owned reports are included: clean-install recon, clean-install handoff, publication checklist and dated public baseline JSON.
- This isolation report is included as review evidence. The resulting payload has **90 files plus the candidate review manifest**, whose own hash is deliberately excluded from itself.
- The external `candidate-manifest.json` records every selected file, source/candidate SHA-256, method, exclusion and deliberate canonical reference adjustment. The in-tree `docs/reference/reddit-remediation/review-manifest.json` describes this public-base candidate, not the earlier dirty-tree delta.

These counts identify the frozen preparation scope. Later root checklist/audit changes require an explicit copy and manifest refresh; they are not silently covered by this receipt. The subsequently added AD-71 isolated-trial proposal is deliberately excluded: it authorizes separate local preparation and does not change this AD-70 publication candidate.

## Isolation methods and contamination avoided

| Surface | Method / boundary |
|---|---|
| 31 tracked source/README/SDK-export files | Zero-exit `git merge-file` of public current, goal-start HEAD base, and the goal-owned input. No conflict-side auto-selection flags were used. |
| 44 new goal-owned files | Copied as whole new task artifacts. This includes the editable explainer sources/exports and the new first-use validation skill, runner and evidence. |
| Root README, shared guide and initial audit | Authorized whole reader-path/audit rewrites; no shared environment or runtime files copied. |
| Canonical six | Extracted only first-use/audience/UX/AD-70 material and appended it to the exact published documents. Published paragraphs remain byte-identical and in order; Blueprint adds the explicit documentation-audience notice at its brand section. |
| Bumblebee README conflict | Kept the published historical body and its `.opencode/work-items` paths, adding only the task-owned introductory reading path and details wrapper. Local HEAD's older `_bmad` path drift was not imported. |
| Local pre-goal auth/dashboard/backend work | Not imported. Candidate canonical docs retain the published provider/engineering text rather than copying the dirty local Cloudflare migration, enterprise preview, readiness backlog or backend-adversarial additions. `package.json` remains the published version. |
| Reports with source fingerprints | Retained as historical/local evidence, with their original scope/revision claims. They are not recast as candidate test or deployment receipts. |

The public documents already contain the 2026-10-18 bounded memory contract and DOC-01/06/07 authority. They do not contain the later local BE-AC03/backend plan. Rather than import that unrelated plan, the candidate's AD-70 and requirements references point to the included UX-R02 acceptance section. The candidate also corrects the new risks-section introduction to acknowledge the separately scoped AD-70 decision instead of denying that any new architectural decision is present. Those deliberate goal-only wording differences are recorded in the manifest.

## Canonical candidate hashes

| File | SHA-256 |
|---|---|
| `docs/allura/BLUEPRINT.md` | `a9713cd652cf88c7915a800ca53b70e66cb983adbf01d25356281256acca2677` |
| `docs/allura/DATA-DICTIONARY.md` | `c1a71531ff25c28424406627e7855265af4546f1b685a46e82e07483e0a73f38` |
| `docs/allura/DESIGN-ALLURA.md` | `9c2609b5c3165fb53ec0ebc34408dcc6c2d03a93feaa033681e248681b356b3d` |
| `docs/allura/REQUIREMENTS-MATRIX.md` | `cd1a977d01a2c727841c1494d381cd1178d8fb17802386aa9092490b27ade34e` |
| `docs/allura/RISKS-AND-DECISIONS.md` | `9a22337ac2773a275a8ba93ad38d093ce0cd80a97318f75974c3cdb9fcb43fe1` |
| `docs/allura/SOLUTION-ARCHITECTURE.md` | `b551e651134b5e9255b57d8ba25860926bc5733d21005528419c062a9eb0c4dc` |

## Validation performed on the isolated candidate

- Public object export: 2,842 files, approximately 53.8 MB. Seven safe relative symlinks preserve their published targets; three absolute machine-local skill symlinks are not dereferenced. Their original object metadata is recorded outside the publication patch, and no unrelated deletion is selected.
- Candidate typecheck: exit **0**. The first attempt resolved the SDK against root Zod 4 because its package-local dependency directory was absent in the export, producing three `z.record` signature errors. Linking the already-installed SDK dependency directory restored the SDK's declared Zod 3 resolution; no dependency install, package/source/configuration change was made. Root and SDK dependency links are validation aids excluded from the patch. This is not a clean-install dependency test.
- Candidate runner suite: **10/10 pass** with `bun run test:unit tests/scripts/first-use-memory.test.ts` from the candidate tree.
- Candidate canonical search suite: **66/66 pass** with `bun vitest run src/__tests__/memory-search-ruvector.test.ts --reporter=dot` from the candidate tree, mocked stores.
- Candidate SDK memory/client suites: **53/53 pass** from the candidate SDK directory. No legacy npm/packed-consumer or database/network route was run.
- Resolved literal Markdown/HTML file/anchor checks pass after including the candidate review manifest. This checks selected document targets, not dynamic JavaScript-generated links or public HTTP delivery.
- The prepared binary-capable patch passed `git apply --check` with exit **0** against a second export of the exact public base. The final patch/validation hashes are recorded in `/tmp/allura-reddit-public-candidate/validation.json`; no apply-to-worktree or publication is implied.

## Remaining dependencies and publication boundary

This candidate isolates scope; it does not establish a published release, the configured remote deployment revision, repaired live two-session retrieval, a fresh installation, independent human promotion or five-person usability results. Existing broader engineering requirements remain open. The candidate guide starts with the already-connected Allura tools; existing-connection verification is separate from approval for any new trial resources. This preparation neither requires nor requests production credentials. No credentials, tenants, runtime settings, database records, Git repository/branch/worktree or remote state were changed by this preparation.

A human still needs to accept the exact publication scope and candidate revision. Before that action, the owner must refresh any later goal-owned handoff/checklist changes, rerun the scoped checks if content changes, inspect the patch and approve the publication route. After authorized publication, verify the actual public commit and reader-facing links/assets without credentials. Do not combine unrelated auth/provider/dashboard changes to make this candidate look easier to merge.

Outcome logging is append-only through the governed Brain interface after preparation; no human approval or semantic promotion is requested by this report.
