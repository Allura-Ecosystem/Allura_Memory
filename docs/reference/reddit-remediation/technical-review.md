# First-use technical review — Pike

AI-Assisted Documentation: independent, read-only source review, 2026-10-20. Base commit `28d90e843` plus current working changes. This review owns this report only; no source, runtime, credentials, database, or board state was changed. Final scoped review result: **no blocking findings after the recovery fixes below**. The initial findings are preserved with their disposition; no live first-use approval is implied.

## Findings

### Resolved P2 — Preserve the public example's locator when a save becomes uncertain

`examples/quickstart/index.ts:15` puts a fresh UUID inside the decision text, but the final catch at lines 45–47 suppresses that marker, the request stage and any known saved ID. If the save commits and its response is lost—or the subsequent search fails—the caller sees an instruction to reconcile before rerunning without a record locator. A deliberate retry then appends another randomly marked decision. The primary runner already retains a run ID and known saved ID in its failure receipt; apply that same recovery contract to the public example. Retain a run ID outside the operation scope, supply it as the conversation reference, and output only the sanitized stage/run ID/known saved ID on failure. Do not expose backend errors. Verify a lost-save-response and post-save-search failure preserve the locator without retrying the save.

### Resolved P3 — Do not use a rejected output argument as a filename

`scripts/first-use-memory.ts:166–175` detects `--output --allow-write` as an invalid output path, then catches the configuration failure. Line 197 nevertheless writes the receipt because the original `output` variable is still the truthy string `--allow-write`. The command can create an unexpected file named after a flag despite rejecting the argument. Keep a validated output target separate from the raw argument, or guard the final write with the same validation. The malformed-output case must make no service request and create no flag-named file.

## Contract checks supported by source

- SDK `MemoryAddParams.user_id` is now an optional assertion; the new public example and raw runner omit it rather than inventing an actor.
- SDK search accepts `approved` or `all`, rejects other explicit values before transport, and preserves omission for approved-only default behavior.
- Built ESM/CJS code and public declaration changes contain the same optional identity/status contract.
- The raw runner creates an official MCP client/transport with a supplied bearer token. It has no auth-provider upscoping or credential fallback; local installed transport source only retries auth when an auth provider is present.
- The first initialized client is closed before another is created. The runner rejects absent or reused session IDs.
- Search uses `status: all`, the supplied authorized group, and `include_global: false`; both exact ID and exact content must match.
- The runner never substitutes a similar result and never performs a promotion or deletion.
- The raw runner disables stream reconnection attempts; the SDK example sets `retries: 0`. An uncertain save is not automatically repeated.
- Save-time pending review is separate from `approval_status: not_verified_by_this_check`. Backend storage labels do not establish human approval. Missing review signals remain `not_reported`.
- Strict response parsing can fail a result with missing required source/provenance rather than fabricate those values. That is a failed check, not proof the service lacks the record.
- The guide explicitly limits the executable path to a provisioned endpoint and keeps clean installation, human promotion and human usability open.

The raw runner is the stronger evidence path: the shorter SDK example initializes another client but does not inspect session identifiers itself. Its README points to the runner for that explicit check.

## Independent checks run

| Command / inspection | Observed result | Scope |
|---|---|---|
| `bun run test:unit tests/scripts/first-use-memory.test.ts` | 7/7 tests passed | Offline injected protocol success/negative paths; no real persistence |
| `bun run test __tests__/memory.test.ts` from `packages/sdk` | 29/29 tests passed | SDK operation contracts; no live gateway |
| `git diff --check -- packages/sdk/src/types.ts packages/sdk/src/memory.ts packages/sdk/dist examples/quickstart/index.ts examples/quickstart/README.md docs/user-guide/getting-started.md` | Exit 0 | Whitespace for scoped tracked changes |
| Current source, SDK transport and public declarations | Inspected | Confirms source contracts, not production behavior |

Producer-reported wider SDK suites, typechecks and build were not independently repeated here. No packed-consumer/npm route or database command was run. Parent's Context7 receipt covers the official MCP client/transport API, and the installed SDK source was inspected for resend behavior.

## Reviewed fingerprints

These identify the initial reviewed files; source fixes require focused re-review and a new fingerprint.

| File | SHA-256 |
|---|---|
| `scripts/first-use-memory.ts` | `4e513733b6de846c07c91b78fa902b5bebed8349f949dd20355f3fb8892c653f` |
| `tests/scripts/first-use-memory.test.ts` | `abb863d5d3e3b7d85d64fe2ace2f4a574ad67c70ff7c01433d5039e4d08347bb` |
| `packages/sdk/src/types.ts` | `f6383e3be919b027861a83ba50c5af63cb82ac61c851a619a6b99eda13ca1baf` |
| `packages/sdk/src/memory.ts` | `7054cadc3ad845455f2034f42130adf97820a8fa3a27485ad2c70d8e8947ac1d` |
| `examples/quickstart/index.ts` | `e1189a8be525d525880327916925229972f1210d11a6c0f22a65441c2352dc61` |

## Memory and remaining gates

Governed Brain search ran in `allura-system`, status `all`, three results, trajectory `1672e20b-0dc8-4f04-a0e1-c90707af40b9`. Results were historical/unrelated and do not prove this first-use path. The current source and command output above establish this review's evidence.

Open: live authenticated two-session exact-record run, isolated clean installation, independent human review demonstration, five observed participants, broader Fowler maintainability gate where required, and authorized publication. This report grants no merge or release authority.

Outcome trace: `3e569ec7-7c6d-485d-81d3-2aa3d5e57bf5` at 2026-10-20T22:29:50.096Z. The tool reported storage in both stores; this is not a human approval or requested semantic promotion.

## Focused re-review after producer fixes

Both findings are resolved in the current working source. The public example retains a run ID before the first request, passes it in `metadata.conversation_id`, records a known saved ID immediately after the save response, and wraps failures using only stage/run ID/saved ID. The CLI reports those sanitized locators and save uncertainty. No backend error text or automatic retry was introduced.

The raw runner now keeps `outputCandidate` separate from a validated `output`; a following flag is rejected, and the final write sees no output target. The negative test invokes the malformed argument in a disposable directory and observes zero created files.

Independently reran `bun run test:unit tests/scripts/first-use-memory.test.ts`: **10/10 passed**. This includes uncertain-save locator retention, failed-later-retrieval identity retention and invalid-output no-file behavior. Scoped whitespace checks passed. SDK identity/status source hashes are unchanged from the initial review; the previously observed 29/29 SDK memory tests remain evidence for that source. The producer reports final root typecheck and broader SDK checks separately.

**Verdict:** no remaining blocking interface/recovery finding in this bounded offline slice. This does not approve release, live retrieval, clean installation or human usability. The parent reports a configured-connector save and exact get, followed by an exact-marker search that did not return the saved record. That observation remains a live retrieval gap; an offline check cannot close it, and this review does not infer a root cause.

Updated source fingerprints and final outcome receipt follow.

| File | Re-review SHA-256 |
|---|---|
| `scripts/first-use-memory.ts` | `9201f0cefb624af2f1e4a3c731d69f0aef85e47f9a325d4e865fda0f02e0815c` |
| `tests/scripts/first-use-memory.test.ts` | `a17b09143b5ad142ec4a8d886a67236b6a3061503f873b382e5ead29a15a3bd5` |
| `examples/quickstart/index.ts` | `8426cccd990937264aa29271ccc43936b7876eb7541030f920b9bb9976d3a13d` |

Final follow-up trace: `e724f642-847b-4bdf-85b8-17b1338335c3`, 2026-10-20T22:33:11.152Z. Tool reported both stores; no human approval or semantic promotion was requested.

## Bounded search-contract consultation — Pike

Source-only consultation, 2026-10-20, after the configured connector's saved-record discovery failure. The [Scout diagnosis](search-boundary-recon.md) is local evidence. The remote deployment revision remains unknown; this section neither proves a deployed root cause nor authorizes a runtime/database mutation.

### Existing contract and the faulty allocation

The current MCP tool describes `status: all` as including unpromoted episodic traces (`src/mcp/memory-server-canonical.ts:168–173`). `MemoryRetrievalStatus` describes `all` as independent of status (`src/lib/memory/canonical-contracts.ts:125–132`). The first-use goal requires the new saved record to remain discoverable without promotion. Those sources support searching eligible episodic evidence even when an earlier store fills the output count.

The local implementation instead treats each later store as a capacity fallback: graph is skipped when RuVector fills the limit, and event search is skipped when RuVector plus graph fill it (`canonical-tools.ts:466–475,511–512`). The existing tests explicitly preserve those skips. Replace those assertions with the desired all-mode candidate contract; a green test for the skip is evidence of the defect, not an acceptance gate to preserve.

Simply querying the event store is insufficient. At the merge, graph `item.score` is retained while its distinct query `relevance` is dropped; raw event matches receive a fixed score of 0.5. The global confidence-score sort can therefore evict the exact newly saved decision in favor of higher-confidence fuzzy graph candidates. The graph adapter itself sorts query relevance before stored confidence (`ruvector-adapter.ts:316–326,357–371`), and BE-AC03 explicitly separates confidence from query relevance. Those sources support a relevance-aware repair; they do not specify a calibrated cross-store fusion algorithm.

### Recommended narrow contract for Brooks to record before implementation

1. For explicit `status: all`, collect bounded candidates from each currently supported authorized store rather than allocating only remaining output slots. Use at most the validated request limit per store and return at most that limit after merge. Keep the approved-only path unchanged and never auto-promote evidence.
2. Preserve all existing group/workspace/principal arguments and the tenant transaction helper. An absent or mismatched verified scope must fail before store access. Do not introduce a different tenant, credential, global lookup, or direct database path.
3. Make a literal exact query/content match the narrow relevance priority, then retain the existing score order for the remaining candidates. Keep public `score` unchanged; do not relabel confidence as query relevance or invent a new response metric. This is an explicit local policy choice implementing the first-use retrieval expectation, not a claim that wider ranking is solved. Record the literal comparison rule and deterministic tie behavior in Design/Requirements.
4. Apply the documented `min_score` confidence filter before final selection. An exact match below the caller's threshold must not bypass the filter. The current all branch ignores it; correcting that omission needs a regression case. Retain default behavior when the filter is absent.
5. Deduplicate only after an exact candidate cannot be discarded by an earlier non-exact representation of the same ID. For an event and its vector projection with the same ID/content, prefer durable event provenance and creation time over the current vector mapper's synthesized `conversation`/current-time values. Do not silently imply human approval when a semantic representation exists. Preserve one result per ID and test the chosen metadata policy.
6. Report actual attempted stores and partial failures truthfully. `baseMeta` currently predeclares postgres+graph attempts, so it cannot establish that raw event search ran. A failed store must preserve available authorized results with explicit degraded/warning metadata rather than claiming a complete healthy search.

The finite per-store budget must use a validated integer request bound. Reuse an existing authoritative server bound if available; if the server lacks one, Brooks should specify the accepted range/error behavior explicitly rather than introducing an undocumented arbitrary cap. Do not add a user-facing tuning knob or fixed store quota for this repair.

### Required regression evidence

- Zero vector candidates; graph fills the output limit with higher-confidence non-exact candidates; a same-scope exact event remains in the bounded result.
- Vector alone fills the limit; the authorized graph/event queries are still considered for all mode.
- Exact candidate has a lower confidence than fuzzy candidates but remains first; its public score is unchanged. A caller min_score that excludes it still excludes it.
- Duplicate vector/event representations cannot hide an exact event or replace known manual provenance/time with synthesized metadata; output IDs remain unique.
- Non-exact candidates retain the documented ordering/tie policy and final output remains within limit.
- Store failure produces truthful attempted/degraded metadata and no scope-broadening fallback.
- Missing/foreign workspace scope performs no store call; graph and event calls receive the same verified tuple.
- Approved-only requests do not read unpromoted episodic events. No approval/promotion operation is invoked by any search path.

These are local regression checks, not production proof. Existing vector-workspace hardening gaps remain outside this bounded allocation/ranking consultation; no end-to-end workspace security acceptance is granted here.

### Decision boundary

The federated-candidate correction follows the current all-mode description. Exact-content priority, duplicate metadata preference and any missing server budget bound should be recorded as Brooks's bounded implementation contract before Woz writes the patch. They require no invented brand-strategy approval and do not authorize deployment. A new general fusion algorithm, changed public score meaning, recency/store quotas, expanded global search or broader lifecycle behavior would require a separate product/architecture decision and evaluation.

After the local repair and independent review, the exact configured authenticated connector still needs source-revision attribution and the same saved-record search check. Separate transport sessions, fresh installation, human review and user usability remain their own open evidence gates.

Hydration: reused the parent's scoped search trajectory `04e50807-e399-445e-b47a-8de8862801e4` (three old semantic records) and read the current affected source/tests. No new database/runtime call or source edit was made by this consultation.

Consultation outcome trace: `02a56b63-0711-4451-b535-90d24e6fc7b4`, 2026-10-20T22:46:55.007Z; stored episodic, pending review. No semantic promotion or deployment approval was requested.

## AD-70 implementation review — initial pass

Independent source review of `src/mcp/canonical-tools.ts` and `src/__tests__/memory-search-ruvector.test.ts`, 2026-10-20. The preceding recovery verdict applies to the SDK/runner slice; this new search-source slice initially requests the metadata correction below.

### Resolved P2 — Unavailable stores still report `degraded: false`

The all-mode path initializes `searchMeta` with `baseMeta([])`, whose default degraded flag is false. The final metadata object adds warnings but leaves that flag unchanged. If graph and raw events fail while vector results are available—or all three stores fail—the response reports unavailable-store warnings alongside `degraded: false`. Callers such as the new first-use runner explicitly inspect that flag. The new partial/all-failure tests assert warnings but do not assert the degraded field, so 46 passing tests do not establish this part of AD-70.

The smallest correction is scoped to explicit all-mode response metadata: record actual attempted stores, and set degraded when an attempted store failed, with the existing warning values retained. Do not change approved-only behavior, add a new health certification, or interpret a successful store call as an end-to-end healthy service. Add assertions for healthy, partial-failure and all-failure cases. Parent was notified and requested the producer correction; final verdict is pending its re-review.

### Other source findings

- Default and explicit approved-only requests return before the new candidate/selection branch. Their graph-only degradation behavior remains intact.
- Explicit all-mode requests collect at most the existing normalized limit from vector, graph and raw-event candidates, independent of earlier result capacity. Final output is capped after merge.
- The existing request-limit normalization and server-boundary validation are not broadened by this repair. This review does not establish a new accepted limit range or cap.
- Proposed/deprecated statuses retain their existing fallback allocation, first-representation dedup and score ordering; their wider lifecycle semantics are not newly verified by AD-70.
- Graph reads retain the verified group/workspace/principal tuple. Raw-event reads retain `tenantPgQuery` and the workspace argument. Missing verified scope fails before any source call. Existing vector workspace-hardening gaps remain a separate acceptance item, not a new pass claim.
- Confidence filtering runs before selecting a duplicate representation. Exact or literal priority cannot rescue a representation below the explicit minimum.
- Normalized full-content equality outranks literal containment, which outranks existing score ordering; returned scores remain source values. Empty queries receive no literal priority.
- A matching duplicate representation survives an earlier nonmatching one. An eligible raw event with identical ID/content replaces vector-synthesized provenance/time. A filtered-out event does not bypass the confidence filter to become the chosen representation.
- Search performs no human approval, promotion, identity substitution, new-tenant lookup or runtime configuration change.

### Independent command evidence

`bun vitest run src/__tests__/memory-search-ruvector.test.ts --reporter=dot` completed with **46/46 passing mocked-store tests**, exit 0. The suite covers the source seam; it does not prove database contents, real RLS grants, deployed source revision, configured-connector recall, transport sessions, human approval or corpus-level relevance.

## AD-70 final focused re-review

**Final verdict: no blocking interface finding in the bounded local AD-70 implementation.** The candidate-allocation/ranking repair and the subsequent degradation correction were inspected against the recorded decision. This verdict grants no deployment, broad relevance, workspace-security, clean-install, human-review or user-study acceptance.

The metadata finding is resolved: attempted-store entries are pushed at the actual vector, graph and raw-event attempt sites. Explicit all-mode final metadata sets `degraded` from this function's failed-source warnings and reports the collected attempts. Healthy, partial-failure and all-failure assertions now check both fields; approved-only degradation remains separate. The one-line `MemoryResponseMeta.stores_attempted` union addition permits `ruvector`, which the existing runtime API Zod schema and public SDK already accept. This aligns a stale TypeScript union with an existing runtime value rather than creating a new field or transport behavior.

### Independently verified final evidence

| Check | Observed result |
|---|---|
| `bun vitest run src/__tests__/memory-search-ruvector.test.ts --reporter=dot` | **46/46 mocked-store tests passed**, exit 0; final summary retained in `/tmp/pike-ad70-final-tests.log` |
| `git diff --check -- src/mcp/canonical-tools.ts src/__tests__/memory-search-ruvector.test.ts src/lib/memory/canonical-contracts.ts` | Exit 0 |
| Default/approved boundary | Returns through the unchanged approved-only path before vector/raw evidence collection; tests cover default, explicit approved and graph failure |
| Independent source budgets | Full vector/graph capacity cannot skip authorized graph/raw-event attempts; each contribution is truncated to the existing normalized request limit before bounded final selection |
| Scope preservation | Group/workspace/principal arguments and raw-event tenant transaction helper remain; missing verified workspace rejects before any source call |
| Selection and score meaning | Trimmed case-insensitive equality, literal containment, then existing score order; source scores remain unchanged; empty query gets no priority |
| Explicit minimum | Confidence filter runs before duplicate selection; exact matching does not override it |
| Duplicate metadata | Matching representation is retained; identical eligible event/vector content prefers actual event provenance/time |
| Failure reporting | Healthy, partial-failure and all-failure assertions agree with attempted-store/warning/degraded fields |
| Other statuses | Proposed/deprecated preserve the prior non-all fallback, duplicate and ordering path; this does not newly certify their wider lifecycle semantics |

The producer's additional search/contract 63-test run, API-schema 76-test run and root typecheck are separately reported; this review independently reran the 46-test source seam and inspected the existing accepting schemas rather than claiming those broader commands were rerun here. No database connection, runtime, credential, tenant or deployment was changed by Pike.

### Stable reviewed source

| File | SHA-256 |
|---|---|
| `src/mcp/canonical-tools.ts` | `79aee85a5cf17bf0f9f4e0e1474dc39ab22def6495dc1ac51b6dbe9fd5450dea` |
| `src/__tests__/memory-search-ruvector.test.ts` | `5e187323a5b24705dc15dac1c3e970c4e89afb441099a95c42f9732df1dbb9cb` |
| `src/lib/memory/canonical-contracts.ts` | `1cdb6e7744e3cf6b30ede91b7c248f49020223aa2779d3f1fffd9c22c9c78156` |

Scoped Brain search trajectory `8d0cf89f-b029-4360-b36e-39f3de1e11a8` returned three historical records. A prior metadata-contract alignment record was relevant context but not current verification; unrelated retrieved content is omitted. Local current-source fingerprints and command output above establish the verdict.

### Remaining goal gates

The configured connector's save/exact-get and failed fresh-marker search remain a separate observation. Its deployed source revision is unknown; this local repair is not proof of its root cause or a deployed fix. The same authorized endpoint needs revision attribution, live exact-record discovery, separate initialized transport sessions and independent human-review evidence. Isolated fresh installation and the five-person study remain open. No semantic approval or external publication was performed.

Final AD-70 review outcome: `7bc65ef4-0f6c-4485-8903-2a00493c4850`, written at 2026-10-20T22:57:30.192Z and read back by matching ID in `allura-system`. Write tool reported both stores; readback source was semantic. This observed storage response is not an independent human approval receipt, and Pike requested no promotion.

## AD-70 final budget-bound re-review

Fowler's budget finding led Brooks to clarify the explicit all-mode input contract before this source change. An omitted limit defaults to 10. A supplied limit must be a finite JavaScript number in 1..100 inclusive; floor normalization then retains prior fractional handling (`2.9` → `2`). Invalid values reject before any retrieval store call. This bound applies only to explicit all-mode; approved/default and proposed/deprecated handling remain unchanged. The earlier no-new-bound observation in this report describes the preceding revision, not this accepted clarification.

The final guard implements that decision before the verified-scope/store sequence. Independently reran:

```bash
bun vitest run src/__tests__/memory-search-ruvector.test.ts --reporter=dot
```

Observed **66/66 mocked-store tests passed**, exit 0; final summary retained in `/tmp/pike-ad70-budget-final-tests.log`. Twelve invalid input cases (zero, negative, sub-one, above-100, non-finite and nonnumeric/null values) reject with zero vector/graph/raw-event calls. Omitted/1/100/2.9 cases assert every backend budget and final output count, including defensive truncation of oversized mocked responses. Additional mode-specific cases show that the new guard does not apply to default/approved or proposed/deprecated modes. Scoped whitespace check also passed.

The previous candidate selection, score/filter, durable metadata and failure-reporting assertions remain in this same green suite. The canonical response-type union is unchanged from the preceding metadata review. This is a bounded candidate-count check, not a latency, real RLS, live relevance, deployment or human-approval guarantee.

**Final local interface verdict remains: no blocking finding in this reviewed AD-70 patch.** Live configured-connector discovery, authoritative remote revision, separate transport sessions, clean installation and actual human validation remain open.

| Final file | SHA-256 |
|---|---|
| `src/mcp/canonical-tools.ts` | `84b1ada868d28e8d759873705c5a5a1c949aab053657fba8794b5b683499f835` |
| `src/__tests__/memory-search-ruvector.test.ts` | `5e1c462391283f7c2546eb5c02445a161a84192345c1319f5e640983e96fa1b9` |
| `src/lib/memory/canonical-contracts.ts` | `1cdb6e7744e3cf6b30ede91b7c248f49020223aa2779d3f1fffd9c22c9c78156` |

Budget-bound final review trace: `29a62122-f1e9-4282-b719-03aa6e63cfaf`, 2026-10-20T23:01:13.516Z; stored episodic, pending review, and read back by matching ID/source in `allura-system`. No semantic promotion or deployment approval was requested.


## AD-70 CI score-preservation review — 2026-10-21 UTC

**Findings: no blocking interface/correctness finding in the bounded two-file correction.** This verdict concerns the current fingerprints below. Earlier dated reviews, their hashes and the prior identical-content score expectation describe historical revisions; they are preserved rather than silently recertified. In particular, the prior green 66-case suite did not expose the unchanged benchmark's ordering regression. The current review includes that benchmark and the corrected score/metadata contract.

### Root cause and repaired boundary

Bellard's [CI diagnosis](first-use-evidence.md#draft-pr-ci-correction--2026-10-21-utc) establishes that the initial draft's same-ID, byte-identical raw-event replacement discarded a genuine RuVector score in favor of the raw default `0.5`. That could move relevant indexed results behind unrelated results even though the relevant IDs remained available. Brooks recorded the bounded score-preservation clarification in AD-70 and pre-edit root-cause receipt `46da5e6f-6eff-4df6-970e-c239204035d0` before Woz changed source.

The current merge enriches an already eligible same-ID, byte-identical RuVector result with PG provenance, creation time and tags while retaining its original content, score, source and other response fields (`src/mcp/canonical-tools.ts:607`). Setting the internal owner to PG ensures the first/newest raw event remains the metadata owner when an older identical raw row follows. That owner is internal; no public field or API is added. The raw query's existing descending creation-time order supplies the newest-first precondition.

Reviewed branch boundaries:

- Each candidate is filtered by explicit `min_score` before entering deduplication. A filtered raw event cannot donate metadata or borrow an eligible indexed score; the existing same-ID minimum-score test checks retained vector provenance.
- Raw-only IDs remain scored `0.5`. A different-content representation may replace the earlier one only through the existing stronger literal-match rule, retaining its own score rather than copying the old content's score.
- Equality for metadata enrichment is byte-identical content, not merely normalized/literal similarity. Empty queries, literal priorities, graph selection, finite independent source budgets, output limits and attempted/degraded metadata are unchanged by this patch.
- Approved/default retrieval exits through its existing separate path; other non-all statuses skip the all-mode deduplication branch. Scope validation, workspace/principal arguments and the tenant query boundary are unchanged. Mocked scope tests are not real RLS or deployment proof.
- AD-70's current canonical clarification covers the correction. No new schema, transport, identity, fusion algorithm or acceptance threshold is introduced.

### Independent validation and exact scope

```sh
bun vitest run src/__tests__/memory-search-ruvector.test.ts --reporter=dot
bun run test:unit src/__tests__/retrieval-benchmark.test.ts --reporter=verbose
```

Observed **69/69 focused mocked-store tests** and **13/13 unchanged benchmark tests**, both exit 0. Logs: `/tmp/pike-ci-search-final.log` and `/tmp/pike-ci-benchmark-final.log`. The search file was selected through the default Vitest configuration because the unit lane excludes it. No unselected test run is counted.

The unchanged mocked benchmark reports MRR **0.8333**, Precision@5 **0.8667**, Recall@5 **0.9333**, retaining the existing MRR threshold of 0.75. These figures are printed to four decimals by this suite; they are not measured production relevance. Source inspection confirms meaningful direct assertions for score plus durable metadata, nonliteral duplicate ranking, first/newest raw metadata, raw-only scores, per-candidate filtering and differing-content selection. Budget, scope, other-status and degradation assertions remain present in the same green focused suite.

An independent byte diff against `/tmp/allura-reddit-ci-diagnosis/candidate/` exactly matches the provided two-file patch. Its added lines have zero trailing-whitespace violations. No benchmark assertion, configuration, workflow, managed worktree, Git/index/remote, runtime, database or credential was changed by this reviewer. The only authored change is this append; the existing disclosure-label correction and all prior report bytes are retained. Producer-reported contract tests and typecheck are separate evidence, not independently rerun here.

| Reviewed artifact | SHA-256 |
|---|---|
| `src/mcp/canonical-tools.ts` | `019124a48382f4f8e55c94de182a284b5cad2242d9cf061ce340580e8eabe68a` |
| `src/__tests__/memory-search-ruvector.test.ts` | `71e50e7e2a11099e861fbdcc4381f55a30d74e944cb747921ded9c5ac76cc7fd` |
| Unchanged `src/__tests__/retrieval-benchmark.test.ts` | `995c3c951202defa21056c2c3ad14feb76d145d38fda5ca836c69bbef33756e6` |
| `/tmp/allura-reddit-ci-fix/woz-dedup-followup.patch` | `b23efa695a6ebf254ded92ef4e649515100728643f130a97406f1af5cad1f563` |

### Hydration, ownership and remaining gates

Pike reloaded the full local role, Allura review/core and governed memory skills, current AD-70 clarification, diagnosis, source and focused assertions. Existing-connection Brain search used `group_id: allura-system`, `status: all`, limit 3; it succeeded with trajectory `c15e19a7-5a3f-4e4d-849e-cf629ef0715c` but returned three older May/June records, not evidence for the current fix. No alternate connection, identity or credential was requested. Parent coordinates the single final outcome write/readback; no child event or semantic approval is claimed.

Remote CI for the follow-up remains unverified by this review. Source deployment attribution, actual separate-session discovery, live relevance, clean installation/recovery, independent human review and the five-person study remain open. This correction does not authorize merge, deployment or goal completion. Existing Brain access supplies scoped memory evidence only; it grants no trial database/runtime authority.
