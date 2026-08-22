# Evaluation Methodology

## Overview

The Allura evaluation framework provides offline, deterministic regression
gates that prevent silent degradation of correctness, safety, and performance.

## Lanes

| Lane | Type | Threshold | Description |
|------|------|-----------|-------------|
| retrieval_relevance | offline | P@5 ≥ 0.70 | Retrieval relevance over fixture queries |
| approved_only_recall | offline | ≥ 0.85 | Approved-only memory recall |
| policy_violation_blocking | offline | 1.00 | Policy violation detection and blocking |
| cross_tenant_isolation | offline | 1.00 | Cross-tenant memory isolation |
| promotion_correctness | offline | 1.00 | Atomic promotion correctness |
| audit_completeness | offline | 1.00 | Audit event completeness |
| deterministic_replay | offline | 1.00 | Deterministic replay match |
| tool_contract_validation | offline | 1.00 | Tool contract schema validation |
| latency | performance | P95 ≤ 5000ms | Latency percentils (laptop-specific) |

## Thresholds

Thresholds are declared **before** execution in `evals/suites/portfolio.yaml`.
The runner reads thresholds at startup and cannot rewrite them from observed
results (AC-2).

## Baselines

Baselines live in `evals/baselines/portfolio.json`. A baseline change requires
an explicit reviewed file change with rationale (AC-7). CI never auto-promotes
a new baseline.

## Datasets

All datasets are synthetic, tenant-safe, free of secrets, and have provenance
documentation in the `provenance` field (AC-5).

## Reports

Reports are emitted as JSON plus Markdown/HTML derived from the same JSON
source (AC-9). Both human-readable and machine-readable formats are generated
from one `EvalResult`.

## Limitations

- Latency results are **laptop-specific** and not generalizable to enterprise
  deployments (AC-8).
- Deterministic offline evaluations are the required gate; live-provider runs
  are supplemental evidence only.
- No commercial model provider comparison is included.