# Woz promotion-outbox savepoint implementation evidence

> [!NOTE]
> **AI-Assisted Documentation**
> Drafted with AI assistance from executed local receipts. This is bounded engineering evidence, not full SEP acceptance, production deployment evidence, or proof of real network-fault recovery. Defer to the source, tests, fixture output, and explicit human decisions.

## Approved scope

- Baseline: `ebb3957058884e84ebdac54dd8c27554e46326ef`.
- Contract: retain the scoped claim and row lock in one restricted workspace transaction; create a savepoint after claim; execute event insertion and delivered transition inside the savepoint; on delivery SQL failure, roll back to the savepoint and write fenced failure/backoff in the same outer transaction.
- Delivered and failure transitions must each return exactly one row.
- Public counters change only after acknowledged outer COMMIT.
- BEGIN/SAVEPOINT/ROLLBACK TO/RELEASE/COMMIT and bookkeeping errors propagate. No second bookkeeping transaction and no blind retry.
- Shared tenant helper, schema, roles, payload, limits, attempt/backoff policy, approval state, and canonical memory content remain unchanged.

## RED receipt

A detached temporary worktree at the exact baseline commit received only the new regression test and unit-lane registration. Command:

```text
/home/roninhub/workspaces/allura-acceptance-tools/bun-1.3.14-baseline/bun run test:unit src/lib/memory/__tests__/promotion-outbox-worker.test.ts
```

Result: **exit 1; 16 failed, 2 passed (18 total)**. Expected failures covered the baseline second bookkeeping transaction, missing savepoint, missing delivered cardinality fence, swallowed transaction-control/COMMIT errors, and counters resolving through the wrong boundary. The temporary worktree was removed after execution.

## GREEN and static receipts

Focused unit command:

```text
/home/roninhub/workspaces/allura-acceptance-tools/bun-1.3.14-baseline/bun run test:unit src/lib/memory/__tests__/promotion-outbox-worker.test.ts
```

Result: **exit 0; 18 passed, 0 failed**.

Unit inventory command:

```text
/home/roninhub/workspaces/allura-acceptance-tools/bun-1.3.14-baseline/bun x vitest list --config vitest.config.unit.ts src/lib/memory/__tests__/promotion-outbox-worker.test.ts
```

Result: **exit 0; all 18 test names selected**. This proves the unit config registration is active rather than relying on `passWithNoTests`.

Typecheck:

```text
/home/roninhub/workspaces/allura-acceptance-tools/bun-1.3.14-baseline/bun x tsc --noEmit --incremental false
```

Result: **exit 0**.

Whitespace/diff gate:

```text
git diff --check
git diff --cached --check
```

Result: **exit 0** for both unstaged and staged evidence.

Broader unit lane:

```text
/home/roninhub/workspaces/allura-acceptance-tools/bun-1.3.14-baseline/bun run test:unit
```

Result: **exit 1; 204 files passed, 7 skipped, 2 failed; 3,223 tests passed, 169 skipped, 1 failed**. The failures were outside this slice in `packages/sdk/test/dist-consumer.test.ts` and `tests/scripts/epic30-completion.test.ts`. Running those same two files in a detached worktree at baseline `ebb3957058884e84ebdac54dd8c27554e46326ef` also exited 1: the Epic 30 validity assertion failed identically, while the SDK dist-consumer suite failed earlier in its baseline DTS build rather than at the current pack-output assertion. The broad unit lane is therefore pre-existing non-clean, but the SDK failure mode is not claimed as an exact-match baseline. No files in either failure path are changed by this slice.

The focused unit suite calls the real worker and real tenant transaction helper through a narrow scripted `PoolClient` transport. It does not simulate PostgreSQL locks, RLS, transaction-abort state, or durability; the disposable fixture owns those bounded database checks.

## Disposable database receipt

Command:

```text
/home/roninhub/workspaces/allura-acceptance-tools/bun-1.3.14-baseline/bun --no-env-file scripts/smoke-promotion-outbox.ts \
  sha256:c7f18b15186a524c1aee66db89485bc6087b87f8b9cb65beba4fc59cfd074c8a \
  sha256:131dcf7ff6a900545df8e7e092c270aa8c6db2f2c818e408cb45ec21316b74e6
```

Result: **exit 0** on a fresh, network-isolated PostgreSQL database with temporary storage.

Executed evidence:

- Applied **71 migrations** and verified the restricted app role is neither superuser nor `BYPASSRLS`.
- Excluded future, exhausted, and quarantined rows while preserving pending-count semantics.
- Delivered once across three workspaces and two tenants; untrusted payload scope could not override row scope.
- Rechecked retry schedule and attempt budget after stale discovery.
- Two simultaneous failed drains produced exactly one failed attempt/backoff and zero events.
- Two concurrent due retries produced exactly one delivery event.
- Injected acknowledgment loss after a real COMMIT propagated the error; the delivered row and one event persisted, and a later ordinary drain did not duplicate.
- Preserved approved proposals/canonical memory content and the pending synthetic proposal.
- Refused missing application authority with no owner fallback.
- Verified exact label/image cleanup and discarded all synthetic test data.

Artifact receipt:

```json
{
  "image": "sha256:c7f18b15186a524c1aee66db89485bc6087b87f8b9cb65beba4fc59cfd074c8a",
  "databaseImage": "sha256:131dcf7ff6a900545df8e7e092c270aa8c6db2f2c818e408cb45ec21316b74e6",
  "fixtureSha256": "2ae14506383ad208462842f73fcc55624ac255a323e4ade83dc755848c8bdd7f",
  "migrationsSha256": "dbb2b70c5715f6f6f111fd86ed5061f36d5d0aa32161cabbb450c196cbc2b29f"
}
```

## Independent review receipts

- Transaction/contract review: **APPROVE** with `0 BLOCK / 0 HIGH / 0 MEDIUM`, one LOW packaging note and one NOTE. The packaging note identified this ignored evidence path; the parent resolved it by force-adding this file to the index so canonical documentation cannot ship a broken link.
- Acceptance-evidence/false-green review: **APPROVE** with `0 BLOCK / 0 HIGH / 0 MEDIUM / 0 LOW`. The reviewer separately inspected the real worker/helper call path, unit registration/cardinality, counter/COMMIT boundary, deterministic fixture barrier, post-COMMIT acknowledgment injection, cleanup, scope preservation and bounded documentation claims.
- Both reviews were read-only and ran no Docker, database, network, secret reads, commits, pushes or deployments.

## Remaining limits

- The COMMIT check injects acknowledgment loss after a successful local COMMIT; it is not a real network partition.
- Automatic unknown-outcome reconciliation/replay is not implemented.
- No continuous worker supervision, external-effect delivery, real human approval, production deployment, or full SEP-02/SEP-07 lifecycle acceptance is claimed.
- Requirements Matrix aggregate SEP statuses remain **Pending**.
- `memory-bank/bmad-output/*` is ignored by default. This evidence file must be explicitly force-added if the implementation slice is committed, or the canonical-doc links will not exist in the resulting revision.

## Reflection

- Action: verified and evidenced the approved same-transaction savepoint repair.
- Principle: preserve transactional integrity and report only acknowledged outcomes.
- Event logged: `TASK_COMPLETE/CODE_REVIEW` persisted to `allura-faithmeats` as episodic memory `93570118-08ec-4cc7-97b8-dcae69d28e9f`; pending governed review, no semantic promotion.
- Neo4j promoted: No.
- Confidence: high for the tested unit and disposable PostgreSQL scope; bounded by the limits above.
