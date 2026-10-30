import { expect, test } from 'bun:test';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { authenticateMachine } from '../src/authentication.ts';
import { resolveAuthority } from '../src/authority.ts';
import { appendEvent, DatabaseStore, readEvents, scopedTransaction } from '../src/persistence.ts';
import { createCoreGateway } from '../src/core-api.ts';
import { loadLocalEmbedder } from '../src/embedding.ts';
import { fixture } from './lifecycle-fixture.ts';

const contentActions = ['memory:read','memory:capture','evidence:read','proposal:write','review:read','memory:delete','audit:read','health:read'];
async function clientFixture() {
 const f = await fixture(`allura-client-${randomUUID()}`);
 const clientId=randomUUID(),credentialId=randomUUID(),delegationId=randomUUID();
 const token=randomBytes(32).toString('base64url'),digest=createHash('sha256').update(token).digest('hex');
 try {
  await f.owner`INSERT INTO allura.principals(id,kind) VALUES (${clientId},'service')`;
  await f.owner`INSERT INTO allura.memberships(group_id,principal_id) VALUES (${f.scope.groupId},${clientId})`;
  // A legacy curator grant makes accidental fallback observable, not harmless.
  await f.owner`INSERT INTO allura.workspace_grants(group_id,workspace_id,principal_id,role,issuer) VALUES (${f.scope.groupId},${f.scope.workspaceId},${clientId},'curator',${f.ids.author})`;
  await f.owner`INSERT INTO allura.client_delegations(id,client_id,group_id,workspace_id,owner_id,owner_issuer,owner_subject,actions) VALUES (${delegationId},${clientId},${f.scope.groupId},${f.scope.workspaceId},${f.ids.author},${f.humanConfig.issuer},${`${f.scope.groupId}:author`},${f.owner.array(contentActions,'TEXT')})`;
  await f.owner`INSERT INTO allura.machine_credentials(id,principal_id,digest,group_id,workspace_id,actions,expires_at,client_bound,client_delegation_id) VALUES (${credentialId},${clientId},decode(${digest},'hex'),${f.scope.groupId},${f.scope.workspaceId},${f.owner.array(contentActions,'TEXT')},clock_timestamp()+interval '1 hour',true,${delegationId})`;
  const store=new DatabaseStore(f.app),identity=await authenticateMachine(token,d=>store.lookupMachine(d));
  return {...f,clientId,credentialId,delegationId,token,digest,store,identity};
 } catch(error) { await f.close(); throw error; }
}

test('client current and authenticated actions intersect delegation credential and owner',async()=>{
 const f=await clientFixture();
 try {
  await f.owner`UPDATE allura.client_delegations SET actions=ARRAY['memory:read'] WHERE id=${f.delegationId}`;
  await expect(resolveAuthority(f.identity,f.scope,'memory:capture',f.store)).rejects.toThrow('forbidden');
  const narrowed=await authenticateMachine(f.token,d=>f.store.lookupMachine(d));
  expect(narrowed.kind==='service' && narrowed.actions).toEqual(['memory:read']);
  expect((await resolveAuthority(f.identity,f.scope,'memory:read',f.store)).principalId).toBe(f.clientId);
  await f.owner`UPDATE allura.client_delegations SET actions=${f.owner.array(contentActions,'TEXT')} WHERE id=${f.delegationId}`;
  await f.owner`UPDATE allura.machine_credentials SET actions=ARRAY['memory:read'] WHERE id=${f.credentialId}`;
  await expect(resolveAuthority(f.identity,f.scope,'memory:capture',f.store)).rejects.toThrow('forbidden');
  await f.owner`UPDATE allura.machine_credentials SET actions=${f.owner.array(contentActions,'TEXT')} WHERE id=${f.credentialId}`;
  await f.owner`UPDATE allura.workspace_grants SET role='viewer' WHERE principal_id=${f.ids.author}`;
  const demoted=await authenticateMachine(f.token,d=>f.store.lookupMachine(d));
  expect(demoted.kind==='service' && demoted.actions).toEqual(['memory:read']);
  await expect(resolveAuthority(f.identity,f.scope,'memory:capture',f.store)).rejects.toThrow('forbidden');
 } finally { await f.close(); }
});

test('client authentication denies revoked or missing linkage without legacy fallback',async()=>{
 const f=await clientFixture();
 try {
  await f.owner`UPDATE allura.client_delegations SET revoked=true WHERE id=${f.delegationId}`;
  await expect(authenticateMachine(f.token,d=>f.store.lookupMachine(d))).rejects.toThrow('unauthenticated');
  await expect(resolveAuthority(f.identity,f.scope,'memory:read',f.store)).rejects.toThrow('forbidden');
  await f.owner`UPDATE allura.client_delegations SET revoked=false WHERE id=${f.delegationId}`;
  expect((await resolveAuthority(f.identity,f.scope,'memory:read',f.store)).kind).toBe('service');
  await f.owner`DELETE FROM allura.client_delegations WHERE id=${f.delegationId}`;
  const [row]=await f.owner`SELECT client_bound,client_delegation_id FROM allura.machine_credentials WHERE id=${f.credentialId}`;
  expect(row).toMatchObject({client_bound:true,client_delegation_id:null});
  await expect(authenticateMachine(f.token,d=>f.store.lookupMachine(d))).rejects.toThrow('unauthenticated');
  await expect(resolveAuthority(f.identity,f.scope,'memory:read',f.store)).rejects.toThrow('forbidden');
 } finally { await f.close(); }
});

test('client SQL context and event RLS independently enforce delegation action narrowing',async()=>{
 const f=await clientFixture();
 try {
  await appendEvent(f.app,f.identity,f.scope,{content:'private sentinel'});
  await f.owner`UPDATE allura.client_delegations SET actions=ARRAY['memory:read'] WHERE id=${f.delegationId}`;
  await f.app.begin(async tx=>{
   await tx`SELECT set_config('allura.kind','service',true),set_config('allura.principal',${f.clientId},true),set_config('allura.group',${f.scope.groupId},true),set_config('allura.workspace',${f.scope.workspaceId},true),set_config('allura.credential',${f.digest},true),set_config('allura.action','evidence:read',true)`;
   const [row]=await tx`SELECT allura.context_allows(${f.scope.groupId},${f.scope.workspaceId}::uuid,'evidence:read') AS ok`;
   expect(row.ok).toBe(false);
   expect(await tx`SELECT id FROM allura.events WHERE group_id=${f.scope.groupId}`).toHaveLength(0);
  });
  await expect(f.app.begin(async tx=>{
   await tx`SELECT set_config('allura.kind','service',true),set_config('allura.principal',${f.clientId},true),set_config('allura.group',${f.scope.groupId},true),set_config('allura.workspace',${f.scope.workspaceId},true),set_config('allura.credential',${f.digest},true),set_config('allura.action','memory:capture',true)`;
   await tx`INSERT INTO allura.events(group_id,workspace_id,id,actor_id,kind,payload) VALUES(${f.scope.groupId},${f.scope.workspaceId},${randomUUID()},${f.clientId},'capture','{}')`;
  })).rejects.toThrow('row-level security');
  const [count]=await f.owner`SELECT count(*)::integer AS n FROM allura.events WHERE actor_id=${f.clientId}`;
  expect(count.n).toBe(1);
 } finally { await f.close(); }
});

async function assertSerializedRevocation(change:(f:ClientFixture)=>PromiseLike<unknown>,authenticationDenied=true) {
 const f=await clientFixture();
 let release:()=>void=()=>{};
 let reading:Promise<unknown>|undefined,revoke:Promise<unknown>|undefined;
 try {
  let entered:(pid:number)=>void=()=>{};
  const ready=new Promise<number>(r=>{entered=r;}),hold=new Promise<void>(r=>{release=r;});
  reading=scopedTransaction(f.app,f.identity,f.scope,'memory:read',async tx=>{
   const [row]=await tx`SELECT pg_backend_pid() AS pid`;entered(row.pid);await hold;return 'committed';
  }).catch(error=>error);
  const reader=await ready;
  let changed=false;
  revoke=Promise.resolve(change(f)).then(()=>{changed=true;});
  let blocked=false;
  for(let i=0;i<100&&!changed&&!blocked;i++){
   const [row]=await f.owner`SELECT EXISTS(SELECT FROM pg_stat_activity WHERE ${reader}::integer=ANY(pg_blocking_pids(pid))) AS blocked`;
   blocked=row.blocked;if(!blocked){await Bun.sleep(10);}
  }
  expect(blocked).toBe(true);expect(changed).toBe(false);
  release();expect(await reading).toBe('committed');await revoke;expect(changed).toBe(true);
  await expect(resolveAuthority(f.identity,f.scope,'memory:read',f.store)).rejects.toThrow('forbidden');
  if(authenticationDenied){await expect(authenticateMachine(f.token,d=>f.store.lookupMachine(d))).rejects.toThrow('unauthenticated');}
  else {const identity=await authenticateMachine(f.token,d=>f.store.lookupMachine(d));expect(identity.kind==='service' && identity.actions).toEqual([]);}
  expect(await rawAllows(f,'memory:read')).toBe(false);
 } finally { release();await reading;await revoke;await f.close(); }
}

test('client transaction holds current owner grant until commit before revocation',async()=>{
 await assertSerializedRevocation(f=>f.owner`UPDATE allura.workspace_grants SET active=false WHERE principal_id=${f.ids.author}`);
});
test('client transaction serializes delegation revocation deletion and action narrowing',async()=>{
 await assertSerializedRevocation(f=>f.owner`UPDATE allura.client_delegations SET revoked=true WHERE id=${f.delegationId}`);
 await assertSerializedRevocation(f=>f.owner`DELETE FROM allura.client_delegations WHERE id=${f.delegationId}`);
 await assertSerializedRevocation(f=>f.owner`UPDATE allura.client_delegations SET actions=ARRAY[]::text[] WHERE id=${f.delegationId}`,false);
});
test('client transaction holds owner binding membership and current credential',async()=>{
 await assertSerializedRevocation(f=>f.owner`UPDATE allura.identity_bindings SET active=false WHERE principal_id=${f.ids.author}`);
 await assertSerializedRevocation(f=>f.owner`UPDATE allura.memberships SET active=false WHERE principal_id=${f.ids.author}`);
 await assertSerializedRevocation(f=>f.owner`UPDATE allura.machine_credentials SET revoked=true WHERE id=${f.credentialId}`);
});
test('client transaction waiting behind owner revocation rechecks before callback',async()=>{
 const f=await clientFixture();let release:()=>void=()=>{};
 let revoking:Promise<unknown>|undefined,reading:Promise<unknown>|undefined;
 try {
  let entered:(pid:number)=>void=()=>{};
  const ready=new Promise<number>(r=>{entered=r;}),hold=new Promise<void>(r=>{release=r;});
  revoking=f.owner.begin(async tx=>{
   await tx`UPDATE allura.workspace_grants SET active=false WHERE principal_id=${f.ids.author}`;
   const [row]=await tx`SELECT pg_backend_pid() AS pid`;entered(row.pid);await hold;
  });
  const revoker=await ready;let worked=false;
  reading=scopedTransaction(f.app,f.identity,f.scope,'memory:read',async()=>{worked=true;}).catch(error=>error);
  let blocked=false;
  for(let i=0;i<100&&!blocked;i++){
   const [row]=await f.owner`SELECT EXISTS(SELECT FROM pg_stat_activity WHERE ${revoker}::integer=ANY(pg_blocking_pids(pid))) AS blocked`;
   blocked=row.blocked;if(!blocked){await Bun.sleep(10);}
  }
  expect(blocked).toBe(true);expect(worked).toBe(false);
  release();await revoking;expect(await reading).toMatchObject({message:'forbidden'});expect(worked).toBe(false);
 } finally {release();await revoking;await reading;await f.close();}
});

type ClientFixture=Awaited<ReturnType<typeof clientFixture>>;
async function rawAllows(f:ClientFixture,action:string) {
 return f.app.begin(async tx=>{
  await tx`SELECT set_config('allura.kind','service',true),set_config('allura.principal',${f.clientId},true),set_config('allura.group',${f.scope.groupId},true),set_config('allura.workspace',${f.scope.workspaceId},true),set_config('allura.credential',${f.digest},true),set_config('allura.action',${action},true)`;
  const [row]=await tx`SELECT allura.context_allows(${f.scope.groupId},${f.scope.workspaceId}::uuid,${action}) AS ok`;
  return row.ok;
 });
}

test('client cached identity and SQL deny inactive owner client scope and expired credentials',async()=>{
 const f=await clientFixture();
 try {
  const probes=[
   {off:()=>f.owner`UPDATE allura.principals SET active=false WHERE id=${f.ids.author}`,on:()=>f.owner`UPDATE allura.principals SET active=true WHERE id=${f.ids.author}`},
   {off:()=>f.owner`UPDATE allura.identity_bindings SET active=false WHERE principal_id=${f.ids.author}`,on:()=>f.owner`UPDATE allura.identity_bindings SET active=true WHERE principal_id=${f.ids.author}`},
   {off:()=>f.owner`UPDATE allura.memberships SET active=false WHERE principal_id=${f.ids.author}`,on:()=>f.owner`UPDATE allura.memberships SET active=true WHERE principal_id=${f.ids.author}`},
   {off:()=>f.owner`UPDATE allura.workspace_grants SET active=false WHERE principal_id=${f.ids.author}`,on:()=>f.owner`UPDATE allura.workspace_grants SET active=true WHERE principal_id=${f.ids.author}`},
   {off:()=>f.owner`UPDATE allura.principals SET active=false WHERE id=${f.clientId}`,on:()=>f.owner`UPDATE allura.principals SET active=true WHERE id=${f.clientId}`},
   {off:()=>f.owner`UPDATE allura.memberships SET active=false WHERE principal_id=${f.clientId}`,on:()=>f.owner`UPDATE allura.memberships SET active=true WHERE principal_id=${f.clientId}`},
   {off:()=>f.owner`UPDATE allura.tenants SET active=false WHERE group_id=${f.scope.groupId}`,on:()=>f.owner`UPDATE allura.tenants SET active=true WHERE group_id=${f.scope.groupId}`},
   {off:()=>f.owner`UPDATE allura.workspaces SET locked=true WHERE id=${f.scope.workspaceId}`,on:()=>f.owner`UPDATE allura.workspaces SET locked=false WHERE id=${f.scope.workspaceId}`},
   {off:()=>f.owner`UPDATE allura.machine_credentials SET revoked=true WHERE id=${f.credentialId}`,on:()=>f.owner`UPDATE allura.machine_credentials SET revoked=false WHERE id=${f.credentialId}`},
   {off:()=>f.owner`UPDATE allura.machine_credentials SET expires_at=clock_timestamp()-interval '1 second' WHERE id=${f.credentialId}`,on:()=>f.owner`UPDATE allura.machine_credentials SET expires_at=clock_timestamp()+interval '1 hour' WHERE id=${f.credentialId}`},
  ];
  for(const probe of probes){
   await probe.off();
   await expect(authenticateMachine(f.token,d=>f.store.lookupMachine(d))).rejects.toThrow('unauthenticated');
   await expect(resolveAuthority(f.identity,f.scope,'memory:read',f.store)).rejects.toThrow('forbidden');
   expect(await rawAllows(f,'memory:read')).toBe(false);
   await probe.on();expect((await resolveAuthority(f.identity,f.scope,'memory:read',f.store)).principalId).toBe(f.clientId);
  }
  await f.owner`UPDATE allura.workspace_grants SET role='curator' WHERE principal_id=${f.ids.author}`;
  expect(await rawAllows(f,'memory:capture')).toBe(true);expect(await rawAllows(f,'evidence:read')).toBe(false);
  await f.owner`UPDATE allura.machine_credentials SET actions=ARRAY['memory:read'] WHERE id=${f.credentialId}`;
  expect(await rawAllows(f,'memory:capture')).toBe(false);
  await f.owner`DELETE FROM allura.machine_credentials WHERE id=${f.credentialId}`;
  await expect(authenticateMachine(f.token,d=>f.store.lookupMachine(d))).rejects.toThrow('unauthenticated');
  await expect(resolveAuthority(f.identity,f.scope,'memory:read',f.store)).rejects.toThrow('forbidden');
  expect(await rawAllows(f,'memory:read')).toBe(false);
 } finally {await f.close();}
});

test('client binding rejects foreign identities scopes and unapproved member inheritance',async()=>{
 const f=await clientFixture();
 try {
  await expect(f.owner`UPDATE allura.client_delegations SET owner_id=${f.ids.curator} WHERE id=${f.delegationId}`.execute()).rejects.toThrow('foreign key');
  await expect(f.owner`UPDATE allura.client_delegations SET owner_subject='unbound' WHERE id=${f.delegationId}`.execute()).rejects.toThrow('foreign key');
  await expect(f.owner`UPDATE allura.client_delegations SET owner_id=${f.ids.org},owner_subject=${`${f.scope.groupId}:org`} WHERE id=${f.delegationId}`.execute()).rejects.toThrow('foreign key');
  await expect(f.owner`UPDATE allura.client_delegations SET workspace_id=${f.foreignWorkspace} WHERE id=${f.delegationId}`.execute()).rejects.toThrow('foreign key');
  await expect(f.owner`UPDATE allura.client_delegations SET group_id='allura-foreign' WHERE id=${f.delegationId}`.execute()).rejects.toThrow('foreign key');
  await expect(f.owner`UPDATE allura.machine_credentials SET principal_id=${f.ids.machine} WHERE id=${f.credentialId}`.execute()).rejects.toThrow('foreign key');
  await expect(f.owner`UPDATE allura.machine_credentials SET workspace_id=${f.foreignWorkspace} WHERE id=${f.credentialId}`.execute()).rejects.toThrow('foreign key');
  for(const action of ['review:approve','workspace:grants:manage']){
   await expect(f.owner`UPDATE allura.client_delegations SET actions=ARRAY[${action}] WHERE id=${f.delegationId}`.execute()).rejects.toThrow('check constraint');
   expect(await rawAllows(f,action)).toBe(false);
  }
  await expect(resolveAuthority(f.identity,{...f.scope,workspaceId:f.foreignWorkspace},'memory:read',f.store)).rejects.toThrow('forbidden');
  await expect(resolveAuthority(f.identity,{...f.scope,groupId:'allura-foreign'},'memory:read',f.store)).rejects.toThrow('forbidden');
  // An unrelated legacy service still works; marking its credential as a
  // connection without its own explicit delegation cannot borrow this one's.
  expect((await resolveAuthority(f.identities.machine,f.scope,'memory:capture',f.store)).principalId).toBe(f.ids.machine);
  await f.owner`UPDATE allura.machine_credentials SET client_bound=true WHERE principal_id=${f.ids.machine}`;
  await expect(resolveAuthority(f.identities.machine,f.scope,'memory:read',f.store)).rejects.toThrow('forbidden');
  expect((await resolveAuthority(f.identity,f.scope,'memory:read',f.store)).principalId).toBe(f.clientId);
  // The connection's explicit grant does not rely on a legacy service grant.
  await f.owner`DELETE FROM allura.workspace_grants WHERE principal_id=${f.clientId}`;
  expect((await resolveAuthority(f.identity,f.scope,'memory:delete',f.store)).principalId).toBe(f.clientId);
 } finally {await f.close();}
});

test('client authority tables and preclient bypass helpers are inaccessible to app role',async()=>{
 const f=await clientFixture();
 try {
  await expect(f.app`SELECT * FROM allura.client_delegations`.execute()).rejects.toThrow('permission denied');
  await expect(f.app`UPDATE allura.client_delegations SET revoked=false`.execute()).rejects.toThrow('permission denied');
  await expect(f.app`UPDATE allura.machine_credentials SET client_bound=false`.execute()).rejects.toThrow('permission denied');
  await expect(f.app`SELECT allura.resolve_authority_pre_client('','','service',${f.clientId},${f.digest},${f.scope.groupId},${f.scope.workspaceId})`.execute()).rejects.toThrow('permission denied');
  await expect(f.app`SELECT allura.lookup_machine_pre_client(${f.digest})`.execute()).rejects.toThrow('permission denied');
  await expect(f.app`SELECT allura.lock_authority_pre_client(${f.clientId}::uuid,${f.scope.groupId},${f.scope.workspaceId}::uuid)`.execute()).rejects.toThrow('permission denied');
 } finally {await f.close();}
});

test('client actual core gateway authenticates bound read and denies narrowing revocation and foreign scope',async()=>{
 const f=await clientFixture();
 const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch:createCoreGateway(f.app,f.humanConfig,'https://client.invalid',randomBytes(32),await loadLocalEmbedder())});
 try {
  const url=new URL(`http://127.0.0.1:${server.port}/api/agent/memory/list?group_id=${f.scope.groupId}&workspace_id=${f.scope.workspaceId}`);
  const request=(target=url)=>fetch(target,{method:'POST',headers:{Authorization:`Bearer ${f.token}`,'content-type':'application/json'},body:'{}'});
  const ok=await request();expect(ok.status).toBe(200);expect(await ok.json()).toMatchObject({items:[]});
  const foreign=new URL(url);foreign.searchParams.set('workspace_id',f.foreignWorkspace);
  const denied=await request(foreign);expect(denied.status).toBe(403);expect(await denied.json()).toEqual({outcome:'forbidden'});
  await f.owner`UPDATE allura.client_delegations SET actions=ARRAY[]::text[] WHERE id=${f.delegationId}`;
  const narrow=await request();expect(narrow.status).toBe(403);expect(await narrow.json()).toEqual({outcome:'forbidden'});
  await f.owner`UPDATE allura.client_delegations SET revoked=true WHERE id=${f.delegationId}`;
  const revoked=await request();expect(revoked.status).toBe(401);expect(await revoked.json()).toEqual({outcome:'unauthenticated'});
  await f.owner`DELETE FROM allura.client_delegations WHERE id=${f.delegationId}`;
  expect((await request()).status).toBe(401);
 } finally {await server.stop(true);await f.close();}
});

test('owner linked client retains admin content authority without human impersonation',async()=>{
 const f=await clientFixture();
 try {
  expect(f.identity.kind).toBe('service');
  for(const action of contentActions) {
   expect((await resolveAuthority(f.identity,f.scope,action,f.store)).principalId).toBe(f.clientId);
  }
  const id=await appendEvent(f.app,f.identity,f.scope,{content:'owner client evidence'});
  expect(await readEvents(f.app,f.identity,f.scope)).toContainEqual(expect.objectContaining({id,actor_id:f.clientId}));
  expect(await scopedTransaction(f.app,f.identity,f.scope,'memory:delete',async tx=>{
   const [row]=await tx`SELECT allura.context_allows(${f.scope.groupId},${f.scope.workspaceId}::uuid,'memory:delete') AS ok`;
   return row.ok;
  })).toBe(true);
  for(const action of ['review:approve','workspace:grants:manage']) {
   await expect(resolveAuthority(f.identity,f.scope,action,f.store)).rejects.toThrow('forbidden');
  }
 } finally { await f.close(); }
});
