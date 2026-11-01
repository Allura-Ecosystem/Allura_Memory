import { type SQL } from 'bun';
import { isAuthenticated, type Identity } from './authentication.ts';
import { AuthorityError, type Scope } from './authority.ts';
import { scopedTransaction } from './persistence.ts';
import { parseStartRun, parseRunCommand, parseRunDecision, runDefinition, RunError } from './run-contract.ts';
import { randomUUID } from 'node:crypto';
import { finishPreparation, finishHandoff, type PreparationClaim } from './run-execution.ts';

export async function resumeRun(sql: SQL, identity: Identity, scope: Scope, value: unknown, signal?: AbortSignal): Promise<string> {
  if (!isAuthenticated(identity)) { throw new AuthorityError('unauthenticated'); }
  if (identity.kind !== 'human') { throw new RunError('forbidden'); }
  try {
    signal?.throwIfAborted();
    const input = parseRunCommand(value);
    const receipt = await scopedTransaction(sql, identity, scope, 'workspace:grants:manage', async tx => {
      signal?.throwIfAborted();
      const definition = await runDefinition().catch(() => null);
      const [row] = await tx`SELECT allura.resume_run(${scope.groupId},${scope.workspaceId}::uuid,${input}::jsonb,${definition}::jsonb) AS receipt`;
      signal?.throwIfAborted();
      return row.receipt as string;
    });
    // Admission is already durable. Never invent another public operation key.
    const op = JSON.parse(receipt) as { id: string; runId: string };
    const claim = await scopedTransaction(sql, identity, scope, 'workspace:grants:manage', async tx => {
      signal?.throwIfAborted();
      const definition = await runDefinition().catch(() => null);
      const [row] = await tx`SELECT allura.claim_run_handoff(${scope.groupId},${scope.workspaceId}::uuid,${op.runId}::uuid,${op.id}::uuid,${definition}::jsonb,${randomUUID()}::uuid) AS claim`;
      signal?.throwIfAborted();
      return row.claim as PreparationClaim | null;
    });
    if (claim) { await finishHandoff(sql, identity, scope, claim, signal); }
    return receipt;
  } catch (error) {
    if (error instanceof AuthorityError || error instanceof RunError) { throw error; }
    const message = error instanceof Error ? error.message : '';
    if (message === 'invalid' || message === 'forbidden' || message === 'not_found' || message === 'conflict' || message === 'unavailable') { throw new RunError(message); }
    throw new RunError('unknown');
  }
}

export async function advanceRun(sql: SQL, identity: Identity, scope: Scope, value: unknown, signal?: AbortSignal): Promise<string> {
  if (!isAuthenticated(identity)) { throw new AuthorityError('unauthenticated'); }
  if (identity.kind !== 'human') { throw new RunError('forbidden'); }
  try {
    signal?.throwIfAborted();
    const input = parseRunCommand(value);
    const result = await scopedTransaction(sql, identity, scope, 'workspace:grants:manage', async tx => {
      signal?.throwIfAborted();
      // Missing installed provenance is incompatible, not a substitute digest.
      const definition = await runDefinition().catch(() => null);
      const [row] = await tx`SELECT allura.claim_run_prepare(${scope.groupId},${scope.workspaceId}::uuid,${input}::jsonb,${definition}::jsonb,${randomUUID()}::uuid) AS result`;
      signal?.throwIfAborted();
      return row.result as { receipt: string; claim: PreparationClaim | null };
    });
    if (result.claim) { await finishPreparation(sql, identity, scope, result.claim, signal); }
    return result.receipt;
  } catch (error) {
    if (error instanceof AuthorityError || error instanceof RunError) { throw error; }
    const message = error instanceof Error ? error.message : '';
    if (message === 'invalid' || message === 'forbidden' || message === 'not_found' || message === 'conflict' || message === 'unavailable') { throw new RunError(message); }
    throw new RunError('unknown');
  }
}

export async function decideRun(sql: SQL, identity: Identity, scope: Scope, value: unknown, signal?: AbortSignal): Promise<string> {
  if (!isAuthenticated(identity)) { throw new AuthorityError('unauthenticated'); }
  if (identity.kind !== 'human') { throw new RunError('forbidden'); }
  try {
    signal?.throwIfAborted();
    const input = parseRunDecision(value);
    return await scopedTransaction(sql, identity, scope, 'workspace:grants:manage', async tx => {
      signal?.throwIfAborted();
      const definition = await runDefinition().catch(() => null);
      const [row] = await tx`SELECT allura.decide_run(${scope.groupId},${scope.workspaceId}::uuid,${input}::jsonb,${definition}::jsonb) AS receipt`;
      signal?.throwIfAborted();
      return row.receipt as string;
    });
  } catch (error) {
    if (error instanceof AuthorityError || error instanceof RunError) { throw error; }
    const message = error instanceof Error ? error.message : '';
    if (message === 'invalid' || message === 'forbidden' || message === 'not_found' || message === 'conflict' || message === 'unavailable') { throw new RunError(message); }
    throw new RunError('unknown');
  }
}

export async function startRun(sql: SQL, identity: Identity, scope: Scope, value: unknown): Promise<string> {
  if (!isAuthenticated(identity)) { throw new AuthorityError('unauthenticated'); }
  if (identity.kind !== 'human') { throw new RunError('forbidden'); }
  try {
    return await scopedTransaction(sql, identity, scope, 'workspace:grants:manage', async tx => {
      const input = parseStartRun(value), definition = await runDefinition();
      const [row] = await tx`SELECT allura.start_run(${scope.groupId},${scope.workspaceId}::uuid,${input}::jsonb,${definition}::jsonb) AS receipt`;
      return row.receipt as string;
    });
  } catch (error) {
    if (error instanceof AuthorityError || error instanceof RunError) { throw error; }
    const message = error instanceof Error ? error.message : '';
    if (message === 'invalid' || message === 'forbidden' || message === 'not_found' || message === 'conflict' || message === 'unavailable') { throw new RunError(message); }
    throw new RunError('unknown');
  }
}
