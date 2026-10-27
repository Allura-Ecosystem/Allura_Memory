import { type SQL } from 'bun';
import { isAuthenticated, type Identity } from './authentication.ts';
import { AuthorityError, validScope } from './authority.ts';

export class AccessError extends Error {
  constructor(public readonly code: 'forbidden' | 'invalid' | 'conflict' | 'unavailable') { super(code); this.name = 'AccessError'; }
}
const fields: Readonly<Record<string, readonly string[]>> = {
  create: ['name', 'target'], accept_creation: ['id'], decline_creation: ['id'], remove_member: ['target'],
  grant: ['target', 'role', 'reviewApprove', 'revision'], revoke: ['target', 'revision'],
  invite: ['target', 'role', 'reviewApprove', 'expiresAt'], transfer: ['target', 'expiresAt'], recover: ['target', 'expiresAt'],
  accept: ['id'], decline: ['id'], revoke_invite: ['id'], invite_status: ['id'],
  request: ['role', 'reason'], request_status: ['id'], cancel_request: ['id'],
  decide_request: ['id', 'decision', 'role', 'category'], metadata: [],
};
// Trusted service API. SQL credentials and arbitrary query callbacks are never
// exposed. Access management is separate from content authority: a request,
// invitation or organization metadata projection must not mint a content grant.
export async function accessCommand(sql: SQL, identity: Identity, groupId: string, workspaceId: string | null, command: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (!isAuthenticated(identity) || identity.expiresAt <= Math.floor(Date.now()/1000)) { throw new AuthorityError('unauthenticated'); }
  if (identity.kind !== 'human' && (identity.kind !== 'service' || command?.op !== 'create' || identity.groupId !== groupId || !identity.actions.includes('workspace:create'))) { throw new AccessError('forbidden'); }
  if (!validScope({groupId, workspaceId: workspaceId ?? '00000000-0000-4000-8000-000000000000'})) { throw new AccessError('invalid'); }
  if (!command || Array.isArray(command) || typeof command.op !== 'string' || !Object.hasOwn(fields,command.op) ||
      Object.keys(command).some(key=>key !== 'op' && !fields[command.op as string]!.includes(key)) || Buffer.byteLength(JSON.stringify(command))>8192) { throw new AccessError('invalid'); }
  if (command.reviewApprove !== undefined && typeof command.reviewApprove !== 'boolean') { throw new AccessError('invalid'); }
  if (command.revision !== undefined && (!Number.isSafeInteger(command.revision) || Number(command.revision)<0)) { throw new AccessError('invalid'); }
  for (const field of ['name','reason','role','target','id','decision','category','expiresAt']) {
    if (command[field] !== undefined && (typeof command[field] !== 'string' || !(command[field] as string).trim())) { throw new AccessError('invalid'); }
  }
  for (const field of ['target','id']) {
    if (command[field] !== undefined && !validScope({groupId,workspaceId:command[field] as string})) { throw new AccessError('invalid'); }
  }
  try {
    return await sql.begin(async tx => {
      await tx`SELECT set_config('statement_timeout','5000',true),set_config('lock_timeout','2000',true),set_config('idle_in_transaction_session_timeout','5000',true)`;
      const [row] = identity.kind === 'human'
        ? await tx`SELECT allura.access_command(${identity.issuer},${identity.subject},${groupId},${workspaceId}::uuid,${command}::jsonb) AS result`
        : await tx`SELECT allura.service_creation(${identity.principalId}::uuid,${identity.credentialDigest},${groupId},${String(command.target ?? '')}::uuid,${String(command.name ?? '')}) AS result`;
      if (identity.expiresAt <= Math.floor(Date.now()/1000)) { throw new AuthorityError('unauthenticated'); }
      return row.result as Record<string, unknown>;
    });
  } catch (error) {
    if (error instanceof AuthorityError) { throw error; }
    const message = error instanceof Error ? error.message : '';
    if (message === 'forbidden' || message === 'conflict' || message === 'invalid') { throw new AccessError(message); }
    // Never return SQL detail, constraint names, values or hidden identifiers.
    const code = error && typeof error === 'object' ? String('errno' in error ? error.errno : 'code' in error ? error.code : '') : '';
    if (code.startsWith('22') || code.startsWith('23')) { throw new AccessError('invalid'); }
    throw new AccessError('unavailable');
  }
}
