import { type SQL } from 'bun';
import { type Identity } from './authentication.ts';
import { type Scope } from './authority.ts';
import { scopedTransaction } from './persistence.ts';
import { runDefinition } from './run-contract.ts';
import { createWorkBudget } from './work-budget.ts';

export type PreparationClaim = Readonly<{ runId: string; leaseId: string; invocationId: string; fence: number; operationReceiptId: string }>;
const budget = createWorkBudget({ capacity: 2, timeoutMs: 2000 });
// No handler runs before its claim transaction commits. Measurement and every
// effect/checkpoint write are one guarded PostgreSQL-local transaction.
export async function finishPreparation(sql: SQL, identity: Identity, scope: Scope, claim: PreparationClaim, external?: AbortSignal): Promise<void> {
  await budget.run(async signal => {
    signal.throwIfAborted();
    await scopedTransaction(sql, identity, scope, 'workspace:grants:manage', async tx => {
      signal.throwIfAborted();
      // Missing installed provenance is incompatible, not a substitute digest.
      const definition = await runDefinition().catch(() => null);
      await tx`SELECT allura.finish_run_prepare(${scope.groupId},${scope.workspaceId}::uuid,${claim.runId}::uuid,${claim.leaseId}::uuid,${claim.invocationId}::uuid,${claim.fence},${claim.operationReceiptId}::uuid,${definition}::jsonb)`;
      // Execute deferred constraints while abort still forces rollback.
      await tx.unsafe('SET CONSTRAINTS ALL IMMEDIATE');
      signal.throwIfAborted();
    });
  }, external);
}
