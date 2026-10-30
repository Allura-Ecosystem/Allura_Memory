---
title: 'Correct the local homelab development entrypoint'
type: 'chore'
created: '2026-10-29'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: ['{project-root}/guidelines/ALLURA-BMAD.md']
---

<frozen-after-approval reason="approved homelab cleanup and continuation">

## Intent

Make the existing Dell development command select the active beta-local checkout explicitly and fail rather than silently test another tree. Preserve unfinished work in local commits, separate active/reference/older stack entrypoints, and provide a concise schema/source/runtime map. Keep the existing runtime, live data, worktree locations, other profiles and remote branches unchanged. The owner approved the homelab plan and asked to continue until Git/workspaces are clean and development-ready.

</frozen-after-approval>

## Implementation Notes

- This is a local tooling/organization slice, not a product epic or release. The existing approved plan is `/home/sabira/.hermes/plans/2026-10-29_172037-homelab-workspace-cleanup.md`.
- Current BMAD adapter controls: one direct writer/self-check, no independent development reviewers or fabricated operational work status. Earlier missing-context mappings remain unchanged. No vendor workflow edits.
- Code map: `/home/sabira/.local/bin/allura-dev` is the installed wrapper; tests are `/home/sabira/homelab/tests/test_allura_dev.py`; user-facing docs are `/home/sabira/homelab/`. The target is this checkout's `foundation`, not primary beta or legacy main.
- Preserve pinned Bun 1.3.14 and Node 24.19.0. Canonical validation is `foundation`'s `check:all`; its DB lane creates/removes an owned disposable PostgreSQL fixture. No live migrations.
- Admission evidence: `/home/sabira/.hermes/profiles/troy/reports/homelab-dev-ready/source-before.json`, eight repositories. Verified encrypted protection predates this slice; it is not a post-cleanup backup.
- Test-first: installed `allura-dev --where` from `/` failed the exact active-target assertion (printed Bun help). Existing active beta `check:all` passed; legacy typecheck passed.
- Existing legacy unit lane exposed a fixture socket path exceeding Linux's socket pathname limit under the profile's private scratch directory. A short symlink alias let sockets bind but violated canonical-path fixture assertions; rejected that workaround. Minimize only the temporary directory prefix in `tests/scripts/dev-safe.test.ts`, retaining the actual scratch root and all security assertions.
- Server health diagnosis: actual `loginctl show-user sabira --property=Linger --value` is `no`; do not hide the warning or claim unattended server readiness. Enabling login persistence is outside this source-cleanup slice.
- Local commits preserve the reviewed existing beta feature/readback changes and older local-auth/bootstrap work on their existing separate branches. Neither is merged into primary or pushed. Legacy operational gaps remain documented.
- Acceptance: installed target selection, help/error/argument handling, missing-target refusal, pinned toolchain and full active beta checks pass; source preservation manifests reconcile; all eight Git worktrees clean; navigation resolves; existing containers and beta process unchanged. No source relocations, raw credential outputs, migration renumbering, stack teardown or public-release claims.

## Local verification and direct self-check

- Active beta canonical `check:all`: passed; strict unit inventory, both TypeScript projects, ESLint and 193 database/browser/packing tests with 2,021 assertions, zero failures/skips/missing cases. Test container removal verified. Exact final-commit rerun receipt is retained externally in `reports/homelab-dev-ready/` to avoid test logs dirtying source.
- Installed-wrapper tests: five passed, including real pinned toolchain execution; missing target/toolchain paths are tested by executing copies with only those paths substituted. Shell syntax passed. `tools/homelab/` retains byte-identical source copies of the installed machine-specific wrapper/tests.
- Legacy full unit lane: 3,184 passed, 180 existing skips; TypeScript passed. The canonical lane discovered the existing 24 bootstrap tests, repository-auth test and 64 adversarial-auth tests. Compose config validation passed without activation. No new live legacy DB acceptance is claimed.
- Preservation: 27,385 admission file entries byte-identical in place, three explicitly changed files (.gitignore, legacy test fixture prefix, legacy setup notes), nine diagnostic logs archived byte-identically. Zero unexpected losses/modifications. Rendered vendor snapshots stay in place, ignored as regenerable output.
- All 20 source migration hashes match the packaged runtime's migration files. This does not claim new live database inspection or source/runtime deployment equivalence.
- Local checkpoint commits: beta `bf134213a354e2328acc41afd8c8e62d537d7b0d`; older setup `8a831884e0f7570c453846cec4c90381a9a22ba4`. Current local Git authorship follows the existing verified Sabir Asheed repository identity; no global identity config or remote changes.
- Self-review found and corrected wrong checkout targeting, permissive unknown-option success, and oversized temporary socket path. The symlink scratch workaround was rejected and removed because it broke canonical-path assertions. No independent development-review claim; direct checks follow the controlling repository adapter.
- Limits: no push, release, live migration, profile merge, automatic capture/promotion or system startup-policy change. Older runtime's documented gaps and off-machine recovery-key custody remain open. Completion here means bounded local development setup, not product/production or unattended-server acceptance.
