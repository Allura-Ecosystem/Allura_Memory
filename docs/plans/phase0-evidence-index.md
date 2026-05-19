# Phase 0 Evidence Index

> [!NOTE]
> **AI-Assisted Documentation**
> This index was assembled by Codex under the Brooks project role. Treat it as
> a local execution ledger. Notion remains the canonical board status authority;
> Brain receipts are audit traces, not proof of Done.

Date: 2026-05-17  
Scope: Allura Memory Phase 0 finish blockers  
Source ledger: `blocking_list.md`

## Purpose

This file consolidates Phase 0 evidence that was previously split across
Notion comments, PRs, local artifacts, and Allura Brain receipts.

It is not a replacement for the Notion Work Board. It exists so closure reviews
can inspect one repo-local evidence map before checking the canonical board.

## Status Summary

| ID | Status | Evidence |
| --- | --- | --- |
| B01 | DONE | PR #28 / commit `0595f78924ef6ba93baa78238e1421ea1047e8a7`; Notion `2.1 Token Audit` moved to Done; Brain receipts `3361ad3a-61b9-43f0-996d-a608c029dd40`, `f5347a2c-84de-4d19-b898-b4e74bf26187`, `2e3d9fe9-10a6-4641-bdda-0a9e057f35ba`. |
| B02 | WAIVED | PR #29 / commit `ae7c11116fba28c4aa493ec74482574b10bf181e`; direct lint/typecheck/tests/browser smoke green; `artifacts/allura-ralph-runtime-waiver-2026-05-17.md`; Notion comments `3631d9be-65b3-816b-96aa-001d27b0d322`, `3631d9be-65b3-81e4-ad7c-001d58868149`; Brain receipt `c6ade62b-4f8c-4ddc-bf19-e1704262249e`; Ralph nested runtime waived for `bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted`. |
| B03 | DONE | PR #33 / commit `999ce78d89580498f6db6685bbe743eb2e7334c8`; `3100` is dashboard UI cutover target; `3334` is Mission Control development integration target; `6420` is visual/reference memory dashboard. |
| B04 | WAIVED | Canonical Notion placeholder/source contract remains at `35d1d9be-65b3-810e-b080-eddc7e036aee`; Captain/source-owner decision recorded to mark cash tracker out of scope for Phase 0 (`artifacts/b04-cash-tracker-decision-record-2026-05-17.md`); `artifacts/cash-tracker-no-claims-evidence-2026-05-17.md` proves no source-based fabrication exists while source is absent. |
| B05 | DONE | PR #30 / commit `b6f5aaa001c4a61793949a8c654ca8dd42d3c1a8`; Notion card `35d1d9be-65b3-81cb-8ad8-c6b903ddd37d`; Brain receipts `4e2b9e18-671f-43c9-97ba-621b31d16731`, `3e2c2eeb-7029-4f66-be16-c654b6cf5788`. |
| B06 | DONE | This evidence index plus `blocking_list.md`, Notion finish-plan comment `3631d9be-65b3-8145-9b87-001d2d156b76`, and Allura Brain receipt consolidate scattered evidence. |
| B07 | DEFERRED | `docs/goal.md` and `docs/plans/allura-memory-finish-plan.md` explicitly block Phase 1 board config until Phase 0 closes; Faith Meats Operations and Lending Compliance remain deferred. |
| B08 | WAIVED | Same direct `/allura` evidence as B02; `artifacts/allura-ralph-runtime-waiver-2026-05-17.md`; Notion comments `3631d9be-65b3-81e4-ad7c-001d58868149`, `3631d9be-65b3-81da-a709-001d7692d4ab`; Ralph nested runtime waived. |
| B09 | DONE | `artifacts/card-2-4-e-approval-guard-evidence-2026-05-17.md`; `artifacts/card-2-4-e-static-review-substitute-2026-05-17.md`; Notion comments `3631d9be-65b3-817c-8101-001d266fa32e` and `3631d9be-65b3-81de-937e-001ddc698090`; Brain receipts `f46103ff-acb6-4f7e-9051-00dacea5eec5`, `cf5a8816-aaa2-4a52-a77c-bb72d357a51c`, `cfebc1a5-52ef-49a3-9104-780b783aa313`; focused tests, typecheck, and static review passed. |
| B10 | DONE | Commit `e75cab8962d6fbfeb31234292f6c863c46109e23` records consolidated B1-B7/C1-C2 L3 evidence sweep with typecheck/build pass in commit message. |
| B11 | DONE | Commit `fbb9cee10d9f65a105a8dbb8e8290e7d731eebf2` reverted invalid D-lane cutover artifacts after Captain rejected stack change. |
| B12 | DEFERRED | `artifacts/cost-ledger-deferral-2026-05-17.md` formally defers token/model cost ledger activation out of Phase 0. |
| B13 | DONE | Notion owner card `35b1d9be-65b3-8154-8b26-ea19c288f96f` records Sabir Asheed as accountable owner for all lanes and Captain acknowledgment received 2026-05-11 04:40 EDT; `OWNERS.yaml` reconciled to `assignee: Sabir Asheed` and `acknowledged: true` for all roles; Notion comment `3631d9be-65b3-8127-b86f-001d4b6dc281`; Brain receipt `812f4150-3377-47c5-80bf-e99a8f1edcda`. |

## Remaining Closure Work

| ID | Required Action |
| --- | --- |
| B02 | No further action unless the nested Ralph runtime is fixed before final closeout; if fixed, supersede waiver with real rerun. |
| B04 | No Phase 0 action required. Official closure: cash tracker is out of scope for Phase 0. Source contract stays as future canonical location for later phases only. |
| B08 | No further action unless the nested Ralph runtime is fixed before final closeout; if fixed, supersede waiver with real rerun. |

## Validation Commands For Current Evidence

```bash
bun test src/lib/memory/__tests__/approval-audit.test.ts src/lib/memory/__tests__/hitl-promotion-lock-policy.test.ts
```

Result recorded on 2026-05-17: 21 pass, 0 fail.

```bash
bun run typecheck
```

Result recorded on 2026-05-17: pass.

```bash
bunx eslint src/lib/memory/knowledge-promotion.ts src/lib/memory/__tests__/hitl-promotion-lock-policy.test.ts src/app/api/curator/approve/route.ts scripts/batch-approve-proposals.ts scripts/e2e-validation-gate.ts
```

Result recorded on 2026-05-17: 0 errors, 5 residual warnings from pre-existing route debt and script ignore rules.
