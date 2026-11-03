---
title: '5.3 Bounded fresh-evidence eligibility and truthful retrieval stores'
status: done
created: 2026-10-26
baseline_commit: 76de97af4
---

# Contract

AD-70 source: docs/allura/RISKS-AND-DECISIONS.md:688–699. Independent development review text is superseded by the direct-build instruction; human semantic approval remains unchanged. This fresh rebuild has no Neo4j store: graph/semantic and raw events are PostgreSQL-derived, vector retrieval is native RuVector. Do not label two PostgreSQL paths independent durable-store availability.

Explicit all-mode defaults omitted limit10; finite numeric1..100 only, floor supplied fractions after range validation; reject before stores. Every authorized source gets up to normalized limit independently before final output limit, including raw evidence even when graph/vector batches fill capacity. Approved-only never fetches raw evidence. Existing5.2 semantic search remains unchanged until real federation is accepted.

Internal candidate policy uses exact ID, immutable full content, score/scoreKind, nullable explicit confidence, createdAt, source kind and durable metadata. Do NOT reinterpret capture threshold, cosine similarity, lexical rank or human approval as confidence. min_score filters explicitly known confidence before enrichment; unknown confidence is excluded when that filter is supplied, rather than invented. Literal ordering is case-insensitive trimmed full equality, then query-in-content, then existing score, stable ID. Empty query has no literal preference. No score inflation or new public rank/fusion field. Same-ID differing content keeps the best literal representation; same-ID byte-identical vector/event keeps vector score/scoreKind and newest actual PostgreSQL metadata. No semantic relevance guarantee.

Live adapter acceptance: current memory:read plus own-capture OR explicit evidence:read for raw source; current authority and lifecycle revalidation; raw results clearly labeled unapproved evidence, never semantic; no pending proposal leakage; raw/vector/semantic independent bounded batches; per-path succeeded/failed and actual attempted/used reporting, partial/all-failure tests and no authorization fallback; real DB/native regression against full batches. Separate SQL-derived graph from optional browser UI.

Pure merge-policy unit tests alone are not live federation acceptance. No deployment or product completion implied.

## Implemented and locally exercised — admission6

Full source revision corresponding to original abbreviated baseline:76de97af4930e40158fb6a38a6a160de2b96a331. Forward011 adds scoped capture/vector/visibility helpers and common Unicode-whitespace literal priority. retrieval-federation.ts independently collects SQL semantic, real native RuVector and eligible raw-event candidates in bounded savepoints. Existing no-status semantic search remains compatible. Explicit status approved/all dispatches the new path. Unknown confidence stays null; min_score is not reused as cosine threshold. Public snippets256 characters with truncation, source kind/approval, lifecycle/version and honest path/store outcomes. Internal durable metadata enriches without changing native scores; not all capture metadata is returned in search snippets.

Native snapshot ceiling256 approved versions plus256 eligible event vectors, independent per-path output up to normalized1..100, explicit candidateTruncated. Native embed+search deadline2000ms; statement/lock/gateway budgets remain. Empty query skips native embedding honestly. Savepoint failures allow remaining authorized paths; all-path failure returns failed, not empty success. Total PostgreSQL loss cannot resolve authority and fails closed rather than serving unverified cached results. Graph/semantic and events are two PostgreSQL paths, not independent durable stores.

`cd foundation && bun run check:all` exit0,106tests/817assertions; restricted PostgreSQL84/653, zero fail/skip/missing; TypeScript/ESLint pass. Evidence: Operations/direct-build-20261026/admission6-story5.3-final.log. Eight real DB/native/HTTP cases plus four required pure-policy cases. Tested actual indexed foreign tenant and workspace, explicit approved-only raw exclusion, raw-only exact discovery with full semantic/native batches, indexed same-ID score preservation, unknown confidence, invalid limits before provider calls, actual SQL privilege-induced partial/all failures, provider failure/timeout, lifecycle change during retrieval, independent human HTTP and rejected caller authority selectors. Unicode bounded-selection regression reproduced red then fixed both SQL source paths.

Authority row FOR SHARE locks serialize grant changes with admitted retrieval. An initial test incorrectly awaited an UPDATE blocked by that lock inside embedding; it induced the genuine deadline, not midflight revocation. Corrected test proves UPDATE cannot commit while admitted read holds authority, then proves the next read loses raw visibility after commit. Gateway additionally records initially required evidence privilege and rechecks it before response. Product security was not weakened to satisfy the test.

No independent development review occurred. Ranking calibration, no-answer behavior and measured p50/p95 remain5.4; no broad relevance/native-readiness claim from raw fallback. UI, deployed consumers and release remain later gates.
