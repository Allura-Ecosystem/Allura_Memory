import { expect, test } from 'bun:test';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { authenticateMachine } from '../src/authentication.ts';
import { resolveAuthority } from '../src/authority.ts';
import { appendEvent, DatabaseStore, scopedTransaction } from '../src/persistence.ts';
import { fixture } from './lifecycle-fixture.ts';
async function deviceFixture(){
 const f=await fixture(`allura-device-${randomUUID()}`),deviceId=randomUUID(),credentialId=randomUUID(),token=randomBytes(32).toString('base64url'),digest=createHash('sha256').update(token).digest('hex');
 try{
  await f.owner`INSERT INTO allura.principals(id,kind) VALUES (${deviceId},'device')`;
  await f.owner`INSERT INTO allura.memberships(group_id,principal_id) VALUES (${f.scope.groupId},${deviceId})`;
  await f.owner`INSERT INTO allura.workspace_grants(group_id,workspace_id,principal_id,role,issuer) VALUES (${f.scope.groupId},${f.scope.workspaceId},${deviceId},'curator',${f.ids.author})`;
  await f.owner`INSERT INTO allura.machine_credentials(id,principal_id,digest,group_id,workspace_id,actions,expires_at) VALUES (${credentialId},${deviceId},decode(${digest},'hex'),${f.scope.groupId},${f.scope.workspaceId},ARRAY['memory:read','memory:capture','proposal:write','review:read'],clock_timestamp()+interval '1 day')`;
  await f.owner`INSERT INTO allura.device_owners(device_id,group_id,workspace_id,owner_id,owner_issuer,owner_subject,current_credential_id) VALUES (${deviceId},${f.scope.groupId},${f.scope.workspaceId},${f.ids.curator},${f.humanConfig.issuer},${`${f.scope.groupId}:curator`},${credentialId})`;
  const store=new DatabaseStore(f.app),identity=await authenticateMachine(token,d=>store.lookupMachine(d));return {...f,deviceId,credentialId,token,digest,store,identity};
 }catch(error){await f.close();throw error;}
}
test('device current authority intersects owner role and never gains human or admin powers',async()=>{
 const f=await deviceFixture();try{
  expect(f.identity.kind).toBe('device');expect((await resolveAuthority(f.identity,f.scope,'memory:capture',f.store)).principalId).toBe(f.deviceId);expect(await appendEvent(f.app,f.identity,f.scope,{content:'device evidence'})).toBeString();
  for(const action of ['review:approve','workspace:grants:manage','evidence:read','memory:delete','audit:read']){await expect(resolveAuthority(f.identity,f.scope,action,f.store)).rejects.toThrow('forbidden');}
  await f.owner`UPDATE allura.workspace_grants SET role='viewer' WHERE principal_id=${f.ids.curator} AND group_id=${f.scope.groupId}`;
  expect((await resolveAuthority(f.identity,f.scope,'memory:read',f.store)).kind).toBe('device');await expect(appendEvent(f.app,f.identity,f.scope,{content:'denied'})).rejects.toThrow('forbidden');
  await expect(resolveAuthority(f.identity,{...f.scope,workspaceId:f.foreignWorkspace},'memory:read',f.store)).rejects.toThrow('forbidden');
  const [count]=await f.owner`SELECT count(*)::integer AS n FROM allura.events WHERE actor_id=${f.deviceId}`;expect(count.n).toBe(1);
 }finally{await f.close();}
});
test('device owner binding membership grant and current generation fail closed on reused identity',async()=>{
 const f=await deviceFixture();try{
  const probes=[
   {off:()=>f.owner`UPDATE allura.principals SET active=false WHERE id=${f.ids.curator}`,on:()=>f.owner`UPDATE allura.principals SET active=true WHERE id=${f.ids.curator}`},
   {off:()=>f.owner`UPDATE allura.identity_bindings SET active=false WHERE principal_id=${f.ids.curator}`,on:()=>f.owner`UPDATE allura.identity_bindings SET active=true WHERE principal_id=${f.ids.curator}`},
   {off:()=>f.owner`UPDATE allura.memberships SET active=false WHERE principal_id=${f.ids.curator}`,on:()=>f.owner`UPDATE allura.memberships SET active=true WHERE principal_id=${f.ids.curator}`},
   {off:()=>f.owner`UPDATE allura.workspace_grants SET active=false WHERE principal_id=${f.ids.curator}`,on:()=>f.owner`UPDATE allura.workspace_grants SET active=true WHERE principal_id=${f.ids.curator}`},
   {off:()=>f.owner`UPDATE allura.workspaces SET locked=true WHERE id=${f.scope.workspaceId}`,on:()=>f.owner`UPDATE allura.workspaces SET locked=false WHERE id=${f.scope.workspaceId}`},
   {off:()=>f.owner`UPDATE allura.device_owners SET revoked=true WHERE device_id=${f.deviceId}`,on:()=>f.owner`UPDATE allura.device_owners SET revoked=false WHERE device_id=${f.deviceId}`},
  ];
  for(const probe of probes){await probe.off();await expect(resolveAuthority(f.identity,f.scope,'memory:read',f.store)).rejects.toThrow('forbidden');await expect(authenticateMachine(f.token,d=>f.store.lookupMachine(d))).rejects.toThrow('unauthenticated');await probe.on();expect((await resolveAuthority(f.identity,f.scope,'memory:read',f.store)).kind).toBe('device');}
  const newer=randomUUID();await f.owner`INSERT INTO allura.machine_credentials(id,principal_id,digest,group_id,workspace_id,actions,expires_at) VALUES (${newer},${f.deviceId},decode(${createHash('sha256').update(randomBytes(32)).digest('hex')},'hex'),${f.scope.groupId},${f.scope.workspaceId},ARRAY['memory:read'],clock_timestamp()+interval '1 day')`;
  await f.owner`UPDATE allura.device_owners SET current_credential_id=${newer},generation=generation+1 WHERE device_id=${f.deviceId}`;
  await expect(resolveAuthority(f.identity,f.scope,'memory:read',f.store)).rejects.toThrow('forbidden');await expect(authenticateMachine(f.token,d=>f.store.lookupMachine(d))).rejects.toThrow('unauthenticated');
 }finally{await f.close();}
});
test('device linkage and baseline helpers are private and RLS sees owner attenuation',async()=>{
 const f=await deviceFixture();try{
  await expect(f.app`SELECT * FROM allura.device_owners`.execute()).rejects.toThrow();await expect(f.app`SELECT allura.lookup_machine_pre_device(${f.digest})`.execute()).rejects.toThrow();
  await scopedTransaction(f.app,f.identity,f.scope,'memory:capture',async tx=>{
   const [before]=await tx`SELECT allura.context_allows(${f.scope.groupId},${f.scope.workspaceId}::uuid,'memory:capture') AS ok`;expect(before.ok).toBe(true);
  });
  await f.owner`UPDATE allura.workspace_grants SET role='viewer' WHERE principal_id=${f.ids.curator}`;
  await f.app.begin(async tx=>{
   await tx`SELECT set_config('allura.kind','device',true),set_config('allura.principal',${f.deviceId},true),set_config('allura.group',${f.scope.groupId},true),set_config('allura.workspace',${f.scope.workspaceId},true),set_config('allura.credential',${f.digest},true),set_config('allura.action','memory:capture',true)`;
   const [row]=await tx`SELECT allura.context_allows(${f.scope.groupId},${f.scope.workspaceId}::uuid,'memory:capture') AS ok`;expect(row.ok).toBe(false);
  });
  await f.owner`DELETE FROM allura.device_owners WHERE device_id=${f.deviceId}`;await expect(authenticateMachine(f.token,d=>f.store.lookupMachine(d))).rejects.toThrow('unauthenticated');
 }finally{await f.close();}
});
test('device transaction locks owner authority until completion then revocation denies',async()=>{
 const f=await deviceFixture();let release:()=>void=()=>{};try{
  let entered:()=>void=()=>{};const ready=new Promise<void>(r=>{entered=r;}),hold=new Promise<void>(r=>{release=r;});
  const reading=scopedTransaction(f.app,f.identity,f.scope,'memory:read',async()=>{entered();await hold;return 'committed';});await ready;
  let changed=false;const revoke=f.owner`UPDATE allura.workspace_grants SET active=false WHERE principal_id=${f.ids.curator}`.execute().then(()=>{changed=true;});
  await Bun.sleep(100);expect(changed).toBe(false);release();expect(await reading).toBe('committed');await revoke;expect(changed).toBe(true);
  await expect(resolveAuthority(f.identity,f.scope,'memory:read',f.store)).rejects.toThrow('forbidden');
 }finally{release();await f.close();}
});
