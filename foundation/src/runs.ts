import { type SQL } from 'bun';
import { isAuthenticated, type Identity } from './authentication.ts';
import { AuthorityError, type Scope } from './authority.ts';
import { scopedTransaction } from './persistence.ts';
import { parseStartRun, runDefinition, RunError } from './run-contract.ts';

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
