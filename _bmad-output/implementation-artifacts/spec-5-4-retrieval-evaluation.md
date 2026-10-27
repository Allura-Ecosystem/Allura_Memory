---
title: '5.4 Versioned local retrieval evaluation and measured budgets'
status: done
created: 2026-10-26
baseline_commit: e76605105da5bb1cc5db1056cd3330d59e77b3d7
---

# Scope

Implement a reproducible, mode-labeled actual restricted-PostgreSQL/offline-model/native-RuVector evaluation. Current, superseded/history, deprecated, exact fresh evidence, no-answer and foreign fixtures must be versioned before measuring. Labels derive from the approved authority/lifecycle requirements and explicit synthetic statements. The user delegated ordinary engineering/test design and removed independent development review; do not claim these labels were independently human-rated. Actual product human promotion requirements remain enforced by signed synthetic human decision fixtures, not bypassed. Human usefulness judgments and hosted release evidence are not established by this local suite.

Code: foundation/fixtures/retrieval-evaluation-v1.json; foundation/src/retrieval-evaluation.ts deterministic metric aggregation; foundation/tests/retrieval-evaluation.test.ts real fixture setup/measurement. Capture actual source HEAD, fixture SHA256, model identity, query modes, corpus/sample sizes, warm/cold distinction, per-query observations, reciprocal rank/precision/recall on answerable cases, no-answer success, freshness, unauthorized/stale returns, p50/p95 nearest-rank latency, failures/timeouts and fallback. No mocked model embeddings in the baseline. Synthetic provider outage/timeout probes explicitly marked injections and excluded from healthy-latency statistics.

First baseline reports defects without erasing inconvenient cases. Any local cutoff decision must follow observed baseline scores and keep confidence filtering separate; frozen fixture data is not tuned to hide failures. Small fixture metrics are conformance observations, not human usefulness, broad semantic relevance, scale or production SLO claims. Fixed security acceptance is zero unauthorized disclosure. Full product remains incomplete until later consumer/release acceptance; no browser/UI claim.

## Local acceptance and measured decision

Completed under the current direct-build methodology: engineering fixture design/self-checks were delegated, not independent human rating. This is the explicit development-method reconciliation of FR-D4's older human-reviewed-fixture wording; it does not assert a real human usefulness study or relax any runtime independent human promotion. Such a study remains unperformed and is not a release claim.

Actual baseline (Operations/direct-build-20261026/admission6-evaluation-baseline.log):33 observations, MRR1/recall1, precision0.5277777777777777, no-answer accuracy0.2, zero unauthorized/stale results. False-positive cosine scores reached0.28267043828964233; a true semantic paraphrase scored0.6940717995166779. Measured local policy cosine-floor-v1 therefore admits native scores>=0.5, with explicit literal full-query substring exception preserving known lexical discovery. No public score inflation, no confidence reinterpretation, no new model/vector identity. The policy is returned in search metadata. Initial cutoff-only implementation broke the existing literal quokka regression; the exception fixes that class without changing test expectations. One additional paraphrase scored only0.5008652210235596: tiny-corpus calibration is not a guarantee for broader language or corpora.

Frozen main fixture SHA2569a115592e70ba14cd3cc38d3933ee5db9fe3e081674a0c97d1930d64ba1db707; additional fixture19a33f82bac026b31a035719700719c7b03da498ac66dfa0416b946a93149b15. Final admission6-epic5-final.log:33 main observations, MRR1, recall1, precision0.9166666666666666, no-answer1, freshTop1=1, unauthorized/stale0; p50 34.43922999999995ms/p95 44.590102999998635ms.12 additional observations have MRR/precision/recall/no-answer1 and unauthorized/stale0; p50 32.59752599999956ms/p95 40.944007000000056ms. Nearest-rank quantiles, warm process cache, tiny synthetic corpus; no production latency SLO adopted. Two separately labeled injected fault probes report one provider timeout and two successful scoped lexical fallbacks; fault timings are excluded from healthy quantiles.

`bun run check:all` exit0 in admission6-epic5-final.log:110tests/848assertions, restricted PostgreSQL88/684, zero fail/skip/missing; TypeScript/ESLint pass. Same owned bytes rechecked successfully in admission7-epic5-check.log. Real database/model/native calls and both independent signed identities exercise the journey; no independent developer review, deployed agent/client, browser UI, scale, cold-start or hosted acceptance is implied. Evaluation logs include source HEAD plus runtime/test/lock digests for dirty-byte provenance.
