import { test, expect } from 'bun:test';
import { generateKeyPairSync, sign, createHash } from 'node:crypto';
import { authenticateHuman, authenticateMachine, safeReturnTarget, requireSameOrigin } from '../src/authentication.ts';
import { resolveAuthority, AuthorityError, type AuthorityStore, type AuthorityRecord } from '../src/authority.ts';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
const now = 1800000000;
const config = { issuer: 'https://test.cloudflareaccess.com', audience: 'test-app', keys: new Map([['local', publicKey]]) };
const claims = { iss: config.issuer, aud: [config.audience], sub: 'human-sub', email: 'synthetic@example.invalid', type: 'app', iat: now - 10, exp: now + 100 };
function jwt(overrides: Record<string, unknown> = {}, header: Record<string, unknown> = {}, key = privateKey): string {
  const data = [ { alg: 'RS256', kid: 'local', ...header }, { ...claims, ...overrides } ].map(v => Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
  return `${data}.${sign('RSA-SHA256', Buffer.from(data), key).toString('base64url')}`;
}
const selector = { groupId: 'allura-test', workspaceId: '11111111-1111-4111-8111-111111111111' };
const principalId = '22222222-2222-4222-8222-222222222222';
const record: AuthorityRecord = { principalId, kind: 'human', principalActive: true, membershipActive: true, tenantActive: true, workspaceLocked: false, grantActive: true, role: 'curator', reviewApprove: false, ...selector };
function store(value: AuthorityRecord | null = record): AuthorityStore {
  return { resolve: async () => value };
}

test('signed human resolves stable principal and exact workspace action', async () => {
  const identity = authenticateHuman({ assertion: jwt() }, config, now);
  const authority = await resolveAuthority(identity, selector, 'memory:read', store());
  expect(identity.kind).toBe('human');
  expect(authority.principalId).toBe(principalId);
  expect(authority.groupId).toBe(selector.groupId);
  expect(authority.workspaceId).toBe(selector.workspaceId);
  expect(authority.action).toBe('memory:read');
  expect(Object.isFrozen(authority)).toBe(true);
});

test('invalid signed identity is rejected before authority work', () => {
  const invalid = [jwt({}, {}, other.privateKey), jwt({ iss: 'https://evil.invalid' }), jwt({ aud: ['other'] }), jwt({ exp: now }), jwt({ iat: now + 1 }), jwt({ nbf: now + 1 }), jwt({ iat: 'yesterday' }), jwt({ exp: null }), jwt({ sub: '' }), jwt({ email: '' }), jwt({ type: 'service' }), jwt({ common_name: 'machine' }), jwt({}, { alg: 'none' }), jwt({}, { jku: 'https://evil.invalid/keys' }), jwt({}, { kid: 'unknown' }), jwt({}, { crit: ['custom'] }), 'bad', 'a'.repeat(17000), `${jwt()}.extra`];
  for (const token of invalid) {
    expect(() => authenticateHuman({ assertion: token }, config, now)).toThrow(AuthorityError);
  }
  expect(() => authenticateHuman({}, config, now)).toThrow('unauthenticated');
  expect(() => authenticateHuman({ assertion: jwt(), cookie: jwt({ sub: 'other' }) }, config, now)).toThrow('unauthenticated');
  expect(() => authenticateHuman({ assertion: jwt() }, { ...config, issuer: 'http://bad' }, now)).toThrow('unauthenticated');
  expect(() => authenticateHuman({ assertion: jwt() }, { ...config, audience: '' }, now)).toThrow('unauthenticated');
  expect(authenticateHuman({ cookie: jwt() }, config, now).subject).toBe('human-sub');
});

test('current membership grant lock and tenant checks fail closed', async () => {
  const identity = authenticateHuman({ assertion: jwt() }, config, now);
  const mutations: Partial<AuthorityRecord>[] = [ { principalActive: false }, { membershipActive: false }, { tenantActive: false }, { grantActive: false }, { workspaceLocked: true }, { groupId: 'allura-foreign' }, { workspaceId: '33333333-3333-4333-8333-333333333333' }, { kind: 'service' }, { role: 'unknown' } ];
  for (const patch of mutations) {
    await expect(resolveAuthority(identity, selector, 'memory:read', store({ ...record, ...patch }))).rejects.toThrow('forbidden');
  }
  await expect(resolveAuthority(identity, selector, 'memory:read', store(null))).rejects.toThrow('forbidden');
  await expect(resolveAuthority(identity, selector, 'memory:read', { resolve: async () => { throw new Error('private backend error'); } })).rejects.toThrow('forbidden');
  await expect(resolveAuthority(identity, { ...selector, groupId: '' }, 'memory:read', store())).rejects.toThrow('invalid');
  await expect(resolveAuthority(identity, selector, 'unknown', store())).rejects.toThrow('forbidden');
});

test('roles do not confer implicit review or cross-workspace privileges', async () => {
  const identity = authenticateHuman({ assertion: jwt() }, config, now);
  await expect(resolveAuthority(identity, selector, 'review:approve', store({ ...record, role: 'workspace_admin' }))).rejects.toThrow('forbidden');
  await expect(resolveAuthority(identity, selector, 'evidence:read', store())).rejects.toThrow('forbidden');
  expect((await resolveAuthority(identity, selector, 'review:approve', store({ ...record, reviewApprove: true }))).action).toBe('review:approve');
  await expect(resolveAuthority(identity, selector, 'memory:capture', store({ ...record, role: 'viewer' }))).rejects.toThrow('forbidden');
  await expect(resolveAuthority(identity, selector, 'memory:read', store({ ...record, grantActive: false, role: 'org_admin' }))).rejects.toThrow('forbidden');
  let current = record;
  const live: AuthorityStore = { resolve: async () => current };
  await resolveAuthority(identity, selector, 'memory:read', live);
  current = { ...record, membershipActive: false };
  await expect(resolveAuthority(identity, selector, 'memory:read', live)).rejects.toThrow('forbidden');
});

test('machine credentials remain separate and action ceilings apply', async () => {
  const token = 'a'.repeat(64);
  const credential = { principalId, kind: 'service' as const, groupId: selector.groupId, workspaceId: selector.workspaceId, actions: ['memory:read'], expiresAt: now + 60, revoked: false };
  let seen = '';
  const lookup = async (digest: string) => { seen = digest; return credential; };
  const machine = await authenticateMachine(token, lookup, now);
  expect(seen).toBe(createHash('sha256').update(token).digest('hex'));
  expect(machine.kind).toBe('service');
  expect((await resolveAuthority(machine, selector, 'memory:read', store({ ...record, kind: 'service', credentialActions: ['memory:read'] }))).action).toBe('memory:read');
  await expect(resolveAuthority(machine, selector, 'memory:read', store({ ...record, kind: 'service', credentialActions: [] }))).rejects.toThrow('forbidden');
  await expect(resolveAuthority(machine, selector, 'memory:capture', store({ ...record, kind: 'service' }))).rejects.toThrow('forbidden');
  await expect(resolveAuthority(machine, selector, 'review:approve', store({ ...record, kind: 'service', reviewApprove: true }))).rejects.toThrow('forbidden');
  await expect(authenticateMachine(token, async () => ({ ...credential, revoked: true }), now)).rejects.toThrow('unauthenticated');
  await expect(authenticateMachine(token, async () => ({ ...credential, expiresAt: now }), now)).rejects.toThrow('unauthenticated');
  await expect(authenticateMachine(jwt(), lookup, now)).rejects.toThrow('unauthenticated');
  await expect(authenticateMachine(token, async () => null, now)).rejects.toThrow('unauthenticated');
  await expect(authenticateMachine(token, async () => { throw new Error('secret'); }, now)).rejects.toThrow('unauthenticated');
});

test('forged in-process identity cannot mint authority', async () => {
  const real = authenticateHuman({ assertion: jwt() }, config, now);
  await expect(resolveAuthority({ ...real }, selector, 'memory:read', store())).rejects.toThrow('unauthenticated');
  expect(Object.isFrozen(real)).toBe(true);
});

test('human mutations require same-origin and login targets stay local', () => {
  expect(() => requireSameOrigin('https://app.example.invalid', 'https://app.example.invalid', 'same-origin')).not.toThrow();
  for (const origin of [null, 'null', 'https://evil.invalid', 'https://app.example.invalid.evil.invalid']) {
    expect(() => requireSameOrigin('https://app.example.invalid', origin, 'same-origin')).toThrow('forbidden');
  }
  expect(() => requireSameOrigin('https://app.example.invalid', 'https://app.example.invalid', 'cross-site')).toThrow('forbidden');
  for (const path of ['https://evil.invalid', '//evil.invalid', '/\\evil', '/auth/v2/login', '/%5cevil', '/%2f%2fevil', '/a\n']) {
    expect(safeReturnTarget(path)).toBe('/memory');
  }
  expect(safeReturnTarget('/memory?q=hello')).toBe('/memory?q=hello');
});
