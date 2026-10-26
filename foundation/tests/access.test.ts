import { test, expect, beforeAll, afterAll } from 'bun:test';
import { SQL } from 'bun';
import { createHash, generateKeyPairSync, sign, randomBytes, randomUUID } from 'node:crypto';
import { migrate, readEvents, DatabaseStore } from '../src/persistence.ts';
import { authenticateHuman, authenticateMachine, type Identity } from '../src/authentication.ts';
import { accessCommand } from '../src/access.ts';
import { createAccessGateway } from '../src/access-api.ts';

const target = process.env.ALLURA_DISPOSABLE_DB_URL;
if (!target || new URL(target).hostname !== '127.0.0.1' || process.env.ALLURA_DISPOSABLE_DB !== 'owned-test-container') { throw new Error('Requires owned disposable runner'); }
const owner = new SQL(target, { max: 3 });
let app: SQL;
const group = 'allura-access';
const ids = { alice: randomUUID(), bob: randomUUID(), carol: randomUUID(), org: randomUUID() };
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const config = { issuer: 'https://access.cloudflareaccess.com', audience: 'test', keys: new Map([['key', publicKey]]) };
function jwt(subject: string): string {
  const now = Math.floor(Date.now()/1000);
  const data = [{ alg: 'RS256', kid: 'key' }, { iss: config.issuer, aud: 'test', sub: subject, email: `${subject}@example.invalid`, type: 'app', iat: now, exp: now+3600 }].map(v => Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
  return `${data}.${sign('RSA-SHA256',Buffer.from(data),privateKey).toString('base64url')}`;
}
function human(subject: string): Identity { return authenticateHuman({ assertion: jwt(subject) }, config); }
const alice = human('alice'), bob = human('bob'), carol = human('carol'), org = human('org');
const call = (identity: Identity, workspace: string | null, command: Record<string, unknown>, tenant = group) => accessCommand(app, identity, tenant, workspace, command);
async function create(): Promise<string> { return (await call(alice, null, { op: 'create', name: 'Confidential', target: ids.alice })).workspaceId as string; }

beforeAll(async () => {
  await migrate(owner);
  const password = randomBytes(32).toString('hex');
  await owner.unsafe(`ALTER ROLE allura_app LOGIN PASSWORD '${password}'`);
  const url = new URL(target); url.username='allura_app'; url.password=password; app=new SQL(url.toString(),{max:4});
  await owner`INSERT INTO allura.tenants(group_id) VALUES (${group}),('allura-access-foreign')`;
  for (const [name,id] of Object.entries(ids)) {
    await owner`INSERT INTO allura.principals(id,kind) VALUES (${id},'human')`;
    await owner`INSERT INTO allura.identity_bindings(issuer,subject,identity_kind,principal_id) VALUES (${config.issuer},${name},'human',${id})`;
    await owner`INSERT INTO allura.memberships(group_id,principal_id,org_admin,workspace_create) VALUES (${group},${id},${name==='org'},${name==='alice'})`;
  }
});
afterAll(async () => { if(app) { await app.close(); } await owner.close(); });

test('access HTTP authenticates before input and supports a grantless request lifecycle', async () => {
  const ws = await create();
  const server = Bun.serve({ hostname:'127.0.0.1',port:0,fetch:createAccessGateway(app,config,'https://allura.example') });
  const url = `http://127.0.0.1:${server.port}/api/access?group_id=${group}&workspace_id=${ws}`;
  const post = (subject:string,body:Record<string,unknown>,origin='https://allura.example')=>fetch(url,{method:'POST',headers:{'Cf-Access-Jwt-Assertion':jwt(subject),'Content-Type':'application/json',Origin:origin,'Sec-Fetch-Site':'same-origin'},body:JSON.stringify(body)});
  try {
    expect((await fetch(url,{method:'POST',body:'not-json'})).status).toBe(401);
    expect((await post('bob',{op:'request',role:'viewer',reason:'HTTP access'},'https://evil.example')).status).toBe(403);
    const requested = await post('bob',{op:'request',role:'viewer',reason:'HTTP access'});
    expect(requested.status).toBe(200); const request = await requested.json() as {id:string};
    expect((await post('org',{op:'decide_request',id:request.id,decision:'approve',role:'viewer'})).status).toBe(403);
    expect((await post('alice',{op:'decide_request',id:request.id,decision:'approve',role:'viewer'})).status).toBe(200);
    expect(await (await post('bob',{op:'request_status',id:request.id})).json()).toMatchObject({outcome:'approved',role:'viewer'});
    expect((await post('alice',{op:'grant',target:ids.bob,role:'curator',revision:0})).status).toBe(409);
  } finally { await server.stop(true); }
});

test('service creation requires current explicit ceiling and consenting active human', async () => {
  const ws = await create(), machine = randomUUID(), token = randomBytes(32).toString('base64url');
  const digest = createHash('sha256').update(token).digest('hex');
  await owner`INSERT INTO allura.principals(id,kind) VALUES (${machine},'service')`;
  await owner`INSERT INTO allura.memberships(group_id,principal_id,workspace_create) VALUES (${group},${machine},true)`;
  await owner`INSERT INTO allura.machine_credentials(principal_id,digest,group_id,workspace_id,actions,expires_at) VALUES (${machine},decode(${digest},'hex'),${group},${ws},ARRAY['workspace:create'],clock_timestamp()+interval '1 hour')`;
  const identity = await authenticateMachine(token,d=>new DatabaseStore(app).lookupMachine(d));
  await expect(call(identity,null,{op:'create',name:'No human',target:machine})).rejects.toThrow('invalid');
  const pending = await call(identity,null,{op:'create',name:'Service nomination',target:ids.bob});
  expect(await owner`SELECT * FROM allura.workspaces WHERE id=${pending.workspaceId}`).toHaveLength(0);
  await expect(call(identity,ws,{op:'accept',id:pending.id})).rejects.toThrow('forbidden');
  const accepted = await call(bob,null,{op:'accept_creation',id:pending.id});
  expect(accepted.outcome).toBe('succeeded');
  expect(await owner`SELECT * FROM allura.workspace_grants WHERE workspace_id=${accepted.workspaceId} AND principal_id=${machine}`).toHaveLength(0);
  const revoked = await call(identity,null,{op:'create',name:'Stale nomination',target:ids.carol});
  await owner`UPDATE allura.machine_credentials SET revoked=true WHERE principal_id=${machine}`;
  await expect(call(carol,null,{op:'accept_creation',id:revoked.id})).rejects.toThrow('forbidden');
  await expect(call(identity,null,{op:'create',name:'Revoked',target:ids.carol})).rejects.toThrow('forbidden');
});

test('creation atomically records explicit admin and requires nominee consent', async () => {
  const ws = await create();
  const [grant] = await owner`SELECT * FROM allura.workspace_grants WHERE workspace_id=${ws}`;
  expect(grant.principal_id).toBe(ids.alice); expect(grant.role).toBe('workspace_admin'); expect(grant.review_approve).toBe(false);
  expect(await owner`SELECT * FROM allura.access_audit WHERE workspace_id=${ws} AND action='create'`).toHaveLength(1);
  await expect(call(bob,null,{op:'create',name:'Denied',target:ids.bob})).rejects.toThrow('forbidden');
  const pending = await call(alice,null,{op:'create',name:'Consent',target:ids.bob});
  expect(pending.outcome).toBe('pending');
  expect(await owner`SELECT * FROM allura.workspaces WHERE id=${pending.workspaceId}`).toHaveLength(0);
  await expect(call(carol,null,{op:'accept_creation',id:pending.id})).rejects.toThrow('forbidden');
  const accepted = await call(bob,null,{op:'accept_creation',id:pending.id});
  expect(accepted.outcome).toBe('succeeded');
  expect(await owner`SELECT * FROM allura.workspace_grants WHERE workspace_id=${accepted.workspaceId} AND principal_id=${ids.bob}`).toHaveLength(1);
  await expect(call(bob,null,{op:'accept_creation',id:pending.id})).rejects.toThrow('conflict');
});

test('grants require current independent workspace admin and exact revision', async () => {
  const ws = await create();
  await expect(call(org,ws,{op:'grant',target:ids.bob,role:'viewer',revision:0})).rejects.toThrow('forbidden');
  await expect(call(alice,ws,{op:'grant',target:ids.alice,role:'viewer',revision:1})).rejects.toThrow('conflict');
  expect((await call(alice,ws,{op:'grant',target:ids.bob,role:'viewer',revision:0})).outcome).toBe('succeeded');
  await expect(call(alice,ws,{op:'grant',target:ids.bob,role:'curator',revision:0})).rejects.toThrow('conflict');
  await expect(readEvents(app,bob,{groupId:group,workspaceId:ws})).rejects.toThrow('forbidden');
  await call(alice,ws,{op:'grant',target:ids.bob,role:'curator',revision:1,reviewApprove:true});
  const [grant] = await owner`SELECT * FROM allura.workspace_grants WHERE workspace_id=${ws} AND principal_id=${ids.bob}`;
  expect(grant.role).toBe('curator'); expect(grant.review_approve).toBe(true); expect(Number(grant.revision)).toBe(2);
  await expect(call(alice,ws,{op:'grant',target:ids.carol,role:'admin',revision:0})).rejects.toThrow('invalid');
});

test('invitations grant nothing until acceptance and recheck inviter authority', async () => {
  const ws = await create();
  const invite = await call(alice,ws,{op:'invite',target:ids.bob,role:'viewer'});
  expect(invite.outcome).toBe('pending');
  await expect(readEvents(app,bob,{groupId:group,workspaceId:ws})).rejects.toThrow('forbidden');
  await expect(call(carol,ws,{op:'accept',id:invite.id})).rejects.toThrow('forbidden');
  expect((await call(bob,ws,{op:'accept',id:invite.id})).outcome).toBe('accepted');
  await expect(call(bob,ws,{op:'accept',id:invite.id})).rejects.toThrow('conflict');
  const denied = await call(alice,ws,{op:'invite',target:ids.carol,role:'viewer'});
  expect((await call(carol,ws,{op:'decline',id:denied.id})).outcome).toBe('declined');
  const stale = await call(alice,ws,{op:'invite',target:ids.carol,role:'viewer'});
  await owner`UPDATE allura.workspace_grants SET active=false WHERE workspace_id=${ws} AND principal_id=${ids.alice}`;
  await expect(call(carol,ws,{op:'accept',id:stale.id})).rejects.toThrow('forbidden');
});

test('access requests support narrower approval privacy and terminal notification', async () => {
  const ws = await create();
  const request = await call(bob,ws,{op:'request',role:'curator',reason:'Need access'});
  expect(request.outcome).toBe('pending');
  await expect(call(org,ws,{op:'decide_request',id:request.id,decision:'approve',role:'viewer'})).rejects.toThrow('forbidden');
  const result = await call(alice,ws,{op:'decide_request',id:request.id,decision:'approve',role:'viewer'});
  expect(result.outcome).toBe('approved-with-changes');
  const status = await call(bob,ws,{op:'request_status',id:request.id});
  expect(status.outcome).toBe('approved-with-changes'); expect(status.role).toBe('viewer');
  expect(await owner`SELECT * FROM allura.access_notifications WHERE workspace_id=${ws} AND recipient=${ids.bob}`).toHaveLength(1);
  const denied = await call(carol,ws,{op:'request',role:'viewer',reason:'Private rationale'});
  expect((await call(alice,ws,{op:'decide_request',id:denied.id,decision:'deny',category:'not_eligible'})).outcome).toBe('denied');
  const safe = await call(carol,ws,{op:'request_status',id:denied.id});
  expect(safe.category).toBe('not_eligible'); expect(JSON.stringify(safe)).not.toContain(ids.alice);
  expect((await call(bob,randomUUID(),{op:'request',role:'viewer',reason:'Known selector'})).outcome).toBe('pending');
  await expect(call(bob,ws,{op:'request',role:'viewer',reason:'x'},'allura-access-foreign')).rejects.toThrow('forbidden');
});

test('last administrator transfer activates consenting successor atomically', async () => {
  const ws = await create();
  await expect(call(alice,ws,{op:'revoke',target:ids.alice,revision:1})).rejects.toThrow('conflict');
  await expect(call(org,ws,{op:'remove_member',target:ids.alice})).rejects.toThrow('conflict');
  const transfer = await call(alice,ws,{op:'transfer',target:ids.bob});
  expect((await call(bob,ws,{op:'accept',id:transfer.id})).outcome).toBe('accepted');
  const grants = await owner`SELECT principal_id FROM allura.workspace_grants WHERE workspace_id=${ws} AND active AND role='workspace_admin'`;
  expect(grants).toHaveLength(1); expect(grants[0].principal_id).toBe(ids.bob);
  await expect(call(alice,ws,{op:'grant',target:ids.carol,role:'viewer',revision:0})).rejects.toThrow('forbidden');
});

test('orphan recovery requires different nominee consent and one concurrent winner', async () => {
  const ws = await create();
  await expect(call(org,ws,{op:'recover',target:ids.bob})).rejects.toThrow('conflict');
  await owner`UPDATE allura.workspace_grants SET active=false WHERE workspace_id=${ws} AND principal_id=${ids.alice}`;
  await expect(call(org,ws,{op:'recover',target:ids.org})).rejects.toThrow('conflict');
  const a = await call(org,ws,{op:'recover',target:ids.bob});
  const b = await call(org,ws,{op:'recover',target:ids.carol});
  const outcomes = await Promise.allSettled([call(bob,ws,{op:'accept',id:a.id}),call(carol,ws,{op:'accept',id:b.id})]);
  expect(outcomes.filter(x=>x.status==='fulfilled')).toHaveLength(1);
  expect(outcomes.filter(x=>x.status==='rejected')).toHaveLength(1);
  expect(await owner`SELECT * FROM allura.workspace_grants WHERE workspace_id=${ws} AND active AND role='workspace_admin'`).toHaveLength(1);
  await expect(readEvents(app,org,{groupId:group,workspaceId:ws})).rejects.toThrow('forbidden');
});

test('organization projection is allowlisted and contains no content or request rationale', async () => {
  const ws = await create();
  await call(bob,ws,{op:'request',role:'viewer',reason:'private request reason'});
  await owner`INSERT INTO allura.events(group_id,workspace_id,actor_id,kind,payload) VALUES (${group},${ws},${ids.alice},'capture','{"content":"private evidence"}')`;
  const metadata = await call(org,ws,{op:'metadata'});
  expect(metadata.workspaceId).toBe(ws); expect(metadata.orphaned).toBe(false);
  const serialized = JSON.stringify(metadata);
  expect(serialized).not.toContain('private evidence'); expect(serialized).not.toContain('private request reason');
  await expect(call(bob,ws,{op:'metadata'})).rejects.toThrow('forbidden');
  await expect(call(org,ws,{op:'metadata'},'allura-access-foreign')).rejects.toThrow('forbidden');
});

test('invitation expiry withdrawal cancellation and concurrent revisions fail safely', async () => {
  const ws = await create();
  const expired = await call(alice,ws,{op:'invite',target:ids.bob,role:'viewer',expiresAt:'2020-01-01T00:00:00Z'});
  expect(await call(bob,ws,{op:'invite_status',id:expired.id})).toMatchObject({outcome:'expired',workspaceName:'Confidential'});
  expect((await call(bob,ws,{op:'accept',id:expired.id})).outcome).toBe('expired');
  const withdrawn = await call(alice,ws,{op:'invite',target:ids.bob,role:'viewer'});
  expect((await call(alice,ws,{op:'revoke_invite',id:withdrawn.id})).outcome).toBe('revoked');
  await expect(call(bob,ws,{op:'accept',id:withdrawn.id})).rejects.toThrow('conflict');
  const request = await call(bob,ws,{op:'request',role:'viewer',reason:'Request then cancel'});
  expect((await call(bob,ws,{op:'cancel_request',id:request.id})).outcome).toBe('cancelled');
  await expect(call(alice,ws,{op:'decide_request',id:request.id,decision:'approve',role:'viewer'})).rejects.toThrow('conflict');
  const results = await Promise.allSettled([call(alice,ws,{op:'grant',target:ids.carol,role:'viewer',revision:0}),call(alice,ws,{op:'grant',target:ids.carol,role:'curator',revision:0})]);
  expect(results.filter(x=>x.status==='fulfilled')).toHaveLength(1); expect(results.filter(x=>x.status==='rejected')).toHaveLength(1);
  const unknown = randomUUID(), unavailable = await call(bob,unknown,{op:'request',role:'viewer',reason:'Private unknown selector'});
  expect((await call(bob,unknown,{op:'request_status',id:unavailable.id})).outcome).toBe('unavailable');
});

test('stale requests and malformed inputs never overwrite grants', async () => {
  const ws = await create();
  const request = await call(bob,ws,{op:'request',role:'curator',reason:'Original request'});
  await call(alice,ws,{op:'grant',target:ids.bob,role:'viewer',revision:0});
  await expect(call(alice,ws,{op:'decide_request',id:request.id,decision:'approve',role:'curator'})).rejects.toThrow('conflict');
  await expect(call(alice,null,{op:'create',name:123,target:ids.alice})).rejects.toThrow('invalid');
  await expect(call(alice,ws,{op:'request',role:'viewer',reason:123})).rejects.toThrow('invalid');
  await expect(call(alice,ws,{op:'grant',target:ids.carol,role:'viewer',revision:'0'})).rejects.toThrow('invalid');
});

test('audit failure rolls back grant and untrusted identity or locked scope denies', async () => {
  const ws = await create();
  await owner.unsafe("CREATE FUNCTION allura.test_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected audit failure'; END $$; CREATE TRIGGER test_failure BEFORE INSERT ON allura.access_audit FOR EACH ROW EXECUTE FUNCTION allura.test_audit_failure()");
  try { await expect(call(alice,ws,{op:'grant',target:ids.bob,role:'viewer',revision:0})).rejects.toThrow(); }
  finally { await owner.unsafe('DROP TRIGGER test_failure ON allura.access_audit; DROP FUNCTION allura.test_audit_failure()'); }
  expect(await owner`SELECT * FROM allura.workspace_grants WHERE workspace_id=${ws} AND principal_id=${ids.bob}`).toHaveLength(0);
  await expect(call({...alice},ws,{op:'grant',target:ids.bob,role:'viewer',revision:0})).rejects.toThrow('unauthenticated');
  await owner`UPDATE allura.workspaces SET locked=true WHERE id=${ws}`;
  await expect(call(alice,ws,{op:'invite',target:ids.bob,role:'viewer'})).rejects.toThrow('forbidden');
  await expect(app`SELECT * FROM allura.workspace_invitations`.execute()).rejects.toThrow();
});
