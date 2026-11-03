import { test, expect, beforeAll, afterAll } from 'bun:test';
import { SQL } from 'bun';
import { generateKeyPairSync, sign, randomBytes, randomUUID, createHash } from 'node:crypto';
import { migrate, DatabaseStore, scopedTransaction, appendEvent, readEvents } from '../src/persistence.ts';
import { authenticateHuman, authenticateMachine } from '../src/authentication.ts';
import { createEvidenceGateway } from '../src/evidence-api.ts';

const target = process.env.ALLURA_DISPOSABLE_DB_URL;
if (!target || new URL(target).hostname !== '127.0.0.1' || process.env.ALLURA_DISPOSABLE_DB !== 'owned-test-container') { throw new Error('Requires owned disposable test runner'); }
const owner = new SQL(target, { max: 1 });
let app: SQL;
const groupId = 'allura-synthetic';
const foreignGroup = 'allura-foreign';
const workspaceId = '11111111-1111-4111-8111-111111111111';
const sales = '33333333-3333-4333-8333-333333333333';
const principal = '22222222-2222-4222-8222-222222222222';
const scope = { groupId, workspaceId };
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const config = { issuer: 'https://synthetic.cloudflareaccess.com', audience: 'test', keys: new Map([['local', publicKey]]) };
const now = Math.floor(Date.now() / 1000);
const data = [ { alg: 'RS256', kid: 'local' }, { iss: config.issuer, aud: 'test', sub: 'subject', email: 'fixture@example.invalid', type: 'app', iat: now, exp: now + 3600 } ].map(v => Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
const identity = authenticateHuman({ assertion: `${data}.${sign('RSA-SHA256', Buffer.from(data), privateKey).toString('base64url')}` }, config);

beforeAll(async () => {
  await migrate(owner);
  const password = randomBytes(32).toString('hex');
  await owner.unsafe(`ALTER ROLE allura_app LOGIN PASSWORD '${password}'`);
  const url = new URL(target); url.username = 'allura_app'; url.password = password;
  app = new SQL(url.toString(), { max: 1 });
  await owner`INSERT INTO allura.principals(id,kind) VALUES (${principal},'human')`;
  await owner`INSERT INTO allura.identity_bindings(issuer,subject,identity_kind,principal_id) VALUES (${config.issuer},'subject','human',${principal})`;
  await owner`INSERT INTO allura.tenants(group_id) VALUES (${groupId}),(${foreignGroup})`;
  await owner`INSERT INTO allura.memberships(group_id,principal_id,org_admin) VALUES (${groupId},${principal},true),(${foreignGroup},${principal},false)`;
  for (const ws of [workspaceId, sales]) {
    await owner`INSERT INTO allura.workspaces(group_id,id,display_name,created_by) VALUES (${groupId},${ws},'Synthetic',${principal})`;
    await owner`INSERT INTO allura.workspace_grants(group_id,workspace_id,principal_id,role,issuer) VALUES (${groupId},${ws},${principal},'workspace_admin',${principal})`;
  }
  await owner`INSERT INTO allura.workspaces(group_id,id,display_name,created_by) VALUES (${foreignGroup},${workspaceId},'Foreign fixture',${principal})`;
  await owner`INSERT INTO allura.events(group_id,workspace_id,actor_id,kind,payload) VALUES (${foreignGroup},${workspaceId},${principal},'capture','{"content":"foreign sentinel"}')`;
});
afterAll(async () => { if (app) { await app.close(); } await owner.close(); });

test('migration is repeatable and checksum drift fails', async () => {
  expect(await migrate(owner)).toBe('unchanged');
  await owner`UPDATE allura.schema_migrations SET digest='tampered' WHERE version=1`;
  await expect(migrate(owner)).rejects.toThrow('migration checksum mismatch');
  // Fixture-only repair: migration must never silently bless a changed checksum.
  const { createHash } = await import('node:crypto');
  const digest = createHash('sha256').update(await Bun.file(new URL('../migrations/001-authority.sql', import.meta.url)).text()).digest('hex');
  await owner`UPDATE allura.schema_migrations SET digest=${digest} WHERE version=1`;
});

test('restricted login is not owner superuser or RLS bypass', async () => {
  const [role] = await app`SELECT current_user, rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user`;
  expect(role.current_user).toBe('allura_app'); expect(role.rolsuper).toBe(false); expect(role.rolbypassrls).toBe(false);
  const [table] = await app`SELECT relrowsecurity, relforcerowsecurity, pg_get_userbyid(relowner) AS owner FROM pg_class WHERE oid='allura.events'::regclass`;
  expect(table.relrowsecurity).toBe(true); expect(table.relforcerowsecurity).toBe(true); expect(table.owner).not.toBe('allura_app');
  await expect(app`SET ROLE postgres`.execute()).rejects.toThrow();
  await expect(app`UPDATE allura.workspace_grants SET active=false`.execute()).rejects.toThrow();
});

test('authorized append persists exact actor and scoped evidence', async () => {
  const id = await appendEvent(app, identity, scope, { content: 'HR evidence' });
  expect(id).toMatch(/^[0-9a-f-]{36}$/);
  const events = await readEvents(app, identity, scope);
  expect(events).toHaveLength(1); expect(events[0]!.actor_id).toBe(principal); expect(events[0]!.payload).toEqual({ content: 'HR evidence' });
  expect(await new DatabaseStore(app).resolve(identity, scope)).toMatchObject({ principalId: principal, role: 'workspace_admin', grantActive: true });
});

test('RLS denies missing foreign malformed and spoofed contexts', async () => {
  expect(await app`SELECT * FROM allura.events`).toHaveLength(0);
  await expect(app`INSERT INTO allura.events(group_id,workspace_id,actor_id,kind,payload) VALUES (${groupId},${workspaceId},${principal},'capture','{}')`.execute()).rejects.toThrow();
  await expect(readEvents(app, identity, { groupId: foreignGroup, workspaceId })).rejects.toThrow('forbidden');
  await scopedTransaction(app, identity, scope, 'evidence:read', async tx => {
    expect(await tx`SELECT * FROM allura.events`).toHaveLength(1);
    expect(await tx`SELECT * FROM allura.events WHERE workspace_id=${sales}`).toHaveLength(0);
    await tx`SELECT set_config('allura.workspace','malformed',true)`;
    expect(await tx`SELECT * FROM allura.events`).toHaveLength(0);
  });
  await expect(scopedTransaction(app, identity, scope, 'memory:capture', async tx => {
    await tx`INSERT INTO allura.events(group_id,workspace_id,actor_id,kind,payload) VALUES (${groupId},${workspaceId},${randomUUID()},'capture','{}')`;
  })).rejects.toThrow();
  expect(await readEvents(app, identity, scope)).toHaveLength(1);
});

test('events reject update delete truncate even accidental owner writes', async () => {
  await expect(app`UPDATE allura.events SET payload='{}'`.execute()).rejects.toThrow();
  await expect(app`DELETE FROM allura.events`.execute()).rejects.toThrow();
  await expect(app`TRUNCATE allura.events`.execute()).rejects.toThrow();
  await expect(owner`UPDATE allura.events SET payload='{}'`.execute()).rejects.toThrow('append-only');
  await expect(owner`DELETE FROM allura.events`.execute()).rejects.toThrow('append-only');
});

test('rollback leaves no partial events and reused pool clears scope', async () => {
  for (const stage of ['before', 'after']) {
    await expect(scopedTransaction(app, identity, scope, 'memory:capture', async tx => {
      if (stage === 'before') { throw new Error('injected'); }
      await tx`INSERT INTO allura.events(group_id,workspace_id,actor_id,kind,payload) VALUES (${groupId},${workspaceId},${principal},'capture','{}')`;
      throw new Error('injected');
    })).rejects.toThrow('injected');
    expect(await readEvents(app, identity, scope)).toHaveLength(1);
  }
  await appendEvent(app, identity, { groupId, workspaceId: sales }, { content: 'Sales evidence' });
  expect((await readEvents(app, identity, scope))[0]!.payload).toEqual({ content: 'HR evidence' });
  expect((await readEvents(app, identity, { groupId, workspaceId: sales }))[0]!.payload).toEqual({ content: 'Sales evidence' });
  expect(await app`SELECT * FROM allura.events`).toHaveLength(0);
  const [context] = await app`SELECT current_setting('allura.workspace',true) AS workspace`;
  expect(context.workspace || '').toBe('');
});

test('current revocation membership lock binding and role are enforced', async () => {
  const transitions: [string,string,string,string[]][] = [
    ['UPDATE allura.principals SET active=false','UPDATE allura.principals SET active=true',' WHERE id=$1',[principal]],
    ['UPDATE allura.memberships SET active=false','UPDATE allura.memberships SET active=true',' WHERE group_id=$1 AND principal_id=$2',[groupId,principal]],
    ['UPDATE allura.workspace_grants SET active=false','UPDATE allura.workspace_grants SET active=true',' WHERE group_id=$1 AND principal_id=$2',[groupId,principal]],
    ['UPDATE allura.workspaces SET locked=true','UPDATE allura.workspaces SET locked=false',' WHERE group_id=$1',[groupId]],
    ['UPDATE allura.identity_bindings SET active=false','UPDATE allura.identity_bindings SET active=true',' WHERE principal_id=$1',[principal]],
    ["UPDATE allura.workspace_grants SET role='viewer'","UPDATE allura.workspace_grants SET role='workspace_admin'",' WHERE group_id=$1 AND principal_id=$2',[groupId,principal]],
  ];
  const unrelated=await owner`SELECT group_id,workspace_id,principal_id,role,active FROM allura.workspace_grants WHERE principal_id<>${principal}::uuid ORDER BY group_id,workspace_id,principal_id`;
  for (const [deny, restore, clause, parameters] of transitions) {
    await owner.unsafe(deny+clause,parameters);
    try { await expect(readEvents(app, identity, scope)).rejects.toThrow('forbidden'); }
    finally { await owner.unsafe(restore+clause,parameters); }
  }
  expect(await owner`SELECT group_id,workspace_id,principal_id,role,active FROM allura.workspace_grants WHERE principal_id<>${principal}::uuid ORDER BY group_id,workspace_id,principal_id`).toEqual(unrelated);
  expect(await readEvents(app, identity, scope)).toHaveLength(1);
});

test('concurrent revocation waits for transaction then denies next use', async () => {
  const revokeConnection = new SQL(target!, { max: 1 });
  let release!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { entered = resolve; });
  const work = scopedTransaction(app, identity, scope, 'memory:capture', async tx => {
    entered(); await gate;
    await tx`INSERT INTO allura.events(group_id,workspace_id,actor_id,kind,payload) VALUES (${groupId},${sales},${principal},'capture','{}')`;
  });
  const settledWork = work.then(() => false, () => true);
  await started;
  const revoke = revokeConnection`UPDATE allura.memberships SET active=false WHERE group_id=${groupId} AND principal_id=${principal}`.then(rows => rows);
  try {
    let waiting = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      const [row] = await owner`SELECT count(*)::int AS waiting FROM pg_locks WHERE NOT granted`;
      if (row.waiting > 0) { waiting = true; break; }
      await Bun.sleep(25);
    }
    expect(waiting).toBe(true);
  } finally { release(); }
  try {
    expect(await settledWork).toBe(true); await revoke;
    await expect(readEvents(app, identity, scope)).rejects.toThrow('forbidden');
  } finally {
    await owner`UPDATE allura.memberships SET active=true WHERE group_id=${groupId} AND principal_id=${principal}`;
    await revokeConnection.close();
  }
});

test('database machine binding revocation and ceilings remain current', async () => {
  const machineId = randomUUID();
  const token = randomBytes(32).toString('hex');
  const digest = createHash('sha256').update(token).digest('hex');
  await owner`INSERT INTO allura.principals(id,kind) VALUES (${machineId},'service')`;
  await owner`INSERT INTO allura.memberships(group_id,principal_id) VALUES (${groupId},${machineId})`;
  await owner`INSERT INTO allura.workspace_grants(group_id,workspace_id,principal_id,role,issuer) VALUES (${groupId},${workspaceId},${machineId},'curator',${principal})`;
  await owner`INSERT INTO allura.machine_credentials(principal_id,digest,group_id,workspace_id,actions,expires_at) VALUES (${machineId},decode(${digest},'hex'),${groupId},${workspaceId},ARRAY['memory:capture'],clock_timestamp()+interval '1 hour')`;
  const machine = await authenticateMachine(token, d => new DatabaseStore(app).lookupMachine(d));
  const id = await appendEvent(app, machine, scope, { content: 'machine evidence' });
  expect(id).toMatch(/^[0-9a-f-]{36}$/);
  await expect(readEvents(app, machine, scope)).rejects.toThrow('forbidden');
  await owner`UPDATE allura.machine_credentials SET actions=ARRAY[]::text[] WHERE principal_id=${machineId}`;
  await expect(appendEvent(app, machine, scope, { content: 'removed action' })).rejects.toThrow('forbidden');
  await owner`UPDATE allura.machine_credentials SET actions=ARRAY['memory:capture'] WHERE principal_id=${machineId}`;
  await owner`UPDATE allura.machine_credentials SET revoked=true WHERE principal_id=${machineId}`;
  await expect(appendEvent(app, machine, scope, { content: 'revoked' })).rejects.toThrow('forbidden');
  await expect(authenticateMachine(token, d => new DatabaseStore(app).lookupMachine(d))).rejects.toThrow('unauthenticated');
});

test('real HTTP evidence read enforces database scope and revocation', async () => {
  const gateway = createEvidenceGateway(app, config, 'https://app.example.invalid');
  const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: gateway });
  const token = `${data}.${sign('RSA-SHA256', Buffer.from(data), privateKey).toString('base64url')}`;
  const headers = { 'Cf-Access-Jwt-Assertion': token };
  const path = `/api/evidence?group_id=${groupId}&workspace_id=${workspaceId}`;
  try {
    const result = await fetch(new URL(path, server.url), { headers });
    expect(result.status).toBe(200);
    const body = await result.text();
    expect(body).toContain('HR evidence'); expect(body).not.toContain('foreign sentinel'); expect(body).not.toContain('Sales evidence');
    expect((await fetch(new URL(path, server.url))).status).toBe(401);
    expect((await fetch(new URL(path.replace(groupId, foreignGroup), server.url), { headers })).status).toBe(403);
    await owner`UPDATE allura.workspace_grants SET active=false WHERE principal_id=${principal}`;
    expect((await fetch(new URL(path, server.url), { headers })).status).toBe(403);
  } finally {
    await owner`UPDATE allura.workspace_grants SET active=true WHERE principal_id=${principal}`;
    await server.stop(true);
  }
});
