# Refreshed publication candidate

AI-Assisted Documentation: Fowler preparation, 2026-10-21 UTC. **This is a local, reviewable candidate; no commit, push, pull request, merge, deployment or publication was performed.** It supersedes the scope freeze in [the earlier isolation report](publication-isolation.md), while preserving that report as dated evidence. It does not close the [full goal audit](goal-audit.md).

## Scope and inputs

The refresh uses the immutable local Git object `fa396a20258100cb5496b46142e9a1c1ef86526f`, independently resolved from public main at the time in [public-baseline.json](public-baseline.json). No new network fetch or claim about later public-main state is made here. Goal-start base is `28d90e84364d1f99e67df4f8a4ebdaafb6fcf0d9`; nine initial working-tree snapshots distinguish task edits from earlier dirty documents.

The input source manifest contains 103 task-owned paths. Snapshot hashes matched that manifest except the expressly coordinated parent correction to `usability-study.md`: SHA-256 `82285c73076a26938fe1070a919730b6de5762dea1b28bacda940f3a9f924a2a`. That change recognizes the goal's explicit 4/5, 4/5 and 5/5 evaluation targets; observations remain 0/5. Subsequent parent checklist/audit integration is separately recorded in the external candidate manifest before its final freeze.

The candidate includes the current reader-path rewrites, README dispositions, six task-owned canonical additions, three new infographic sets and editable sources, SDK/example/runner repairs, reviewed AD-70 search changes, reviewed AD-71 nonexecuting preparation and evidence/study/skill reports. The one excluded input is `_bmad/bmm/planning/profiles/README.md`: it and its described exports are absent from the public tree, so this local historical-context correction does not introduce an unsupported public inventory.

The source snapshot is at `/tmp/allura-reddit-public-candidate-refresh/inputs/`; the candidate is at `/tmp/allura-reddit-public-candidate-refresh/tree/`. The external `candidate-manifest.json` records input/candidate hashes, preserved published bodies, deliberate wording adjustments and exclusions. The candidate's own `review-manifest.json` describes public-base candidate files, not the shared initial-tree delta, and excludes its own hash. The final patch and exact digest are in `/tmp/allura-reddit-public-candidate-refresh/publication-candidate.patch` and `validation.json`.

## Isolation decisions

- Thirty-one tracked source/README/SDK-output files use zero-exit three-way merges of published text, the explicit goal-start base and snapshotted goal source. No conflict-side selection flag is used.
- The Bumblebee README retains its published historical body and paths, with only the task's introduction/details wrapper applied. The local older path drift is excluded.
- Root README, shared guide and initial audit are authorized task rewrites. New task artifacts are copied from the frozen input snapshot.
- All published paragraphs in the canonical six remain byte-identical and in order. Only task-specific first-use, audience, UX, AD-70 and AD-71 material is added, including the trial dimension boundary. The accepted audience notice is inserted at Blueprint's brand section. References to the absent broader local backend plan use the included UX-R02 section; that separate engineering plan is not imported.
- Published `package.json`, `bun.lock` and SDK package manifest remain byte-identical. No dirty auth, Cloudflare, enterprise dashboard, persona, environment or global migration changes are imported.
- Seven safe relative public symlinks retain their targets. Three absolute machine-local skill symlinks are not dereferenced; their metadata is recorded, and no unrelated deletion is part of the selected patch. Existing root and SDK dependency symlinks are validation aids only and are excluded from publication.

## Fresh validation evidence

The following were run inside this refreshed candidate, rather than copied from the earlier candidate's receipt:

| Check | Observed result and limit |
|---|---|
| `bun run typecheck` | Exit 0 using existing installed dependency directories; no clean dependency installation was tested |
| `bun run test:unit tests/scripts/first-use-local-fixture.test.ts tests/scripts/first-use-profile.test.ts tests/scripts/first-use-memory.test.ts --reporter=dot --silent` | 64/64 pass: 54 AD-71 fixture/profile tests and 10 two-session runner tests. Pure/static/inert-wrapper and mocked-transport evidence only |
| `bun vitest run src/__tests__/memory-search-ruvector.test.ts --reporter=dot` | 66/66 pass with mocked stores; no remote-service, relevance-corpus or real RLS result |
| SDK `bun run test __tests__/memory.test.ts __tests__/client.test.ts --reporter=dot` | 53/53 pass; no packed-consumer or package publication lane run |
| Nine AD-71 source fingerprints | All match both final [Pike](clean-install-interface-review.md) and [Knuth](clean-install-db-contract.md#ad-71-final-independent-source-review--2026-10-20) reports exactly |
| Literal file/anchor scan | 550 selected Markdown/HTML targets resolve with zero issues; the count and issue list are recorded in external `link-check.json`. Dynamic/generated navigation and public HTTP delivery remain separate |
| Published canonical/docs-only shell guards | Both pass, exit 0, in this candidate |
| Selected-source conflict markers and patch whitespace | No unresolved conflict markers; final scoped whitespace result is recorded with the patch validation |
| Binary patch against a second exact public-base export | Final `git apply --check` result and SHA-256 are recorded in external `validation.json`; this does not apply the patch to any managed checkout or publish it |

The existing reports retain earlier `spawnSync git EPERM` and `spawnSync bun EPERM` test-harness failures and their replacement checks. They are not connection errors or trial-resource decisions. No subprocess/container success is inferred from the inert wrapper harness. No token or production credential was requested or retrieved for this refresh.

## Meaning and remaining work

The reader path retains the accepted audience, one primary starting action, the PostgreSQL decision example, and the distinction between saved evidence and independently human-approved knowledge. It starts with existing authorized Allura tools. The guide explicitly records the three unsuccessful discovery searches despite successful save/exact-ID reads; the candidate does not present the intended round trip as a verified live result. The visual explanations remain educational drafts with equivalent text, sources and phone layouts.

AD-71 remains preparation only. Its schema correction is outside automatic initialization, its helper stays nonexecuting, and the profile is not advertised as a supported runnable install. A verified permitted database adapter, exact target/atomic bootstrap, app-role provisioning and explicit trial-resource authority are unresolved. No service, model, image build, database query/DDL, fixture/credential generation or MCP configuration was executed here. The configured Allura Brain connection remains unchanged.

Still required: actual clean installation/provider-schema agreement/recovery, deployed separate-session discovery, an independent human review decision, five consented unfamiliar participants with recorded revisions/results and necessary retests, publication authority for the exact candidate/destination, actual publication and unauthenticated verification. An expressly authorized educational-draft publication may disclose these gaps but cannot complete the full goal.

Scoped hydration used the existing `allura-brain` connection in `allura-system`; search trajectory `8500fa7b-8ab9-475f-81c7-b7941319c0db` returned the prior isolation outcome and two older records. Exact-ID readback of `cb5ce47e-8652-487d-82da-ba40077f6438` matched the expected continuation marker. No unrelated memory bodies were copied. Root coordinates this turn's single outcome write/readback; no child promotion or external status action is requested.
