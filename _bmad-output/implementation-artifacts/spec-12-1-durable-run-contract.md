# Story 12.1 — durable-run contract adoption and first build handoff

**Evidence class:** adopted local design/documentation only; specified, not implemented/verified runtime, not story closure or live operational status. Date: 2026-10-31. Role: one canonical Brooks/Woz documentation writer; no nested agents or independent developer-review claim. Parent inspects the diff and owns eventual commit/build admission. Allura operational status remains unknown.

## Authority and admitted inputs

- Clean observed HEAD `7f3b9065d30a78f8d4b20a17392cafd8bf9c02b4`, branch `local/beta-machine-only`, repository `/home/sabira/Allura_Memory-beta-local`.
- Current [adapter](../../guidelines/ALLURA-BMAD.md), full installed `.agents/skills/bmad-correct-course/SKILL.md` and `checklist.md`, actual customization/config resolver outputs, nested PRD/catalog/architecture/readiness/brief and retained protected UX references.
- [Applied all-14 Correct Course](../planning-artifacts/sprint-change-proposal-2026-10-31-all-14-local.md) records explicit owner application approval: all existing 14 epics locally; Allura-only writable live status/Notion planning; Linux-first remote connection to the existing server; tunnel untouched. These settle scope/direction, not the remaining Story 13.1 work-item mechanics or Story 14.1 secure connection/update/package/framework contracts.
- Original candidate `/home/sabira/.hermes/profiles/troy/workspace/allura-12-1-contract-candidate-2026-10-31.md` SHA-256 `56adfdc304a5c6019d1079e521c174772863528e989d1db35e30031513b06897` remains unchanged. Its historical source admission was `0ff7f87ff4c600c24039d5276b7934538d914825`; parent released the compiler freeze before this docs pass. Current compiler specs/reports/source remain excluded and preserved.
- Adopted canonical [durable-runs-v1 contract](../planning-artifacts/contracts/durable-runs-v1.md), SHA-256 `45461b319548eb8a54859556b90e08bec431ab1b8b012aaa24dae79b56a1036b`. This digest binds detailed design, not an executed implementation. The contract's S1–S18 source map retains candidate snapshot line references; paths, not shifted planning line numbers, select current files.

## Final adopted local design choices

These are ordinary engineering defaults adopted through delegated design authority, **not Sabir quotations**:

1. Existing Bun/TypeScript/PostgreSQL, one core gateway and service-owned short transactions; durable runs/journals outside Brain. No new package, queue, service, daemon or authority plane.
2. Only trusted data-only `local-evidence-handoff` revision 1: `prepare` measures raw UTF-8 artifact SHA-256/bytes and the two fixed gates; `review` waits for an exact independent designated current human; `handoff` appends one local receipt. Caller prose is not proof its claimed tests ran. No arbitrary evaluator/command/handler, network effect, agent dispatch, work-item mutation or semantic writeback.
3. Strict versioned DTOs, immutable definition/policy/input/handler digests and exact evidence binding. PostgreSQL normalized JSON digest for envelopes; raw-byte artifact digest. Definition drift blocks rather than silently upgrading an old run. Private lease/binding data is not public inspection.
4. Human-admin-only v1: existing `workspace:grants:manage` plus run predicates; `audit:read` for designated review/inspection. Owner and independent designated reviewer are explicit/current; machine/service/device/owner-linked/selected clients denied. No Action union, identity/grant schema or client-ceiling expansion. Recheck current authority and stored bindings before every operation/new effect/disclosure; approval never stands in for present reviewer authorization.
5. Immutable run records/definitions/journal/approval/operation/effect receipts; guarded mutable runtime projections, composite scoped references, forced RLS and private guarded SQL. Exactly one committed local effect slot per scoped run/step, not per attempt. One transaction binds local effect, evidence and checkpoint; no external exactly-once claim.
6. Current-auth replay before expected-revision rejection; original operation receipt retained separately from fresh inspection. Ambiguous commit remains unknown until same-key authoritative reconciliation. Failed/partial/unknown/pending never imply succeeded. Approval and resume bind exact definition/input/evidence/request/revision and current participants; expired/rejected approval cannot renew itself.
7. Linear execution, three attempts/effect, 10-second lease, two-second step deadline; persisted retries after one/two seconds. Four active leases/workspace, process capacity two, one executing step/run; no premature slot release. Cancel fences late completion. These are finite local safety limits, not measured SLOs.
8. Finite admission: 16KiB artifact, 128 journal rows/run, 24-hour run/approval limits, 256 retained/32 nonterminal runs per workspace, 16 definition revisions, maximum 100 events/page. Saturation denies; no deletion/purge of immutable evidence. Synthetic evidence only in initial fixtures; private content/log redaction preserved.
9. Six human routes: start, advance, decide, resume, cancel and inspect in the existing authenticated gateway; no new listener or MCP tool. Decision cannot execute handoff. Resume may drive at most one eligible local step after durable reconciliation/admission. No-store current inspection and explicit typed errors.
10. R12-AC01–12 require real services/restricted DB, two populated workspaces plus foreign tenant, real signed identities, measured gates, exact replay, SQL/commit faults, two processes, actual blocking-PID revocation order, fencing/cancel, bounds/redaction, full discovery and recovery. Unit/source-string checks do not prove DB properties. Initial tracer is a bounded 12.2 slice and groundwork for 12.3, not either complete story.

Contract section 11 clarifies the candidate's optional failed-gate measurement field, public lease omission, content-free projection boundary, separately named start RED, and minimal first-GREEN subset. No product/security scope is expanded by these clarifications. Independent authorized human **semantic** promotion remains a separate invariant and service, never a run outcome.

## Exact next RED — not executed in this task

**Name:** `run HTTP start persists one immutable scoped admission receipt`.

**Initial RED writer allowlist only:**

- Add `foundation/tests/runs-http.test.ts`.
- Edit `foundation/scripts/test-db.ts` for this test's focused owned-target invocation, canonical file registration and exact required-case name only; preserve runner algorithms, STOP, owned-target/no-selector/cleanup and fail/skip/nonzero guards.

Construct the existing production `createCoreGateway` from `foundation/src/core-api.ts` with `foundation/tests/lifecycle-fixture.ts` and its restricted app connection. Import only existing modules for RED. Use a signed current human owner, valid same-origin/CSRF headers, exact workspace selectors, a synthetic nonempty artifact and measured expected SHA-256, and a different bound active same-workspace human run admin/reviewer provisioned in this test's synthetic fixture. Do not alter common reviewer semantics or the shared lifecycle-fixture file.

Call `POST /api/runs/start`; assert HTTP200 **before** querying a run receipt. The current route inventory contains no runs route: expected RED is actual HTTP404 versus200. A module import error, absent table, signing/configuration failure, unrelated earlier gate or zero discovered cases is not that RED. The start response and durable row assertion will later prove one immutable admission receipt; they do not prove execution, pause or handoff. Register the exact case in the canonical required list and run it in the focused owned DB child before the existing OAuth gate so the true failure is observable.

```text
# Working directory: /home/sabira/Allura_Memory-beta-local/foundation
bun run check:toolchain
bun run test:db
```

No DB URL/selection override, no existing service target, no fabricated failure output. `test:db` creates/cleans its own disposable target when the later implementation is admitted. This documentation task ran neither command. Record actual named-case/error/assertion/exit/cleanup evidence before feature code.

## First GREEN and subsequent bounded slice allowlist

After the real RED, the smallest start implementation subset is the two files above plus:

- `foundation/migrations/025-durable-runs.sql` — only if 025 is still next; additive schema/constraints/RLS/guarded functions, never rewrite 001–024.
- `foundation/src/run-contract.ts` — strict inputs, built-in definition and measured gates.
- `foundation/src/runs.ts` — service-owned scoped start transaction and immutable receipt/replay.
- `foundation/src/runs-api.ts` — start route through existing authority boundary; expand to adopted routes only as their REDs are observed.
- `foundation/src/persistence.ts` — migration registration only, no `scopedTransaction` change.
- `foundation/src/core-api.ts` — compose routes into the existing gateway only.
- `foundation/src/gateway.ts` — typed RunError mapping only; no authentication/admission weakening.

Then extend the same vertical tracer incrementally: start → prepare/integrity measurement → durable approval pause → exact designated human decision → fresh-process resume → one local handoff receipt. Add matching denials/faults/fences/revocation evidence before accepting success. The **complete later slice allowlist**, in addition to the files above, is:

- Add `foundation/tests/run-contract.test.ts`, `foundation/tests/runs.test.ts`, `foundation/tests/run-process-fixture.ts`.
- Registration-only edits to `foundation/scripts/test.ts`, `foundation/src/ci-contract.ts`, `foundation/tests/ci-contract.test.ts`; exact matching unit inventory/cases and at least 40 meaningful assertions.
- Additional named-case/file registration in `foundation/scripts/test-db.ts` as cases are built; canonical full DB lane still runs on GREEN.
- `foundation/tests/recovery.test.ts` and `foundation/tests/core-release.test.ts`: exact migration inventory 24→25 only if 025 is the sole addition, plus bounded retained-run backup evidence where needed. Preserve exact manifest equality and existing recovery behavior.

Full exact case names and AC are in contract sections 9–10. No common fixture, existing authority/authentication, migration 001–024, OAuth/device/client ceilings, five-tool schema, dependencies/lockfile, UI/assets, vendor, compiler-witness source/spec/report or other evidence edits. Name/request any genuinely additional file before modifying it; never conceal stale inventory failures or widen tests to false-green. The later builder does not own these canonical docs.

Later GREEN commands from `foundation/`, with genuine command/discovery/assertion/exit/fail/skip/missing/cleanup receipts:

```text
bun test ./tests/run-contract.test.ts
bun run test
bun run typecheck
bun run lint
bun run test:db
bun run check:all
```

`bun run ci` is a separate exact-revision/frozen-install gate with prerequisites, not a name for an uncommitted local check. No hosted/deployed acceptance follows from local GREEN.

## Documentation validation and preservation receipt

Evidence directory: `/home/sabira/.hermes/profiles/troy/workspace/allura-all14-adoption-evidence/`. Admission script/JSON `admission-20261031T143846` records clean HEAD/status, hashes of 1,387 tracked files, unchanged candidate/decision hashes, both actual resolver outputs and exact migration inventory. All six candidate executable anchors matched at admission:

```text
foundation/src/authority.ts    b9a368d38fcd39f7431f7fbabdd5125aba24045a332dbd27e133532ebb4bf230
foundation/src/persistence.ts  aec3aa1147e319b6059b97afed6956f478feedaa811d3b44dbe8e7624cb0096d
foundation/src/gateway.ts      ea8c13a22984dd79d72157e5f2c834334cb25c508f0ad8e2919bbfd37dad2b41
foundation/scripts/test.ts     67f5289bb80c4959034093f946f1aedf6f4c23501f95e2e0f4ee2542fba86fec
foundation/scripts/test-db.ts  bb2b580d5b3f16dd5dbd8f66507ac24306bf7a5a19ec0c92c0182941e45fe623
foundation/src/ci-contract.ts  9fd9cce42379f2c7d33b01665ad9a4e8e7a6fbe1a1bcf9844772f8d9505ae61f
```

The active runner's literal STOP path, `/home/ronin704/Documents/Sabir Asheed/Allura Memory/Operations/direct-build-20261026/STOP`, was checked read-only: absent, not a symlink. It is not relocated or removed. Recheck at implementation admission; all historical retired STOPs remain untouched. No current source conflict blocks documenting this contract; the parent still owns build admission and writer lock.

Final receipt records the exact changed-file allowlist/hashes, all nonallowed tracked-byte preservation, additive-only old-text preservation, Markdown local target validation with pre-existing missing links distinguished, `git diff --check`, untracked-file whitespace checks, unchanged index/HEAD and exact unified diff including new files. The prescribed completion resolver output/exit is retained there. Such checks validate documentation, not runtime behavior or remote health.

Product tests/typecheck/lint/DB/service/network/credential operations are **unrun** for this docs-only change. Remote MCP/governance and Brain/Notion writes are **unperformed**, never claimed passed. Actual 6.5/9.4, hosted/deployed/release/platform/human acceptance remains open. No commit, story closure, live task transition or all-14 completion claim is made.
