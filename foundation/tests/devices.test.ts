import {expect,test} from 'bun:test';
import {randomBytes,randomUUID} from 'node:crypto';
import {deviceCommand} from '../src/devices.ts';
import {deviceChallenge} from '../src/device-contract.ts';
import {authenticateMachine} from '../src/authentication.ts';
import {appendEvent,DatabaseStore} from '../src/persistence.ts';
import {fixture} from './lifecycle-fixture.ts';
const secret=()=>randomBytes(32).toString('base64url');
const setup=()=>fixture(`allura-enroll-${randomUUID()}`);
type F=Awaited<ReturnType<typeof setup>>;
const cmd=(f:F,input:unknown,who:keyof F['identities']='curator')=>deviceCommand(f.app,f.identities[who],f.scope,input);
async function begin(f:F){const verifier=secret(),token=secret(),input={kind:'begin',label:'Owned test device',challenge:deviceChallenge(verifier),actions:['memory:read','memory:capture'],operationKey:randomUUID()};const receipt=await cmd(f,input);return {input,verifier,token,enrollmentId:String(receipt.enrollmentId),receipt};}
async function enroll(f:F){const b=await begin(f);await cmd(f,{kind:'approve',enrollmentId:b.enrollmentId,expectedRevision:1,actions:['memory:read','memory:capture']},'author');const complete={kind:'complete',enrollmentId:b.enrollmentId,verifier:b.verifier,token:b.token};return {...b,complete,issued:await cmd(f,complete)};}
test('device enrollment needs explicit current admin approval and proof then returns secret free replay receipts',async()=>{
 const f=await setup();try{
  const b=await begin(f);expect(await cmd(f,b.input)).toEqual(b.receipt);
  await expect(cmd(f,{...b.input,label:'changed'})).rejects.toThrow('conflict');
  const complete={kind:'complete',enrollmentId:b.enrollmentId,verifier:b.verifier,token:b.token};await expect(cmd(f,complete)).rejects.toThrow('conflict');
  await expect(cmd(f,{kind:'approve',enrollmentId:b.enrollmentId,expectedRevision:1,actions:['memory:read']},'curator')).rejects.toThrow('forbidden');
  await cmd(f,{kind:'approve',enrollmentId:b.enrollmentId,expectedRevision:1,actions:['memory:read','memory:capture']},'author');
  await expect(cmd(f,{...complete,verifier:secret()})).rejects.toThrow('not_found');
  const issued=await cmd(f,complete);expect(issued.outcome).toBe('issued');expect(issued.generation).toBe(1);expect(await cmd(f,complete)).toEqual(issued);
  await expect(cmd(f,{...complete,token:secret()})).rejects.toThrow('conflict');
  const identity=await authenticateMachine(b.token,d=>new DatabaseStore(f.app).lookupMachine(d));expect(identity.kind).toBe('device');expect(await appendEvent(f.app,identity,f.scope,{content:'enrolled capture'})).toBeString();
  const [audit]=await f.owner`SELECT jsonb_agg(to_jsonb(a)) AS data FROM allura.device_audit a WHERE group_id=${f.scope.groupId}`;
  for(const value of [b.token,b.verifier,b.input.challenge,b.input.label]){expect(JSON.stringify(audit.data)).not.toContain(value);expect(JSON.stringify(issued)).not.toContain(value);}
  expect(audit.data.length).toBe(3);expect((await cmd(f,{kind:'status',enrollmentId:b.enrollmentId})).status).toBe('completed');
  expect((await cmd(f,{kind:'list'})).devices).toHaveLength(1);
 }finally{await f.close();}
});
test('device enrollment rejects foreign owners expired proofs stale approvers and machine callers',async()=>{
 const f=await setup();try{
  const b=await begin(f),approve={kind:'approve',enrollmentId:b.enrollmentId,expectedRevision:1,actions:['memory:read','memory:capture']};
  await expect(cmd(f,{kind:'status',enrollmentId:b.enrollmentId},'viewer')).rejects.toThrow('not_found');
  await expect(cmd(f,{kind:'status',enrollmentId:b.enrollmentId},'machine')).rejects.toThrow('forbidden');
  await expect(cmd(f,b.input,'org')).rejects.toThrow('forbidden');
  await expect(cmd(f,{...approve,actions:['memory:read','proposal:write']},'author')).rejects.toThrow('invalid');
  await cmd(f,approve,'author');await expect(cmd(f,{...approve,expectedRevision:1},'author')).rejects.toThrow('conflict');
  await f.owner`UPDATE allura.workspace_grants SET role='curator' WHERE principal_id=${f.ids.author}`;
  const complete={kind:'complete',enrollmentId:b.enrollmentId,verifier:b.verifier,token:b.token};await expect(cmd(f,complete)).rejects.toThrow('forbidden');
  await f.owner`UPDATE allura.workspace_grants SET role='workspace_admin' WHERE principal_id=${f.ids.author}`;
  await f.owner`UPDATE allura.device_enrollments SET expires_at=clock_timestamp()-interval '1 second' WHERE id=${b.enrollmentId}`;
  await expect(cmd(f,complete)).rejects.toThrow('not_found');
  const [n]=await f.owner`SELECT count(*)::integer AS n FROM allura.device_owners WHERE group_id=${f.scope.groupId}`;expect(n.n).toBe(0);
 }finally{await f.close();}
});
test('device rotation revocation and replay never reactivate an old credential generation',async()=>{
 const f=await setup();try{
  const e=await enroll(f),deviceId=String(e.issued.deviceId),token=secret(),rotation={kind:'rotate',deviceId,expectedGeneration:1,token,operationKey:randomUUID()},store=new DatabaseStore(f.app);
  const rotated=await cmd(f,rotation);expect(rotated.generation).toBe(2);expect(await cmd(f,rotation)).toEqual(rotated);
  await expect(authenticateMachine(e.token,d=>store.lookupMachine(d))).rejects.toThrow('unauthenticated');expect((await authenticateMachine(token,d=>store.lookupMachine(d))).kind).toBe('device');
  await expect(cmd(f,{...rotation,token:secret()})).rejects.toThrow('conflict');await expect(cmd(f,{...rotation,operationKey:randomUUID()})).rejects.toThrow('conflict');
  await expect(cmd(f,{kind:'revoke',deviceId,operationKey:'foreign'},'viewer')).rejects.toThrow('not_found');
  const revoke={kind:'revoke',deviceId,operationKey:randomUUID()},revoked=await cmd(f,revoke,'author');expect(revoked.outcome).toBe('revoked');expect(await cmd(f,revoke,'author')).toEqual(revoked);
  expect(await cmd(f,rotation)).toEqual(rotated);await expect(authenticateMachine(token,d=>store.lookupMachine(d))).rejects.toThrow('unauthenticated');
  await expect(cmd(f,{...rotation,expectedGeneration:2,operationKey:randomUUID(),token:secret()})).rejects.toThrow('conflict');
  const [count]=await f.owner`SELECT count(*)::integer AS n FROM allura.machine_credentials WHERE principal_id=${deviceId} AND NOT revoked`;expect(count.n).toBe(0);
 }finally{await f.close();}
});
test('device concurrent exchanges rotations and enrollment cap have one bounded durable outcome',async()=>{
 const f=await setup();try{
  const b=await begin(f);await cmd(f,{kind:'approve',enrollmentId:b.enrollmentId,expectedRevision:1,actions:['memory:read']},'author');
  const complete={kind:'complete',enrollmentId:b.enrollmentId,verifier:b.verifier,token:b.token};const issued=await Promise.all([cmd(f,complete),cmd(f,complete)]);expect(issued[0]).toEqual(issued[1]);
  const deviceId=String(issued[0]!.deviceId),rotate={kind:'rotate',deviceId,expectedGeneration:1,token:secret(),operationKey:randomUUID()};
  const competing=await Promise.allSettled([cmd(f,rotate),cmd(f,{...rotate,token:secret(),operationKey:randomUUID()})]);expect(competing.filter(x=>x.status==='fulfilled')).toHaveLength(1);
  const requests=await Promise.allSettled(Array.from({length:10},()=>begin(f)));expect(requests.filter(x=>x.status==='fulfilled')).toHaveLength(7);expect(requests.filter(x=>x.status==='rejected')).toHaveLength(3);
  const [count]=await f.owner`SELECT count(*)::integer AS n FROM allura.device_owners WHERE group_id=${f.scope.groupId}`;expect(count.n).toBe(1);
 }finally{await f.close();}
},15000);
test('device audit failure rolls back exchange and rotation without credential leaks',async()=>{
 const f=await setup();try{
  const b=await begin(f);await cmd(f,{kind:'approve',enrollmentId:b.enrollmentId,expectedRevision:1,actions:['memory:read']},'author');
  await f.owner.unsafe("CREATE FUNCTION allura.fail_device_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture audit failure'; END $$; CREATE TRIGGER device_audit_fault BEFORE INSERT ON allura.device_audit FOR EACH ROW EXECUTE FUNCTION allura.fail_device_audit()");
  const complete={kind:'complete',enrollmentId:b.enrollmentId,verifier:b.verifier,token:b.token};await expect(cmd(f,complete)).rejects.toThrow('unknown');
  expect((await f.owner`SELECT count(*)::integer AS n FROM allura.device_owners WHERE group_id=${f.scope.groupId}`)[0].n).toBe(0);
  await f.owner.unsafe('DROP TRIGGER device_audit_fault ON allura.device_audit');const issued=await cmd(f,complete);
  await f.owner.unsafe('CREATE TRIGGER device_audit_fault BEFORE INSERT ON allura.device_audit FOR EACH ROW EXECUTE FUNCTION allura.fail_device_audit()');
  await expect(cmd(f,{kind:'rotate',deviceId:issued.deviceId,expectedGeneration:1,token:secret(),operationKey:randomUUID()})).rejects.toThrow('unknown');
  expect((await authenticateMachine(b.token,d=>new DatabaseStore(f.app).lookupMachine(d))).kind).toBe('device');
  await f.owner.unsafe('DROP TRIGGER device_audit_fault ON allura.device_audit; DROP FUNCTION allura.fail_device_audit()');
  await expect(f.app`SELECT * FROM allura.device_enrollments`.execute()).rejects.toThrow();await expect(f.owner`DELETE FROM allura.device_audit WHERE group_id=${f.scope.groupId}`.execute()).rejects.toThrow('append-only');
 }finally{await f.close();}
});
test('device expiry requires human reauthentication and duplicate tokens cannot create partial authority',async()=>{
 const f=await setup();try{
  const e=await enroll(f),store=new DatabaseStore(f.app),deviceId=String(e.issued.deviceId);
  const [ttl]=await f.owner`SELECT extract(epoch FROM expires_at-clock_timestamp()) AS seconds FROM allura.machine_credentials WHERE id=${String(e.issued.credentialId)}`;
  expect(Number(ttl.seconds)).toBeLessThanOrEqual(2592000);expect(Number(ttl.seconds)).toBeGreaterThan(2591900);
  await f.owner`UPDATE allura.machine_credentials SET expires_at=clock_timestamp()-interval '1 second' WHERE id=${String(e.issued.credentialId)}`;
  await expect(authenticateMachine(e.token,d=>store.lookupMachine(d))).rejects.toThrow('unauthenticated');
  const replacement=secret();expect((await cmd(f,{kind:'rotate',deviceId,expectedGeneration:1,token:replacement,operationKey:randomUUID()})).generation).toBe(2);
  expect((await authenticateMachine(replacement,d=>store.lookupMachine(d))).kind).toBe('device');
  const b=await begin(f);await cmd(f,{kind:'approve',enrollmentId:b.enrollmentId,expectedRevision:1,actions:['memory:read']},'author');
  await expect(cmd(f,{kind:'complete',enrollmentId:b.enrollmentId,verifier:b.verifier,token:replacement})).rejects.toThrow('conflict');
  expect((await f.owner`SELECT count(*)::integer AS n FROM allura.device_owners WHERE group_id=${f.scope.groupId}`)[0].n).toBe(1);
  expect((await cmd(f,{kind:'status',enrollmentId:b.enrollmentId})).status).toBe('approved');
  expect((await cmd(f,{kind:'complete',enrollmentId:b.enrollmentId,verifier:b.verifier,token:b.token})).generation).toBe(1);
 }finally{await f.close();}
});
test('device deferred commit failure and preaborted commands leave no authority or receipts',async()=>{
 const f=await setup();try{
  const b=await begin(f);await cmd(f,{kind:'approve',enrollmentId:b.enrollmentId,expectedRevision:1,actions:['memory:read']},'author');
  const complete={kind:'complete',enrollmentId:b.enrollmentId,verifier:b.verifier,token:b.token};
  const controller=new AbortController();controller.abort();await expect(deviceCommand(f.app,f.identities.curator,f.scope,complete,controller.signal)).rejects.toThrow('unknown');
  await f.owner.unsafe("CREATE FUNCTION allura.fail_device_commit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture deferred failure'; END $$; CREATE CONSTRAINT TRIGGER device_commit_fault AFTER INSERT ON allura.device_audit DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION allura.fail_device_commit()");
  await expect(cmd(f,complete)).rejects.toThrow('unknown');
  expect((await f.owner`SELECT count(*)::integer AS n FROM allura.device_owners WHERE group_id=${f.scope.groupId}`)[0].n).toBe(0);
  expect((await cmd(f,{kind:'status',enrollmentId:b.enrollmentId})).status).toBe('approved');
  await f.owner.unsafe('DROP TRIGGER device_commit_fault ON allura.device_audit; DROP FUNCTION allura.fail_device_commit()');
  expect((await cmd(f,complete)).outcome).toBe('issued');
 }finally{await f.close();}
});
