# First-use evidence and limitations

AI-Assisted Documentation: receipt, 2026-10-20. Source base `28d90e843` plus the reviewed working changes. This separates an actual configured-connector observation from offline runner tests and missing end-to-end evidence.

## Actual configured-connector observation

Using the existing authenticated Brain tools in project scope `allura-system`, the evaluator saved one uniquely marked PostgreSQL decision. The service reported episodic storage, score0.7, ID `f2ed2180-94d5-4049-92f0-ccb4d0357f40` at2026-10-20T22:30:57.635Z. An exact-ID read returned the same content with episodic/manual provenance.

Search was then called with the unique marker, `status: all`, `include_global: false`, limit10. It returned10 historical graph records and did **not** include that ID or exact content. The response reported graph-only use without a degraded flag. No underlying root cause is established by that observation. Unrelated memory bodies are omitted from the [sanitized connector receipt](connector-evidence.json).

A focused follow-up kept the same authenticated group and global-exclusion setting, explicitly set minimum score0 and limit20, and again did not return the saved ID. This rules out treating the first10-result observation alone as the final evidence; it does not identify a root cause. Both sanitized request/result summaries are retained.

**Verdict:** capture and exact read verified through the configured connector; the fresh-evidence search task did not pass. No independent HTTP sessions, clean installation, current human approval or human study were established. No alternate tenant, endpoint or credential was tried after this result.

## Local repair and independent review

The public SDK now accepts an optional identity assertion and explicit approved/all search selection. The example no longer invents the developer's identity or tenant. The maintained runner requires supplied endpoint/token/group, write acknowledgment and two distinct initialized sessions; it checks both ID and content, does not retry the save, and retains a sanitized reconciliation locator on uncertain failure.

- Selected SDK source suites:82/82 pass, reported by Woz; independent Pike/Fowler focused subsets also passed.
- SDK ESM/CJS/declaration build and typechecks passed. Emitted tracked artifacts align with source.
- Final runner offline protocol/recovery checks:10/10 pass; independently rerun by Pike after fixes.
- Independent [interface review](technical-review.md): two recovery findings corrected and verified; no remaining blocking scoped finding.
- Independent [maintainability review](maintainability-review.md): no blocking scoped implementation finding; documentation refresh applied.
- An explicit CLI run with empty client configuration exits1 at configuration with `INVALID_BASE_URL` and `save_may_have_committed: false`. This is a negative configuration check, not a live attempt.
- The legacy packed-consumer SDK test failed before execution at sandbox `spawnSync bun EPERM` and contains banned npm invocation. It was not retried or reported green.

The offline checks use controlled responses; they establish validation/recovery behavior rather than live persistence. The public SDK example provides a lighter result than the raw runner; it cannot substitute for the runner's explicit transport-session receipt.

## Reader workload baseline

The primary guide now asks the person to use the existing authorized agent connection: one save prompt, a fresh session, then one discovery prompt and comparison with the save receipt. It requires no additional checkout or token. The optional developer runner still needs a repository checkout/dependencies and three operator-supplied connection values; it handles session creation, one save, closure and a second-session search. These are documented task structures, not observed time or effort improvements. Connection provisioning, service operations and independent human review remain work performed by their owners. Do not count absent provisioning or review as automation.

No clean isolated install has been demonstrated. The primary Compose file depends on existing external resources. Nine legacy harness scenarios were attempted but stopped before their intended result on unavailable database connectivity; their fixture expectations are not observed workflow successes. No shared infrastructure, tenant or credential was changed to force a pass.

## Skill and study follow-through

The [repository-local first-use validation skill](../../../.opencode/skills/allura-first-use-validation/SKILL.md) captures the observed evidence distinctions and links to the runner/protocol. Static skill validation passes; its independent synthetic evaluation is recorded separately. This is not a globally installed plugin or a new product requirement.

Sabir confirmed he can arrange five participants. The [study kit](usability-study.md) is prepared, but actual observations remain0/5. Comprehension, unaided completion, reviewer burden, revision and retesting remain open.

## Continuation: source diagnosis and simpler reader path

The shared guide now starts with Allura tools already connected to the agent. Its primary task needs no repository clone or second token; optional developer verification remains available in a deliberate expansion. The fresh-session search prompt does not supply the earlier record ID, so discovery is observed before a separate exact-ID reconciliation check. The [participant task card](participant-task.md) uses the same distinction. This is an editorial improvement, not an observed unaided-completion result.

A real Scout [source recon](search-boundary-recon.md) established the local capacity gate with an existing offline test: one passed, 29 skipped. Graph capacity can prevent raw-event candidate collection, and stored-confidence ordering can still evict a literal match after collection. The remote service revision remains unknown. [AD-70](../../allura/RISKS-AND-DECISIONS.md#ad-70-bounded-candidate-eligibility-for-fresh-evidence-search) records the bounded local repair. Woz established a passing 30-case baseline, then ten failures with new regressions, then 46/46 passing mocked integration checks. Pike's independent initial review also ran 46/46 but found misleading degraded metadata. Two stronger assertions failed before that correction and passed after it. The final re-review and budget follow-through are recorded below.

The producer's final local compatibility checks pass: search plus canonical contracts 63/63, runtime API schemas 76/76, root typecheck exit0 and scoped whitespace clean. The TypeScript attempted-store vocabulary now agrees with the existing runtime schema; no wire field or database schema was added. A unit-lane invocation selected no API-schema tests and is not counted as validation. These offline results do not turn prior connector misses into success or authorize remote deployment. Literal candidate selection does not establish successful natural-language discovery across an arbitrary corpus.

Fowler's subsequent review found that the source's floored limit had no finite accepted range. Brooks specified explicit all-mode's omitted default 10 and supplied finite 1..100 validation before floor normalization. Woz's budget regressions produced 12 failures with 54 passes before correction; final producer verification passes 66 search tests plus 17 canonical-contract tests (83 total), root typecheck and scoped whitespace. Omitted/1/100/fractional budgets, invalid inputs before store calls and unchanged other-status behavior are covered. Pike and Fowler each independently reran 66/66 search tests and closed their scoped findings; their reports record the final three source hashes. This supersedes the earlier 46-case source snapshot, without changing the separate 76-case runtime-schema check. No deployment or live discovery acceptance follows.

Process evidence is explicit: Scout's root-cause diagnosis `0e41bef8-f1d5-4c10-8ae0-39612b838488` predates implementation. The separately named `debug:root_cause_found` marker `25ef6a4b-80dc-42cc-9abd-bd6f9db23f39` was written/read back episodically at2026-10-20T22:59:20.097Z, pending review on write, after initial local edits and before any release. Do not represent that marker as logged before the first edit. No release occurred.

## Storage labels remain separate from human review

The guide-correction outcome `069da703-9a92-4b80-98fc-e498712d1608` was reported by its producer as stored in both stores and read back from semantic storage with an `auto-curator` attribution. The producer requested neither promotion nor a supplied identity. This observation provides no independent human decision receipt and is not counted as the goal's human-review demonstration. It reinforces the rule that a storage label alone cannot establish human approval. No service promotion configuration was changed or diagnosed by this documentation task.

## Existing connection verification — user steering

Sabir directed continued use of the existing `allura-brain` MCP connection and supplied Gilliam's verification receipt `d6db87ea-9386-4e5d-848d-ea2072bbd798` in `allura-system`. A fresh parent `memory_get` using that exact ID succeeded. The receipt, created at 2026-10-20T23:26:00.534Z, reports successful configured-launcher initialization, tool discovery, search and write with the existing connection. The parent directly verified receipt readback; it did not rerun those separate launcher operations or retrieve credentials.

Use this connection for Allura access. Do not request a production token or retrieve credentials for the isolated trial. A tool failure, if any, must be reported with the tool name, sanitized operation/stage and exact error, separately from authority to create trial resources. This readback returned no tool error. Earlier sandbox Docker-socket and DNS failures are separate observations; later approved read-only checks succeeded.

This connection receipt does not establish the earlier specimen's discovery, an isolated clean install, trial-resource approval, independent human promotion or publication. Its semantic storage label does not supply a human decision receipt.

A focused recheck after that instruction used the same existing connection and `allura-system`: exact-ID readback again returned the specimen with its expected decision marker; search requested `status: all`, `include_global: false`, `min_score: 0` and limit 20. The search completed without a tool error in 55,846 ms client elapsed time, returned 20 older semantic records, and missed the specimen's exact ID/content. It reported graph use, zero RuVector results and no warnings. The [sanitized receipt](connector-evidence.json) preserves this third result without unrelated memory bodies. The deployed revision remains unknown; no new save, credential action, tenant change or promotion was attempted. Successful tool access and failed discovery remain separate findings.

### Separate reviewer write error

Fowler's first publication-isolation outcome write returned the exact error `metadata.agent_id must match verified workspace scope`. The corrected call omitted the unsupported optional persona assertion and used the same authenticated connection, `allura-system`, content and source metadata. It succeeded as `59ff740e-0031-4a2f-97be-4c0ddd8153b9`, followed by exact-ID readback. No guessed identity, credential retrieval, tenant change or trial-resource action was used. The readback reported semantic storage; independent human approval remains unverified. This attribution error is not a production-token request or a trial-runtime approval failure.

## Final local documentation checks after connection steering

The current canonical guard and docs-only backend/link guard both pass: `bash .github/scripts/docs-allura-canonical-guard.sh` and `bash .github/scripts/docs-backend-residue-guard.sh --docs-only`, exit 0. The latter exposed an ambiguous enum-vocabulary explanation in the new Data Dictionary paragraph; that paragraph now describes the existing accepted labels and historical compatibility vocabulary without implying a retired backend is active. No schema or runtime behavior changed.

A separately attempted regression-harness run, `bun run test:unit src/__tests__/docs-backend-residue-guard.test.ts --reporter=dot --silent`, failed all 66 cases during temporary-repository setup with the exact error `spawnSync git EPERM`. Its fixtures could not initialize; no regression pass is claimed. The actual docs-only shell scan above completed successfully. These are local validation observations, separate from working Allura Brain access and trial-resource authority.

The coordinated continuation outcome was written through the existing connection as `cb5ce47e-8652-487d-82da-ba40077f6438` in `allura-system`, at 2026-10-20T23:57:13.503Z. Write reported episodic/pending review; exact-ID readback verified episodic source and the expected marker. Neither operation returned a tool error. No credential retrieval, trial runtime action or semantic promotion was involved.

## Draft PR CI correction — 2026-10-21 UTC

The exact initial 104-file candidate was published with Sabir's approval as [draft PR #169](https://github.com/Allura-Ecosystem/Allura_Memory/pull/169), initial commit `dd9a9705cc4e93efcdaad9d7bb12eca64af7ddfc`. All 104 immutable-commit files were verified without credentials; public main still has the older README. Initial CI exposed a real dedup score regression, so the earlier narrow 66-test success did not establish the unchanged benchmark's quality gate.

Bellard measured the same unchanged 13-case benchmark on isolated public-base and candidate exports with identical installed dependencies: base 13/13, MRR 0.833333; candidate 12/13, MRR 0.566667. Integration failed that same assertion. The identical-content PG replacement discarded actual RuVector scores and substituted the raw default 0.5. The bounded correction retains the existing eligible scored representation while enriching matching durable provenance/time/tags and marking its metadata owner to prevent an older identical raw row from overwriting the newest metadata. Raw-only scores, per-candidate min-score filters and differing-content/literal rules remain intact.

Before corrective edits, parent root-cause receipts `28b03768-d2a0-49a0-8e17-b46f3c9e1e3e` (disclosure labels) and `46da5e6f-6eff-4df6-970e-c239204035d0` (score loss) were written and exact-marker read back. This timing applies to these follow-up corrections; it does not rewrite the earlier initial implementation's separate process record. Storage labels do not establish human approval.

Woz's RED checks reproduced three failing assertions among 69 search cases and one failing unchanged benchmark assertion. GREEN passes 69 search plus 13 benchmark and 17 contract tests (99 total), restoring mocked MRR to 0.833333 without lowering its 0.75 threshold. Parent repeated the corrected source inside the isolated review worktree: 69 search, 94 benchmark/contract/trial/runner and 53 SDK checks pass (216 total), with typecheck exit 0. No clean dependency install, image, live provider/database or production relevance result follows.

The first managed-worktree SDK/typecheck attempts failed on temporary files with `EROFS: read-only file system` and TypeScript `TS5033`; approved reruns with write access to those temporary artifacts passed. These filesystem errors are distinct from Allura access or trial-resource authority. The separate exact-label disclosure rule produced 30 failures before and zero after the independently reviewed label-only correction; no workflow or acceptance check was weakened. Independent final source fingerprints and scoped review results are retained in the technical and maintainability reviews. Remote follow-up CI, deployment, actual separate-session discovery, clean installation/recovery, independent human review and all five participant sessions remain separate gates.

### Import ordering and inherited smoke boundary

On follow-up head `bb18eea9c1d366ad7dd00106997105cf8d0efc17`, remote documentation disclosure, Check, unit and integration gates all passed. Epic 24 Static separately found three `sort-imports` errors in the quickstart and two first-use test files. The installed rule reproduced exactly three errors; reordering only named members within those three existing declarations gives zero errors, 64 relevant first-use tests pass and typecheck exits 0. Module/declaration order, imported bindings, type modifiers and all non-import bytes remain unchanged. Pre-edit root-cause receipt `1d27717f-cf03-427d-b522-3a474ca33f59` was written/read episodically before this mechanical correction. Original snapshot fingerprints remain dated evidence; the review manifest records current hashes.

The tenant-smoke job failed with `PRINCIPAL_MISSING: memory_add requires a verified credential-issued write capability`. Its script, workflow and authenticator are byte-identical between public base and follow-up head, as is the `memory_add` body. The inherited harness constructs a raw scope and calls the canonical function without a transport-issued capability. No matching historical base run was returned, so this is static source-parity evidence plus the actual current failure, not an executed base result. The smoke was not run locally, no authority was fabricated and no guard, tenant, credentials, workflow or permission was changed. This CI harness issue remains distinct from the verified existing Brain connection and from trial-resource approval.
