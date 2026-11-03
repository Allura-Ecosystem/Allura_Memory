import { test, expect, beforeAll, afterAll } from 'bun:test';
import { SQL } from 'bun';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { authenticateMachine, type Identity } from '../src/authentication.ts';
import { migrate, DatabaseStore } from '../src/persistence.ts';
import { capture, readCaptureReceipt, normalizeCapture, captureDigest } from '../src/capture.ts';
const target = process.env.ALLURA_DISPOSABLE_DB_URL;
if (!target || new URL(target).hostname!=='127.0.0.1' || process.env.ALLURA_DISPOSABLE_DB!=='owned-test-container') { throw new Error('Requires owned disposable runner'); }
const owner=new SQL(target,{max:3}); let app:SQL, actor:Identity, other:Identity;
const group='allura-capture', workspace=randomUUID(), principal=randomUUID(), principal2=randomUUID();
const scope={groupId:group,workspaceId:workspace};
const request=(key:string,content='Evidence from a bounded operation')=>({idempotency_key:key,content});
beforeAll(async()=>{
  await migrate(owner); const password=randomBytes(32).toString('hex');
  await owner.unsafe(`ALTER ROLE allura_app LOGIN PASSWORD '${password}'`);
  const url=new URL(target);url.username='allura_app';url.password=password;app=new SQL(url.toString(),{max:8});
  await owner`INSERT INTO allura.tenants(group_id) VALUES (${group})`;
  for(const id of [principal,principal2]) {
    await owner`INSERT INTO allura.principals(id,kind) VALUES (${id},'service')`;
    await owner`INSERT INTO allura.memberships(group_id,principal_id) VALUES (${group},${id})`;
  }
  await owner`INSERT INTO allura.workspaces(group_id,id,display_name,created_by) VALUES (${group},${workspace},'Capture fixture',${principal})`;
  const identities:Identity[]=[];
  for(const id of [principal,principal2]) {
    await owner`INSERT INTO allura.workspace_grants(group_id,workspace_id,principal_id,role,issuer) VALUES (${group},${workspace},${id},'curator',${id})`;
    const token=randomBytes(32).toString('base64url'),digest=createHash('sha256').update(token).digest('hex');
    await owner`INSERT INTO allura.machine_credentials(principal_id,digest,group_id,workspace_id,actions,expires_at) VALUES (${id},decode(${digest},'hex'),${group},${workspace},ARRAY['memory:capture','memory:read'],clock_timestamp()+interval '1 hour')`;
    identities.push(await authenticateMachine(token,d=>new DatabaseStore(app).lookupMachine(d)));
  }
  [actor,other]=identities as [Identity,Identity];
});
afterAll(async()=>{if(app){await app.close();}await owner.close();});

test('capture canonicalization preserves content and normalizes only declared defaults',()=>{
  const a=normalizeCapture({...request('key-a',' é\n '),metadata:{source:'agent',tags:['x','y']}});
  const b=normalizeCapture({...request('key-b',' é\n '),trace_type:'conversation',threshold:null,metadata:{tags:['x','y'],source:'agent'}});
  expect(captureDigest(scope,principal,a)).toBe(captureDigest(scope,principal,b));
  expect(a.content).toBe(' é\n ');
  expect(captureDigest(scope,principal,a)).not.toBe(captureDigest(scope,principal,{...a,content:'é'}));
  expect(captureDigest(scope,principal,a)).not.toBe(captureDigest(scope,principal2,a));
  for(const input of [{content:'x'},request('bad key'),{...request('x'),role:'admin'},{...request('x'),metadata:{actor:'spoof'}},{...request('x'),threshold:Infinity},{...request('x'),content:' '},{...request('x'),trace_type:'unknown'},{...request('x'),trace_type:null},{...request('x'),content:'bad\u0000text'},{...request('x'),content:'\ud800'},{...request('x'),metadata:{source:undefined}}]) {expect(()=>normalizeCapture(input)).toThrow('invalid');}
});

test('concurrent capture creates one atomic record set and byte exact replay',async()=>{
  const receipts=await Promise.all(Array.from({length:6},()=>capture(app,actor,scope,request('concurrent'))));
  expect(new Set(receipts).size).toBe(1);
  const receipt=JSON.parse(receipts[0]!);
  expect(receipt.persistence).toBe('succeeded');expect(receipt.indexing).toBe('pending');expect(receipt.promotion).toBe('not_requested');
  for(const table of ['capture_receipts','capture_replay','index_intents']) {
    expect(await owner.unsafe(`SELECT * FROM allura.${table} WHERE group_id=$1 AND event_id=$2`,[group,receipt.event_id])).toHaveLength(1);
  }
  expect(await owner`SELECT * FROM allura.events WHERE group_id=${group} AND id=${receipt.event_id}`).toHaveLength(1);
  expect(await readCaptureReceipt(app,actor,scope,receipt.receipt_id)).toBe(receipts[0]!);
});

test('capture conflicts and denied scope create no durable effects',async()=>{
  const first=await capture(app,actor,scope,request('conflict','original'));
  await expect(capture(app,actor,scope,request('conflict','changed'))).rejects.toThrow('conflict');
  expect(await capture(app,actor,scope,request('conflict','original'))).toBe(first);
  const before=await owner`SELECT count(*)::int AS n FROM allura.events WHERE group_id=${group}`;
  await expect(capture(app,actor,{...scope,workspaceId:randomUUID()},request('foreign'))).rejects.toThrow('forbidden');
  await owner`UPDATE allura.workspace_grants SET active=false WHERE group_id=${group} AND principal_id=${principal}`;
  try {await expect(capture(app,actor,scope,request('conflict','original'))).rejects.toThrow('forbidden');}
  finally {await owner`UPDATE allura.workspace_grants SET active=true WHERE group_id=${group} AND principal_id=${principal}`;}
  expect((await owner`SELECT count(*)::int AS n FROM allura.events WHERE group_id=${group}`)[0].n).toBe(before[0].n);
});

test('operation key is actor scoped and unknown acknowledgement reconciles',async()=>{
  const original=await capture(app,actor,scope,request('lost-response'));
  // Discarded transport response: reconcile the same key on a fresh request.
  expect(await capture(app,actor,scope,request('lost-response'))).toBe(original);
  const second=await capture(app,other,scope,request('lost-response'));
  expect(JSON.parse(second).event_id).not.toBe(JSON.parse(original).event_id);
  await expect(readCaptureReceipt(app,other,scope,JSON.parse(original).receipt_id)).rejects.toThrow('not_found');
  await expect(readCaptureReceipt(app,actor,scope,randomUUID())).rejects.toThrow('not_found');
});

test('capture rollback at every durable boundary and commit leaves no partial set',async()=>{
  for(const table of ['events','capture_receipts','capture_replay','index_intents']) {
    const before=(await owner`SELECT count(*)::int AS n FROM allura.events WHERE group_id=${group}`)[0].n;
    await owner.unsafe(`CREATE FUNCTION allura.capture_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected failure'; END $$; CREATE TRIGGER capture_failure BEFORE INSERT ON allura.${table} FOR EACH ROW EXECUTE FUNCTION allura.capture_fail()`);
    try {await expect(capture(app,actor,scope,request(`fail-${table}`))).rejects.toThrow();}
    finally {await owner.unsafe(`DROP TRIGGER capture_failure ON allura.${table}; DROP FUNCTION allura.capture_fail()`);}
    expect((await owner`SELECT count(*)::int AS n FROM allura.events WHERE group_id=${group}`)[0].n).toBe(before);
    expect(await owner`SELECT * FROM allura.capture_replay WHERE group_id=${group} AND operation_key=${`fail-${table}`}`).toHaveLength(0);
  }
  await owner.unsafe("CREATE FUNCTION allura.capture_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected commit failure'; END $$; CREATE CONSTRAINT TRIGGER capture_failure AFTER INSERT ON allura.index_intents DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION allura.capture_fail()");
  try {await expect(capture(app,actor,scope,request('fail-commit'))).rejects.toThrow();}
  finally {await owner.unsafe('DROP TRIGGER capture_failure ON allura.index_intents; DROP FUNCTION allura.capture_fail()');}
  expect(await owner`SELECT * FROM allura.capture_replay WHERE group_id=${group} AND operation_key='fail-commit'`).toHaveLength(0);
});

test('terminated capture connection rolls back and same key safely retries',async()=>{
  await owner.unsafe('CREATE FUNCTION allura.capture_pause() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(3); RETURN NEW; END $$; CREATE TRIGGER capture_pause BEFORE INSERT ON allura.capture_receipts FOR EACH ROW EXECUTE FUNCTION allura.capture_pause()');
  const pending=capture(app,actor,scope,request('terminated')).then(value=>({value,error:''}),error=>({value:'',error:String(error)}));
  let terminated=false;
  try {
    for(let attempt=0;attempt<100;attempt++) {
      const rows=await owner`SELECT pid FROM pg_stat_activity WHERE usename='allura_app' AND state='active' AND wait_event='PgSleep' AND query LIKE '%INSERT INTO allura.capture_receipts%'`;
      if(rows.length===1) { const [result]=await owner`SELECT pg_terminate_backend(${rows[0].pid}) AS stopped`;terminated=result.stopped as boolean;break; }
      await Bun.sleep(10);
    }
    expect(terminated).toBe(true);expect((await pending).error).toContain('unknown');
  } finally {await pending;await owner.unsafe('DROP TRIGGER capture_pause ON allura.capture_receipts; DROP FUNCTION allura.capture_pause()');}
  expect(await owner`SELECT * FROM allura.capture_replay WHERE group_id=${group} AND operation_key='terminated'`).toHaveLength(0);
  const receipt=await capture(app,actor,scope,request('terminated'));
  expect(await capture(app,actor,scope,request('terminated'))).toBe(receipt);
});

test('capture artifacts are immutable restricted and independent of providers',async()=>{
  const receipt=JSON.parse(await capture(app,actor,scope,request('no-provider')));
  // No provider or worker is configured or invoked by the capture service.
  expect(receipt.indexing).toBe('pending');expect(receipt.proposal).toBe('not_generated');
  for(const table of ['capture_receipts','capture_replay','index_intents']) {
    expect(await app.unsafe(`SELECT * FROM allura.${table}`)).toHaveLength(0);
    await expect(owner.unsafe(`DELETE FROM allura.${table} WHERE group_id=$1 AND event_id=$2`,[group,receipt.event_id]).execute()).rejects.toThrow('append-only');
    await expect(owner.unsafe(`TRUNCATE allura.${table} CASCADE`).execute()).rejects.toThrow('append-only');
  }
});
