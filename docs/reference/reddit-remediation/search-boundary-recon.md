# Fresh-evidence search boundary recon

> AI-Assisted Documentation: source diagnosis, 2026-10-20. This report changes documentation only. It does not authorize a runtime repair, credential change, database query or deployment.

## Scope and hydration

- Repository HEAD: `28d90e84364d1f99e67df4f8a4ebdaafb6fcf0d9`; inspected current working files, including pre-existing changes.
- Systematic-debugging-memory skill loaded. Reused Scout context and receipt `fa6609d0-7f19-4068-8ff1-78efbc8fb794` plus the parent’s fresh allura-system search receipt (trajectory `04e50807-e399-445e-b47a-8de8862801e4`). That search returned three historical semantic records and no current first-use proof. Unrelated bodies are excluded.
- Remote evidence is limited to the configured authenticated Brain connector, identified by the user as `mcp.faithmeats.org`. No credentials or alternate endpoint/tenant were sought, and this recon made no network or database calls.
- Evidence input: [sanitized connector receipt](connector-evidence.json). Remote deployment revision is unknown.

## Observed and expected

**Observed:** saving decision `f2ed2180-94d5-4049-92f0-ccb4d0357f40` returned episodic storage; exact-ID get returned the same ID and content. Two same-scope unique-marker searches requested status `all`, limits 10 and 20; each returned the requested number of historical graph records and omitted the saved record. RuVector returned zero records. The follow-up also used `min_score: 0` and `include_global: false`.

**Expected for the proposed first-use journey:** finding fresh saved evidence should be demonstrated before documentation claims that a later session can discover it through search. Exact-ID recovery proves persistence/read access; it does not establish discovery through search or approved status. Saving did not report a human approval.

## Source trace and first failing boundary

| Boundary | Current source evidence | Implication |
|---|---|---|
| Transport argument handling | `src/lib/auth/principal-context.ts:465` copies input then removes authority keys; `status` is not stripped | An explicit status all survives this local argument path |
| Stdio tool dispatch | `src/mcp/memory-server-canonical.ts:475` forwards args to the coordinator; its schema declares status | No local status rewrite found |
| Coordinator | `src/lib/memory/memory-coordinator.ts:182` forwards the request to canonicalTools.memory_search unchanged | No graph-only early return is implemented in the coordinator |
| HTTP tool dispatch | `src/mcp/canonical-http-gateway.ts:824` forwards args directly to memory_search | Local HTTP discovery schema omits status, but dispatch itself does not remove it; remote connector discovery is separately observed to expose status |
| Approved-only branch | `src/mcp/canonical-tools.ts:399–410` defaults missing status to approved; explicit all bypasses approved-only return | The observed RuVector trajectory metadata is consistent with the all branch, although it cannot prove the remote revision |
| Candidate allocation | `src/mcp/canonical-tools.ts:466–475` asks graph for the remaining capacity; `:511–512` enters raw episodic fallback only if totalSoFar < limit | If graph fills the requested capacity, the event fallback is skipped even under status all |
| Final merge | `src/mcp/canonical-tools.ts:570–580` merges only already-collected candidates and sorts by stored score | The omitted event cannot reappear in this merge; query relevance is not the final sort key |

**First locally established failing boundary:** candidate allocation before the raw episodic event fallback. Status all selects a capacity-based fallback pipeline rather than an unconditional episodic-plus-graph candidate union. In the observed shape (RuVector zero + graph filling the limit), the local branch never searches unembedded episodic event content.

**Local root cause statement:** a full earlier result set gates off the raw event query. This is directly established by the current source and an existing offline test. It is a plausible explanation of the remote result shape, not proof that the configured remote service runs these files or that this is its only defect.

## Nearby behavior and limitations

- The graph adapter first attempts full-text matching, then word-level trigram matching at a 0.15 threshold when full text returns no rows (`src/lib/graph-adapter/ruvector-adapter.ts:294–377`). Fuzzy candidates can therefore fill capacity. The report did not execute its SQL or measure the remote marker’s similarities.
- The canonical search function does not reference request min_score or include_global inside its all branch. Setting min_score to zero therefore cannot force the raw event fallback in the inspected local implementation. Remote behavior remains unproven.
- `baseMeta` sets stores_attempted to postgres+graph by default (`src/mcp/canonical-tools/validation-utils.ts:122`). Those names in the observed receipt do not prove that a raw episodic-event query ran; graph storage also uses PostgreSQL.
- Current source comments and test labels still say Neo4j, but the selected production graph adapter is PostgreSQL/RuVector. No backend switching is proposed.

## Offline confirming evidence

Command run against the actual canonical search function with the existing mocked-store test:

```bash
bun vitest run src/__tests__/memory-search-ruvector.test.ts -t 'should NOT query PostgreSQL if RuVector \+ Neo4j satisfy limit' --reporter=dot
```

Result: exit 0; one test passed, 29 skipped. The test at lines 369–373 supplies one RuVector result plus one graph result for limit two and asserts that the raw PostgreSQL fallback is not called. It proves the local capacity gate, using mocked stores. It does not simulate the exact remote record, prove database contents or establish a fresh-install/live end-to-end pass.

## One falsifiable hypothesis and next safe validation

**Hypothesis:** the configured service uses the same fallback allocation; its graph results fill the candidate limit while the fresh decision has not entered the RuVector index, so raw episodic search never runs.

A bounded future implementation task should first create a regression case around the existing canonical search seam: same authorized workspace, zero RuVector results, a graph batch filling the requested limit, and a fresh exact-marker event candidate. Assert that the exact event remains eligible under status all, while approved-only retrieval still excludes it. The current implementation is expected to fail that desired-behavior assertion. This report neither adds the test nor chooses a new ranking contract.

Before attributing that defect to production, obtain authoritative evidence of the configured deployment revision and inspect the equivalent branch in that revision. If it differs, trace that version instead. Any repaired runtime then needs the same configured authenticated connector to demonstrate exact-ID get and fresh-marker search, plus separate-session evidence, without changing tenant, credentials or approval status. An approved ranking/recall contract and bounded independent technical review are required before any patch/deployment claim.

No repeated remote query, auto-promotion, endpoint workaround, broader data access or new credential is needed to establish the present source finding.

## Source fingerprints

| Inspected file | SHA-256 |
|---|---|
| `src/mcp/canonical-tools.ts` | `737550e1134c9db14ec8176544725898a26007a85d8ebbe673310301d2cb2bae` |
| `src/lib/memory/memory-coordinator.ts` | `e5b04b4864435547612110e282b302c78f189689f1fe33c36a56f0caaf838a69` |
| `src/lib/graph-adapter/ruvector-adapter.ts` | `8e41441579fe4bae08479a9605a827ea63d8546d771a6656e03e2c88a3286431` |
| `src/lib/auth/principal-context.ts` | `99f6f8076e05b5e3c9c0beb76dabc20efcf545d9cb16296695f38fa14bacd351` |
| `src/mcp/memory-server-canonical.ts` | `d54a3744d8b291594a67ba6669db514ea0645a6533590c126ee6c5777498089d` |
| `src/mcp/canonical-http-gateway.ts` | `26ad66fb1bec617ae68cb4fad88c44350965c5ee0a9481bd7e5bada837555b68` |
| `src/__tests__/memory-search-ruvector.test.ts` | `4fa5b8d66e85b7b38b395ae73d2e58e1566b5f9186d3b5ae9d2239151a112a56` |

## Terminal state

Documentation-only recon complete. Product discovery-through-search remains unverified/failed for the observed specimen; exact-ID retrieval is verified by the supplied connector receipt. Remote deployment attribution, runtime repair, clean installation, distinct transport sessions and human approval remain open.
