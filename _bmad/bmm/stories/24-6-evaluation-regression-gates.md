# Story 24.6 — Evaluation and Regression Gates

**Epic:** 24 — Agentic AI Framework and Harness Portfolio Readiness
**Status:** ready-for-dev
**Priority:** P0-Critical
**Complexity:** Large
**Owner:** unassigned
**Dependencies:** Stories 24.4 and 24.5

## User Story

As a shared-platform owner, I need versioned evaluation suites and regression thresholds, so that changes to memory, policy, orchestration, or tools cannot silently reduce correctness, safety, or performance.

## Context

The repository contains governance, retrieval, audit, curation, latency, and load-test assets. They need one result contract, declared thresholds, stable datasets, baselines, and CI enforcement. Deterministic offline evaluations are the required gate; live-provider runs are supplemental evidence only.

## Scope

- Create a versioned evaluation suite and result schema.
- Adapt existing benchmarks and scenario assertions into the common contract.
- Establish committed datasets, thresholds, and baseline update governance.
- Add security, correctness, replay, and performance regression lanes to CI.
- Produce human-readable and machine-readable reports.

## Out of Scope

- Comparing every commercial model provider.
- Treating a single laptop latency run as an enterprise capacity claim.
- Automatically accepting a degraded baseline.

## Acceptance Criteria

- [ ] AC-1: `schemas/allura-eval-result-v1.schema.json` defines suite, dataset revision, environment, thresholds, metrics, failures, and evidence hashes.
- [ ] AC-2: Evaluation configuration declares thresholds before execution; the runner cannot rewrite thresholds from observed results.
- [ ] AC-3: Offline CI evaluates at least retrieval relevance, approved-only recall, policy violation blocking, cross-tenant isolation, promotion correctness, audit completeness, deterministic replay, tool-contract validation, and latency.
- [ ] AC-4: Existing benchmark implementations are adapted or wrapped; duplicate metric implementations are not created without an ADR.
- [ ] AC-5: Dataset fixtures are versioned, tenant-safe, free of secrets/regulated personal data, and have provenance documentation.
- [ ] AC-6: A regression beyond its threshold fails CI and identifies the affected metric, baseline, observed value, and scenario/case IDs.
- [ ] AC-7: Baseline changes require an explicit reviewed file change with rationale; CI never auto-promotes a new baseline.
- [ ] AC-8: k6 or equivalent load evidence records hardware, concurrency, dataset, duration, error rate, and latency percentiles; results are labeled environment-specific.
- [ ] AC-9: Reports are emitted as JSON plus Markdown/HTML derived from the same JSON source.
- [ ] AC-10: Story 24.1 evidence manifests incorporate evaluation artifact hashes and pass/fail status.

## Implementation Files

- `schemas/allura-eval-result-v1.schema.json` — result contract.
- `evals/suites/portfolio.yaml` — canonical portfolio suite.
- `evals/datasets/` — versioned fixtures and provenance.
- `evals/baselines/portfolio.json` — reviewed baseline.
- `src/lib/evals/runner.ts` — common runner and adapters.
- `src/lib/evals/report.ts` — JSON-derived report generator.
- `src/__benchmarks__/` — adapt existing benchmark outputs where required.
- `tests/load/` — align load result metadata with the result contract.
- `.github/workflows/ci.yml` — evaluation and regression jobs.
- `docs/portfolio/evaluation-methodology.md` — methodology and limitations.

## Tasks

- [ ] Inventory existing benchmark metrics, datasets, and thresholds.
- [ ] Define the evaluation/result schema and baseline review rule.
- [ ] Build adapters for existing benchmarks and scenario results.
- [ ] Add missing security, replay, and tool-contract cases.
- [ ] Create sanitized versioned datasets with provenance.
- [ ] Add regression comparison and CI failure reporting.
- [ ] Generate JSON and derived human-readable reports.
- [ ] Run one controlled regression to prove the gate fails correctly.

## Validation and Evidence

The final evidence must include a green run and a controlled red run. Published performance numbers must name the environment and may not be generalized beyond it.

## Definition of Done

- One command runs the portfolio evaluation suite offline.
- Every reported result is traceable to a dataset revision, threshold, code commit, and scenario or benchmark case.
- Regression baselines cannot change without reviewable source changes.

## Dev Agent Record

**Status:** pending

### Completion Notes

(To be filled by the implementing BMAD dev agent.)

### File List

(To be filled by the implementing BMAD dev agent.)

### Status Evidence

(To be filled after gate review.)
