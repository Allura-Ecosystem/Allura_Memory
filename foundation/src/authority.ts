import { isAuthenticated, type Identity } from './authentication.ts';

export class AuthorityError extends Error {
  constructor(public readonly code: 'unauthenticated' | 'forbidden' | 'invalid') {
    super(code);
    this.name = 'AuthorityError';
  }
}
export type PrincipalKind = 'human' | 'service' | 'device' | 'worker';
export type Scope = Readonly<{ groupId: string; workspaceId: string }>;
export const actions = ['memory:read', 'evidence:read', 'memory:capture', 'proposal:write', 'review:read', 'review:approve', 'memory:delete', 'audit:read', 'health:read', 'workspace:grants:manage'] as const;
export type Action = typeof actions[number];
const roleActions: Readonly<Record<string, readonly Action[]>> = Object.freeze({
  viewer: ['memory:read'],
  curator: ['memory:read', 'memory:capture', 'proposal:write', 'review:read'],
  workspace_admin: ['memory:read', 'memory:capture', 'proposal:write', 'review:read', 'evidence:read', 'memory:delete', 'audit:read', 'health:read', 'workspace:grants:manage'],
});
export type AuthorityRecord = Scope & {
  principalId: string; kind: PrincipalKind; principalActive: boolean;
  membershipActive: boolean; tenantActive: boolean; workspaceLocked: boolean;
  grantActive: boolean; role: string; reviewApprove: boolean;
};
export interface AuthorityStore {
  // Implementations read CURRENT server-owned binding/membership/grant state.
  resolve(identity: Identity, scope: Scope): Promise<AuthorityRecord | null>;
}
export type Authority = Scope & Readonly<{ principalId: string; kind: PrincipalKind; action: Action }>;
const issued = new WeakSet<object>();
export const isAuthority = (value: object): value is Authority => issued.has(value);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validScope(scope: Scope): boolean {
  return !!scope && /^allura-[a-z0-9][a-z0-9-]{0,79}$/.test(scope.groupId) && uuid.test(scope.workspaceId);
}
export function allowedRoleAction(role: string, reviewApprove: boolean, kind: PrincipalKind, action: string): action is Action {
  if (!Object.hasOwn(roleActions, role) || !(actions as readonly string[]).includes(action)) { return false; }
  if (kind !== 'human' && (action === 'review:approve' || action === 'workspace:grants:manage')) { return false; }
  if (action === 'review:approve') { return kind === 'human' && reviewApprove === true; }
  return roleActions[role]!.includes(action as Action);
}
export async function resolveAuthority(identity: Identity, scope: Scope, action: string, store: AuthorityStore): Promise<Authority> {
  if (!isAuthenticated(identity) || identity.expiresAt <= Math.floor(Date.now() / 1000)) { throw new AuthorityError('unauthenticated'); }
  if (!validScope(scope)) { throw new AuthorityError('invalid'); }
  if (identity.kind !== 'human' && (identity.groupId !== scope.groupId || identity.workspaceId !== scope.workspaceId || !identity.actions.includes(action))) {
    throw new AuthorityError('forbidden');
  }
  let row: AuthorityRecord | null;
  try { row = await store.resolve(identity, scope); } catch { throw new AuthorityError('forbidden'); }
  if (!row || !uuid.test(row.principalId) || row.kind !== identity.kind ||
      (identity.kind !== 'human' && row.principalId !== identity.principalId) ||
      row.groupId !== scope.groupId || row.workspaceId !== scope.workspaceId ||
      row.principalActive !== true || row.membershipActive !== true || row.tenantActive !== true || row.grantActive !== true || row.workspaceLocked !== false ||
      !allowedRoleAction(row.role, row.reviewApprove, row.kind, action)) {
    throw new AuthorityError('forbidden');
  }
  const authority: Authority = Object.freeze({ ...scope, principalId: row.principalId, kind: row.kind, action });
  issued.add(authority);
  return authority;
}
