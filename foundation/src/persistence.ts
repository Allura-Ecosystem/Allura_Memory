import { type SQL, type TransactionSQL } from 'bun';
import { createHash, randomUUID } from 'node:crypto';
import { resolveAuthority, AuthorityError, type AuthorityStore, type AuthorityRecord, type Scope, type Action } from './authority.ts';
import { type Identity, type MachineCredential } from './authentication.ts';

export async function migrate(owner: SQL): Promise<'applied' | 'unchanged'> {
  const migrations = await Promise.all(['001-authority.sql', '002-access.sql', '003-capture.sql', '004-proposals.sql', '005-decisions.sql', '006-corrections.sql', '007-lifecycle.sql', '008-restoration.sql', '009-index.sql', '010-retrieval.sql', '011-federation.sql', '012-operations.sql'].map(async (file, index) => {
    const source = await Bun.file(new URL(`../migrations/${file}`, import.meta.url)).text();
    return { version: index + 1, source, digest: createHash('sha256').update(source).digest('hex') };
  }));
  return owner.begin(async tx => {
    await tx`SELECT pg_advisory_xact_lock(20861026)`;
    await tx.unsafe('CREATE SCHEMA IF NOT EXISTS allura; REVOKE ALL ON SCHEMA allura FROM PUBLIC; CREATE TABLE IF NOT EXISTS allura.schema_migrations(version integer PRIMARY KEY, digest text NOT NULL, applied_at timestamptz NOT NULL DEFAULT clock_timestamp())');
    let applied = false;
    for (const { version, source, digest } of migrations) {
      const existing = await tx`SELECT digest FROM allura.schema_migrations WHERE version=${version}`;
      if (existing.length) {
        if (existing[0].digest !== digest) { throw new Error('migration checksum mismatch'); }
      } else {
        await tx.unsafe(source);
        await tx`INSERT INTO allura.schema_migrations(version,digest) VALUES(${version},${digest})`;
        applied = true;
      }
    }
    return applied ? 'applied' : 'unchanged';
  });
}

export class DatabaseStore implements AuthorityStore {
  constructor(private readonly sql: SQL) {}
  async resolveMember(identity: Identity, groupId: string): Promise<{ principalId: string; groupId: string; active: boolean } | null> {
    if (identity.kind !== 'human') { return null; }
    const [row] = await this.sql`SELECT allura.resolve_member(${identity.issuer},${identity.subject},${groupId}) AS member`;
    return row?.member ?? null;
  }
  async resolve(identity: Identity, scope: Scope): Promise<AuthorityRecord | null> {
    const human = identity.kind === 'human';
    const [row] = await this.sql`SELECT allura.resolve_authority(${human ? identity.issuer : ''},${human ? identity.subject : ''},${identity.kind},${human ? '' : identity.principalId},${human ? '' : identity.credentialDigest},${scope.groupId},${scope.workspaceId}) AS authority, allura.lookup_machine(${human ? '' : identity.credentialDigest}) AS credential`;
    if (!row?.authority) { return null; }
    return { ...row.authority, ...(human ? {} : { credentialActions: row.credential?.actions ?? [] }) } as AuthorityRecord;
  }
  async lookupMachine(digest: string): Promise<MachineCredential | null> {
    const [row] = await this.sql`SELECT allura.lookup_machine(${digest}) AS credential`;
    return (row?.credential ?? null) as MachineCredential | null;
  }
}

// Trusted server boundary, not a public arbitrary-SQL API. Local settings are
// service assertions; clients never receive this connection or callback.
export async function scopedTransaction<T>(sql: SQL, identity: Identity, scope: Scope, action: Action, work: (tx: TransactionSQL) => Promise<T>): Promise<T> {
  return sql.begin(async tx => {
    await tx`SELECT set_config('statement_timeout','5000',true),set_config('lock_timeout','2000',true),set_config('idle_in_transaction_session_timeout','5000',true)`;
    const store = new DatabaseStore(tx);
    const authority = await resolveAuthority(identity, scope, action, store);
    await tx`SELECT allura.lock_authority(${authority.principalId}::uuid,${scope.groupId},${scope.workspaceId}::uuid)`;
    await resolveAuthority(identity, scope, action, store);
    const human = identity.kind === 'human';
    await tx`SELECT set_config('allura.principal',${authority.principalId},true),set_config('allura.kind',${identity.kind},true),set_config('allura.group',${scope.groupId},true),set_config('allura.workspace',${scope.workspaceId},true),set_config('allura.action',${action},true),set_config('allura.issuer',${human ? identity.issuer : ''},true),set_config('allura.subject',${human ? identity.subject : ''},true),set_config('allura.credential',${human ? '' : identity.credentialDigest},true)`;
    const result = await work(tx);
    await resolveAuthority(identity, scope, action, store);
    return result;
  });
}
export async function appendEvent(sql: SQL, identity: Identity, scope: Scope, payload: Record<string, unknown>): Promise<string> {
  const serialized = JSON.stringify(payload);
  if (!payload || Array.isArray(payload) || Buffer.byteLength(serialized) > 60000) { throw new AuthorityError('invalid'); }
  return scopedTransaction(sql, identity, scope, 'memory:capture', async tx => {
    const id = randomUUID();
    // Explicit id avoids INSERT RETURNING requiring raw-evidence SELECT rights.
    await tx`INSERT INTO allura.events(group_id,workspace_id,id,actor_id,kind,payload) VALUES(${scope.groupId},${scope.workspaceId}::uuid,${id}::uuid,current_setting('allura.principal')::uuid,'capture',${payload}::jsonb)`;
    return id;
  });
}
export type EvidenceRow = { id: string; actor_id: string; payload: Record<string, unknown>; created_at: Date };
export async function readEvents(sql: SQL, identity: Identity, scope: Scope, limit = 100): Promise<EvidenceRow[]> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) { throw new AuthorityError('invalid'); }
  return scopedTransaction(sql, identity, scope, 'evidence:read', async tx => {
    return await tx`SELECT id,actor_id,payload,created_at FROM allura.events WHERE group_id=${scope.groupId} AND workspace_id=${scope.workspaceId}::uuid ORDER BY created_at,id LIMIT ${limit}` as EvidenceRow[];
  });
}
