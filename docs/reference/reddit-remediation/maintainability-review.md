# Independent maintainability review: first-use slice

AI-assisted Fowler review, 2026-10-20. **Scoped offline review: no blocking maintainability finding.** This is not live persistence, clean-install, independent human-promotion, usability, or release approval. Only this report is owned/changed by the reviewer.

## Reviewed behavior and scope

The SDK changes make caller `user_id` an optional identity assertion and add explicit `approved`/`all` search selection. The new evaluation runner creates two MCP clients, closes the save session before opening the retrieval session, requires distinct session IDs and an exact saved ID/content match, and records source/provenance separately from unverified approval. Existing unrelated working-tree changes were preserved.

Root cause was independently read back through the governed interface: `c5e796c1-b89b-445f-944e-f3fd0f3b19e3` in `allura-system`, dated 2026-10-20. Its content identifies the mismatch between SDK identity/search types and the canonical transport/search contract. The storage label in that response is not evidence of a human approval. Parent Scout/Context7 receipts were reused; no database or live gateway operation was performed by this reviewer.

## Findings

No blocking implementation finding in this slice. The change is additive and reversible, has a small behavior-focused test seam, and does not introduce an alternative identity/tenant resolution path.

One documentation evidence refresh is needed before the final packet is accepted: [Requirements Matrix](../../allura/REQUIREMENTS-MATRIX.md) UX-R02 still describes the current setup guide as stale after the guide was corrected. Keep clean installation and a live round trip open, but distinguish those missing demonstrations from the now-completed editorial repair. This was sent to the parent owner; no canonical file was edited by Fowler.

## Maintainability assessment

| Area | Observed evidence |
|---|---|
| Incremental SDK boundary | Optional identity assertion and status selection; runtime validation only accepts the two canonical retrieval statuses. Omitted status remains omitted so the server default is preserved. |
| Public exports | Rebuilt ESM/CJS contain the same validation; declarations expose optional user identity and `status?: "approved" \| "all"`. Source and emitted public contract agree. |
| Isolation and retries | Authorized group remains explicit; neither path invents an identity or changes tenant after denial. Public example sets `retries: 0`; raw runner performs one save attempt and disables transport reconnection retries. |
| Test seam | A narrow session factory exercises distinct-session checks, exact identity/content, uncertain-save behavior, credential-safe failures, unknown review state, and configuration rejection. No storage abstraction or production auth branch was added. |
| Evidence boundaries | Receipt records pending review at save separately from current approval, reports human review unexercised, sanitizes server errors/warnings, and distinguishes record creation time from retrieval observation. |
| Two examples | The public SDK example is intentionally lighter than the raw verification runner. It starts new SDK clients but does not independently inspect the session IDs; its README points to the raw runner for that stricter evidence. Keep those claims distinct if either path evolves. |
| Scope still open | Missing endpoint/principal/infrastructure means no live first-use success. A corrected guide does not establish a fresh installation; human review and five participant sessions still need evidence. |

## Commands independently rerun

- `bun run test:unit tests/scripts/first-use-memory.test.ts`: **7/7 pass**, one test file, offline protocol checks.
- From `packages/sdk`, `bun run test __tests__/memory.test.ts __tests__/client.test.ts`: **53/53 pass**, two test files, offline SDK contract checks.
- Inspected generated declarations and both emitted runtime validation branches. No build or whole-repository/typecheck claim is added by this reviewer; the producer's wider 82-test/build/typecheck receipts remain separate.
- The legacy packed-consumer/npm route, database tests, live endpoint, publication and Notion changes were not run.

## Reviewed source fingerprints

Base commit `28d90e843` plus the actual dirty-tree files below. These hashes identify the reviewed content; changed source needs a focused re-review.

| File | SHA-256 |
|---|---|
| `packages/sdk/src/types.ts` | `f6383e3be919b027861a83ba50c5af63cb82ac61c851a619a6b99eda13ca1baf` |
| `packages/sdk/src/memory.ts` | `7054cadc3ad845455f2034f42130adf97820a8fa3a27485ad2c70d8e8947ac1d` |
| `packages/sdk/dist/index.js` | `ec17917d56bf92c2c24cae9ca165e9cc9b1a9b57c77e1506faba376a9e961802` |
| `packages/sdk/dist/index.cjs` | `b85e952d269785d059dfcf1f1ca990b1b8b1d8e8f0746833bae99a12014c189a` |
| `packages/sdk/dist/index.d.ts` | `bf619385475048335b9211c81e5639af051b00a8f6f4adc5f31fc241349ffe18` |
| `scripts/first-use-memory.ts` | `4e513733b6de846c07c91b78fa902b5bebed8349f949dd20355f3fb8892c653f` |
| `tests/scripts/first-use-memory.test.ts` | `abb863d5d3e3b7d85d64fe2ace2f4a574ad67c70ff7c01433d5039e4d08347bb` |
| `examples/quickstart/index.ts` | `e1189a8be525d525880327916925229972f1210d11a6c0f22a65441c2352dc61` |
| `docs/user-guide/getting-started.md` | `53d24f5e661c51e97866dd17172da8221331e97a099e616ddd6f60213a532aab` |

## Outcome status

Technical maintainability review is complete for the fingerprinted slice, with the documentation evidence wording refresh above. No autonomous semantic promotion or external approval is requested. Outcome receipt `435cee09-32e0-4c59-bd27-494bb4c6a06e` was written and read back in `allura-system`; the write tool reported `stored: both`. No human approval or semantic promotion was requested or verified by this reviewer.

## AD-70 search-boundary review — 2026-10-20

This section reviews a later source slice; the earlier SDK/runner fingerprints above remain historical and do not certify later quickstart changes. Scope here is `src/mcp/canonical-tools.ts`, `src/__tests__/memory-search-ruvector.test.ts`, and the additive `stores_attempted` union in `src/lib/memory/canonical-contracts.ts`. No source was edited by Fowler.

### Resolved finding: P2 server candidate-budget validation

At the initial AD-70 review snapshot, `canonical-tools.ts:396` used `Math.floor(request.limit || 10)` without validating its finite range. The public MCP discovery schemas expose `limit` as a number without a minimum/maximum, and the HTTP dispatch at `canonical-http-gateway.ts:824–825` calls the canonical search directly. In all-mode, that value is now independently used for each of three candidate stores and for slicing. Negative limits can reach the SQL/slice paths, while arbitrarily large values multiply the source work. The Pike consultation explicitly calls for a validated server budget and an accepted range/error contract.

Brooks then accepted an explicit-all-only contract: omitted limit defaults to 10; a supplied value must be a finite JavaScript number in the inclusive range 1–100, and the existing floor behavior remains (2.9 → 2). Woz implemented that guard before any candidate-store call. All other statuses retain their prior behavior. The final 66-test run and source inspection verify this bounded correction. **P2 is resolved; no blocking maintainability finding remains in the fingerprinted AD-70 source slice.**

### Observed behavior that fits the scoped decision

- The approved-only branch remains an early return, without episodic reads. The existing other non-all fallback/dedup behavior remains guarded separately.
- Explicit all-mode supplies each already-authorized store its own normalized candidate count, slices over-returned batches, and takes a final output slice. No new store, credential or tenant fallback is introduced.
- The small ID map retains a better literal-matching representation instead of losing it at first-seen dedup. For identical content it prefers actual event metadata over a synthesized vector representation. An explicit minimum score filters before duplicate selection.
- Literal equality/containment are internal ordering keys; public confidence values are unchanged. Existing score ordering remains the next key. This is a bounded correction rather than a general fusion system.
- `degraded` is now tied to failed-source warnings for all-mode and `stores_attempted` records actual attempted sources. The additive type union admits `ruvector` without an unsafe metadata cast; it agrees with the existing runtime schema/SDK vocabulary.
- Mocked-store regressions exercise allocation, duplicate precedence, explicit confidence filtering, output limits, verified workspace propagation, empty-query priority, approved-only separation, partial failure and all-store failure. They do not establish actual SQL matching, a remote deployment revision, corpus relevance or live two-session behavior.

### Independent commands and evidence

`bun vitest run src/__tests__/memory-search-ruvector.test.ts --reporter=dot`: initial **46/46 pass**; after the budget correction, final **66/66 pass**, exit 0, mocked stores. The final run checks twelve invalid supplied limits are rejected before any store call, valid omitted/1/100/2.9 budgets, output caps, and unchanged non-all input handling. Final source fingerprints matched the producer's stable set:

| File | SHA-256 |
|---|---|
| `src/mcp/canonical-tools.ts` | `84b1ada868d28e8d759873705c5a5a1c949aab053657fba8794b5b683499f835` |
| `src/__tests__/memory-search-ruvector.test.ts` | `5e1c462391283f7c2546eb5c02445a161a84192345c1319f5e640983e96fa1b9` |
| `src/lib/memory/canonical-contracts.ts` | `1cdb6e7744e3cf6b30ede91b7c248f49020223aa2779d3f1fffd9c22c9c78156` |

Targeted source whitespace check passed. This reviewer did not rerun the producer's wider contract/API-schema/typecheck commands; those are separate receipts. No database, runtime, network deployment, credentials, tenant configuration or human promotion was changed.

### Root-cause logging and remaining proof

Scoped Brain search returned three unrelated/historical records; none establishes a current approval. Independently read-back trace `0e41bef8-f1d5-4c10-8ae0-39612b838488`, created `2026-10-20T22:44:31.744Z`, records the pre-implementation Scout diagnosis and capacity-gate evidence. It is titled `SEARCH_BOUNDARY_RECON`, not `debug:root_cause_found`. The explicit-marker-before-first-edit process gate is therefore **not claimed passed**; Brooks recorded explicit marker `25ef6a4b-80dc-42cc-9abd-bd6f9db23f39` at `2026-10-20T22:59:20.097Z`; it was independently read back. That marker follows initial local edits and precedes any claimed release, so it does not retrospectively satisfy marker-before-first-edit. Source diagnosis and offline tests do not prove that the remote connector runs this revision. Exact configured-connector retrieval, separate transport sessions, clean installation, independent human review and human usability remain open.

### Final AD-70 verdict

**Scoped maintainability pass:** bounded, reversible local correction with meaningful regression coverage and no remaining implementation blocker found. Preserve the explicit-marker timing limitation above. This verdict does not close remote deployment, configured-connector exact search, two distinct live sessions, clean installation, independent human review, or five-user acceptance. The old missing-local-endpoint observation in the earlier SDK review is historical; a configured connector now exists, but its deployment/source attribution and repaired live behavior remain unverified.

AD-70 review outcome `73820aa2-436b-46d8-83a1-7652b5a156b5` was written and read back in `allura-system`; write response reported `stored: both`. No human approval or semantic promotion was requested or verified by this reviewer.
