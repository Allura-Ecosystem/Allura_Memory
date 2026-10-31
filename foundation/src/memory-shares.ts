import { type SQL } from 'bun';
import { isAuthenticated, type Identity } from './authentication.ts';
import { AuthorityError, validScope, type Scope } from './authority.ts';

export class MemoryShareError extends Error {
  constructor(public readonly code: 'forbidden' | 'invalid' | 'conflict' | 'not_found' | 'unknown') { super(code); this.name = 'MemoryShareError'; }
}
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export async function memoryShare(sql: SQL, identity: Identity, scope: Scope, op: 'approve' | 'revoke' | 'get', body: Record<string, unknown> | null): Promise<Record<string, unknown>> {
  if (!isAuthenticated(identity) || identity.expiresAt <= Math.floor(Date.now()/1000)) { throw new AuthorityError('unauthenticated'); }
  if (identity.kind !== 'human') { throw new MemoryShareError('forbidden'); }
  const fields = op === 'get' ? ['memoryId','history'] : ['memoryId','recipientId','expectedRevision','operationKey'];
  if (!validScope(scope) || !body || Array.isArray(body) || Object.keys(body).some(key => !fields.includes(key)) || !uuid(body.memoryId) ||
    (op === 'get' ? body.history !== undefined && typeof body.history !== 'boolean' : !uuid(body.recipientId) || !uuid(body.operationKey) || !Number.isSafeInteger(body.expectedRevision) || Number(body.expectedRevision)<0)) { throw new MemoryShareError('invalid'); }
  const input = op === 'get' ? {memoryId: body.memoryId.toLowerCase(), history: body.history ?? false} : {memoryId: body.memoryId.toLowerCase(), recipientId: String(body.recipientId).toLowerCase(), expectedRevision: body.expectedRevision, operationKey: String(body.operationKey).toLowerCase()};
  try {
    return await sql.begin(async tx => {
      await tx`SELECT set_config('statement_timeout','5000',true),set_config('lock_timeout','2000',true),set_config('idle_in_transaction_session_timeout','5000',true)`;
      const [row] = await tx`SELECT allura.memory_share(${identity.issuer},${identity.subject},${scope.groupId},${scope.workspaceId}::uuid,${op},${input}::jsonb) AS result`;
      if (identity.expiresAt <= Math.floor(Date.now()/1000)) { throw new AuthorityError('unauthenticated'); }
      return row.result as Record<string, unknown>;
    });
  } catch (error) {
    if (error instanceof AuthorityError) { throw error; }
    const message = error instanceof Error ? error.message : '';
    if (message === 'forbidden' || message === 'invalid' || message === 'conflict' || message === 'not_found') { throw new MemoryShareError(message); }
    throw new MemoryShareError('unknown');
  }
}
