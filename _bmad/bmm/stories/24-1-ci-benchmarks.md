# Story 24.1 — CI and Evidence Baseline

**Epic:** 24 — Agentic AI Framework and Harness Portfolio Readiness
**Status:** in-review
**Priority:** P0-Critical
**Complexity:** Large
**Owner:** Woz / Hightower
**Dependencies:** none

## User Story

As a platform reviewer, I need every Allura capability claim tied to a reproducible CI result, so that I can distinguish implemented behavior from planned or unverified behavior.

## Context

The repository exposes unit, integration, end-to-end, benchmark, typecheck, build, and governance commands, but no active workflow currently proves them on each change. Existing prose contains historical results that can become stale. This story creates the truthful baseline required before security or portfolio claims are expanded.

## Scope

- Add GitHub Actions lanes for static validation, unit tests, live-PostgreSQL integration tests, build, and the existing benchmark runner.
- Generate per-lane evidence fragments and aggregate them, even after failures, into one schema-validated manifest per run with commit, environment, commands, results, durations, and artifact links.
- Classify public claims on two independent axes: capability state (`implemented`, `planned`, `unsupported`) and evidence state (`measured`, `validated`, `unverified`).
- Keep generated evidence immutable and bound to its commit SHA.

## Out of Scope

- Changing benchmark thresholds to make a run pass.
- Enforcing numerical benchmark regression thresholds; Story 24.6 owns regression policy. This story fails the benchmark lane on runner errors, an unreachable gateway, or required benchmark skips while preserving measured pass/fail results honestly.
- Adding scenario-harness results before Story 24.5 exists.
- Publishing a dashboard or claiming production scale.

## Acceptance Criteria

- [ ] AC-1: `.github/workflows/epic-24-evidence.yml` runs on pull requests and pushes to the default branch without replacing the canonical `.github/workflows/ci.yml` gates.
- [ ] AC-2: CI installs pinned Bun and project dependencies from the lockfile without modifying the lockfile.
- [ ] AC-3: Separate jobs run typecheck plus a changed-file ESLint ratchet, unit tests, a production build, live-PostgreSQL integration tests, and the benchmark baseline. The ratchet uses the explicit PR/push base SHA and fails on new lint errors or an invalid base.
- [ ] AC-4: Live database jobs apply `docker/postgres-init/*.sql` in deterministic filename order to PostgreSQL 16 with pgvector support.
- [ ] AC-5: No required validation job uses `continue-on-error`; validation command failures, runner errors, an unreachable benchmark gateway, or required benchmark skips fail the workflow. Numerical benchmark threshold enforcement is deferred to Story 24.6.
- [ ] AC-6: `scripts/ci/collect-evidence.ts` emits a JSON manifest containing schema version, commit SHA, UTC timestamp, Bun/Node versions, the server-reported PostgreSQL version from the live connection, exact commands, exit status, duration, and verified artifact paths.
- [ ] AC-7: Test and benchmark artifacts are uploaded with retention configured and names containing the commit SHA.
- [ ] AC-8: `docs/portfolio/capability-matrix.md` lists major claims with independent capability/evidence states, source path, validation command, and latest evidence type; it contains no manually invented measurements.
- [ ] AC-9: README numerical claims link to evidence or are removed until Story 24.9.
- [ ] AC-10: A deliberately failing test or benchmark on a temporary branch demonstrates that CI blocks the change; the evidence is recorded without merging the failure.

## Implementation Files

- `.github/workflows/epic-24-evidence.yml` — isolated Epic 24 evidence workflow; canonical CI remains in `.github/workflows/ci.yml`.
- `scripts/ci/collect-evidence.ts` — new evidence-manifest generator.
- `scripts/ci/run-live-db-tests.sh` — new deterministic database bootstrap and validation entrypoint.
- `docs/portfolio/evidence-schema.json` — new versioned JSON schema.
- `docs/portfolio/capability-matrix.md` — new claim/evidence inventory.
- `package.json` — add only the stable CI wrapper scripts needed by the workflow.

## Tasks

- [x] Inventory the current package scripts and record which require services, secrets, or optional infrastructure.
- [x] Add the static, unit, build, live-database, and benchmark jobs.
- [x] Ratchet ESLint on changed JavaScript/TypeScript files without representing the existing full-repository lint debt as clean.
- [x] Add readiness polling for PostgreSQL and the MCP gateway; do not use fixed sleeps.
- [x] Generate machine-readable per-lane output and evidence fragments, then run a final `always()` aggregation job that emits one schema-validated SHA-bound manifest even when validation fails.
- [x] Upload artifacts in an `always()` step while preserving the original failing exit status.
- [x] Pin third-party GitHub Actions to immutable commit SHAs and grant the workflow only read access to repository contents.
- [x] Create the capability matrix and remove or qualify stale public measurements.
- [ ] Run a green workflow and a controlled red workflow.

## Validation and Evidence

```bash
bun install --frozen-lockfile
bun run typecheck
bun run lint:ci --base=<base-sha>
bun run test:unit
bun run build
bash scripts/ci/run-live-db-tests.sh
bun run benchmark -- --ci-baseline --require-gateway
```

Required artifacts:

- `evidence-manifest.json`
- unit and integration test reports
- benchmark JSON
- migration log with secrets redacted

## Definition of Done

- All acceptance criteria pass in GitHub Actions.
- Evidence is downloadable and identifies the exact commit.
- Story Dev Agent Record, File List, and evidence link are complete.
- `docs/portfolio/evidence-index.md` contains the first indexed CI run.

## Dev Agent Record

**Status:** in-review

### Completion Notes

- Added a least-privilege, immutable-action-pinned workflow with static, unit, build, live PostgreSQL, benchmark, and final evidence jobs.
- Added per-lane command receipts and schema-validated, commit-bound aggregation that fails on failed or missing required lanes.
- Added deterministic database migration/bootstrap scripts and a dedicated live-database test inventory.
- Added fail-closed benchmark CI policy without moving Story 24.6 numerical regression policy into this story.
- Added an explicit-base changed-file lint ratchet because the pre-existing repository-wide lint baseline is not clean.
- Hardened evidence trust boundaries after Pike/Fowler review: exact five-ID benchmark inventory, at least one passed and zero failed Vitest tests, existing-only artifact receipts, foreign-SHA isolation, and preservation of original command exit codes.
- Replaced the psql-client version receipt with `SHOW server_version` from the live connection and propagate that server-reported value from the live-database lane (with benchmark fallback) into the aggregate manifest.
- Added portfolio claim/evidence documentation and removed retired architecture wording from active README/benchmark documentation touched by this story.
- Local proof: dependency lock unchanged; typecheck passed; production build passed; 18 focused tests passed; full unit suite passed (1,626 passed, 171 skipped); shell syntax, workflow YAML parsing, schema aggregation, and diff whitespace checks passed.
- Corrected one stale approved-only degradation test so it explicitly selects approved retrieval instead of relying on an obsolete default.
- Open evidence blockers: live database and benchmark proof must run on the laptop-authoritative runtime or GitHub CI; AC-10 needs green and controlled-red workflow URLs.

### File List

- `.github/workflows/epic-24-evidence.yml`
- `README.md`
- `package.json`
- `vitest.config.live-db.ts`
- `scripts/ci/collect-evidence.ts`
- `scripts/ci/collect-evidence.test.ts`
- `scripts/ci/lint-changed.sh`
- `scripts/ci/lint-changed.test.ts`
- `scripts/ci/run-live-db-tests.sh`
- `scripts/ci/run-benchmark.sh`
- `docs/portfolio/evidence-schema.json`
- `docs/portfolio/capability-matrix.md`
- `docs/portfolio/evidence-index.md`
- `src/__benchmarks__/run.ts`
- `src/__benchmarks__/run.test.ts`
- `src/__benchmarks__/BENCHMARK-README.md`
- `src/__tests__/retrieval-benchmark.test.ts`
- `_bmad/bmm/stories/24-1-ci-benchmarks.md`
- `_bmad/bmm/stories/24-1-code-review.md`
- `_bmad/bmm/stories/sprint-status.yaml`

### Status Evidence

- Implementation gate: complete for review; no commit or push performed.
- Pike/Fowler adversarial review: PASS after remediation of all evidence-integrity findings.
- Review receipts: Pike `625c0297-2ef5-4851-9f91-f2b808bd758f`; Fowler `8434242e-78cd-448d-a5c5-e0cc0278172d`.
- Implementation outcome receipt: `6b5b8a2b-e981-4394-be3e-edc5369d2b52` (episodic, pending curator review).
- Story remains not done until all acceptance criteria, including remote green/red evidence, are satisfied.
