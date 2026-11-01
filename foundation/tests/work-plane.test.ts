import { test, expect } from 'bun:test';
import { SQL } from 'bun';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { authenticateMachine } from '../src/authentication.ts';
import { DatabaseStore } from '../src/persistence.ts';
import { transitionWorkItem, readWorkItem } from '../src/work-plane.ts';
import { parseWorkTransition } from '../src/work-plane-contract.ts';
import { fixture } from './lifecycle-fixture.ts';
import { scopedTransaction } from '../src/persistence.ts';

const item = 'Legacy:Work/é.A', project = 'Project:Alpha', token = '2026-01-02T03:04:05.123456Z';
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function seed(f: Fixture) {
  await f.owner`INSERT INTO allura.work_authority(singleton,id) VALUES(true,'synthetic-owner') ON CONFLICT DO NOTHING`;
  await f.owner`INSERT INTO allura.work_projects(group_id,workspace_id,id,authority_instance_id) VALUES(${f.scope.groupId},${f.scope.workspaceId},${project},'synthetic-owner')`;
  for (const name of ['author','reviewer'] as const) {
    for (const action of ['work:read','work:write']) {
      await f.owner`INSERT INTO allura.work_entitlements(group_id,workspace_id,principal_id,action) VALUES(${f.scope.groupId},${f.scope.workspaceId},${f.ids[name]},${action})`;
    }
  }
  await f.owner`INSERT INTO allura.work_items(group_id,workspace_id,project_id,id,title,status,created_at,updated_at) VALUES(${f.scope.groupId},${f.scope.workspaceId},${project},${item},'Synthetic private work','ready',${token}::timestamptz,${token}::timestamptz)`;
}
function command(f: Fixture, overrides: Record<string, unknown> = {}) {
  return { contract:'work-plane-compatibility-v1', command:'transition', group_id:f.scope.groupId, workspace_id:f.scope.workspaceId, actor_id:f.ids.author, operation_key:'first', expected_updated_at:token, to_status:'in_progress', ...overrides };
}

test('work plane ready transition commits one exact event receipt and microsecond token', async () => {
  const f = await fixture('allura-work-plane-positive');
  try {
    // Prove real canonical migration, authenticated fixture and restricted runtime
    // before the explicit baseline feature-absence assertion (not an import error).
    expect((await f.app`SELECT current_user AS role`)[0].role).toBe('allura_app');
    await scopedTransaction(f.app, f.identities.author, f.scope, 'memory:read', async tx => {
      expect((await tx`SELECT allura.context_allows(${f.scope.groupId},${f.scope.workspaceId}::uuid,'memory:read') AS allowed`)[0].allowed).toBe(true);
    });
    expect(await Bun.file(new URL('../src/work-plane.ts', import.meta.url)).exists(), 'baseline feature absence: guarded work-plane transition service is not implemented').toBe(true);
    const { transitionWorkItem, readWorkItem } = await import('../src/work-plane.ts');
    await seed(f);
    const input = command(f);
    const raw = await transitionWorkItem(f.app, f.identities.author, f.scope, item, input);
    const response = JSON.parse(raw), receipt = response.operation_receipt;
    expect(response.work_item.status).toBe('in_progress');
    expect(response.work_item.id).toBe(item);
    expect(receipt.before_updated_at).toBe(token);
    expect(receipt.after_updated_at > token).toBe(true);
    expect(receipt.after_updated_at).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/);
    expect(receipt.after_updated_at).toBe(response.work_item.updated_at);
    expect(receipt.actor_id).toBe(f.ids.author);
    expect(receipt.outcome).toBe('committed');
    expect(await transitionWorkItem(f.app, f.identities.author, f.scope, item, input)).toBe(raw);
    expect(JSON.parse(await readWorkItem(f.app, f.identities.author, f.scope, item))).toEqual({ work_item: response.work_item });
    expect((await f.owner`SELECT count(*)::int AS n FROM allura.work_events`)[0].n).toBe(1);
    expect((await f.owner`SELECT count(*)::int AS n FROM allura.work_receipts`)[0].n).toBe(1);
  } finally { await f.close(); }
});

async function setup() { const f=await fixture(`allura-work-${randomUUID()}`); await seed(f); return f; }

function latch() { let release!:()=>void;const promise=new Promise<void>(r=>{release=r;});return {promise,release}; }
async function waitFor(f:Fixture,waiter:number,blocker:number) {
  const end=Date.now()+1500;
  while(Date.now()<end){
    const [row]=await f.owner`SELECT ${blocker}::int=ANY(pg_blocking_pids(${waiter}::int)) AS waiting`;
    if(row.waiting){expect(waiter).not.toBe(blocker);console.log(JSON.stringify({work_lock_wait:{waiter,blocker}}));return;}
    await Bun.sleep(5);
  }
  throw new Error('attributable work lock wait absent');
}

test('work plane faults at every state event receipt and deferred boundary roll back exact history',async()=>{
  const f=await setup();
  try{
    const before=await snapshot(f);
    await f.owner.unsafe(`CREATE FUNCTION allura.work_fixture_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic private fault'; END $$`);
    for(const [table,action] of [['work_items','UPDATE'],['work_events','INSERT'],['work_receipts','INSERT']]){
      for(const timing of ['BEFORE','AFTER']){
        await f.owner.unsafe(`CREATE TRIGGER work_fixture_fault ${timing} ${action} ON allura.${table} FOR EACH ROW EXECUTE FUNCTION allura.work_fixture_fault()`);
        try{await denied(transitionWorkItem(f.app,f.identities.author,f.scope,item,command(f)),'failed');expect(await snapshot(f)).toBe(before);}
        finally{await f.owner.unsafe(`DROP TRIGGER work_fixture_fault ON allura.${table}`);}
      }
    }
    await f.owner.unsafe('CREATE CONSTRAINT TRIGGER work_fixture_fault AFTER INSERT ON allura.work_receipts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION allura.work_fixture_fault()');
    try{await denied(transitionWorkItem(f.app,f.identities.author,f.scope,item,command(f)),'failed');expect(await snapshot(f)).toBe(before);}
    finally{await f.owner.unsafe('DROP TRIGGER work_fixture_fault ON allura.work_receipts');}
    // Silent event loss must also be fatal: this exercises the real atomic FK
    // guard, rather than merely proving that an explicit RAISE rolls back.
    await f.owner.unsafe(`CREATE OR REPLACE FUNCTION allura.work_fixture_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$`);
    await f.owner.unsafe('CREATE TRIGGER work_fixture_fault BEFORE INSERT ON allura.work_events FOR EACH ROW EXECUTE FUNCTION allura.work_fixture_fault()');
    try{await denied(transitionWorkItem(f.app,f.identities.author,f.scope,item,command(f)),'failed');expect(await snapshot(f)).toBe(before);}
    finally{await f.owner.unsafe('DROP TRIGGER work_fixture_fault ON allura.work_events');}
  }finally{await f.owner.unsafe('DROP FUNCTION IF EXISTS allura.work_fixture_fault()');await f.close();}
});

test('work plane current authority and entitlement revocation serialize in both attributable database orders',async()=>{
  const mutations=[
    ['principals','active=false','active=true','id'],
    ['identity_bindings','active=false','active=true','principal_id'],
    ['tenants','active=false','active=true','group_id'],
    ['memberships','active=false','active=true','principal_id'],
    ['workspaces','locked=true','locked=false','id'],
    ['workspace_grants','active=false','active=true','principal_id'],
    ['work_entitlements',"active=false","active=true",'principal_id'],
  ];
  const f=await setup();
  try{
    for(const [table,disable,enable,column] of mutations){
      const selector=column==='group_id'?f.scope.groupId:table==='workspaces'?f.scope.workspaceId:f.ids.author;
      const where=`${column}='${selector}'`;
      // Revoke first, then observe the actual service blocked on that revoker.
      const revoker=new SQL(process.env.ALLURA_DISPOSABLE_DB_URL!,{max:1}),app=new SQL(f.appUrl,{max:1});
      const held=latch(),go=latch();let revocation:Promise<unknown>|undefined;let operation:Promise<unknown>|undefined;
      try{
        const rp=Number((await revoker`SELECT pg_backend_pid() AS pid`)[0].pid),ap=Number((await app`SELECT pg_backend_pid() AS pid`)[0].pid);
        revocation=revoker.begin(async tx=>{await tx.unsafe(`UPDATE allura.${table} SET ${disable} WHERE ${where}`);held.release();await go.promise;});
        await held.promise;
        operation=transitionWorkItem(app,f.identities.author,f.scope,item,command(f)).then(v=>({value:v}),e=>({error:e}));
        await waitFor(f,ap,rp);go.release();await revocation;
        expect((await operation as {error:{code:string}}).error.code).toBe('forbidden');
        await denied(readWorkItem(app,f.identities.author,f.scope,item),'forbidden');
        expect((await f.owner`SELECT count(*)::int AS n FROM allura.work_receipts WHERE group_id=${f.scope.groupId}`)[0].n).toBe(0);
      }finally{go.release();await revocation;await operation;await app.close();await revoker.close();await f.owner.unsafe(`UPDATE allura.${table} SET ${enable} WHERE ${where}`);}
    }
    // Operation-first order: hold the service AFTER it has authority locks using
    // an owned advisory trigger. Each revoker must wait on that exact service PID.
    for(const [table,disable,enable,column] of mutations){
      const selector=column==='group_id'?f.scope.groupId:table==='workspaces'?f.scope.workspaceId:f.ids.author,where=`${column}='${selector}'`;
      const gate=new SQL(process.env.ALLURA_DISPOSABLE_DB_URL!,{max:1}),revoker=new SQL(process.env.ALLURA_DISPOSABLE_DB_URL!,{max:1}),app=new SQL(f.appUrl,{max:1});
      const held=latch(),go=latch();let barrier:Promise<unknown>|undefined,operation:Promise<{value?:string;error?:{code:string}}>|undefined,revocation:Promise<unknown>|undefined;
      try{
        const gp=Number((await gate`SELECT pg_backend_pid() AS pid`)[0].pid),rp=Number((await revoker`SELECT pg_backend_pid() AS pid`)[0].pid),ap=Number((await app`SELECT pg_backend_pid() AS pid`)[0].pid);
        await f.owner.unsafe(`CREATE FUNCTION allura.work_fixture_wait() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(131302); RETURN NEW; END $$; CREATE TRIGGER work_fixture_wait BEFORE UPDATE ON allura.work_items FOR EACH ROW EXECUTE FUNCTION allura.work_fixture_wait()`);
        barrier=gate.begin(async tx=>{await tx`SELECT pg_advisory_xact_lock(131302)`;held.release();await go.promise;});await held.promise;
        const current=JSON.parse(await readWorkItem(f.app,f.identities.author,f.scope,item)).work_item;
        operation=transitionWorkItem(app,f.identities.author,f.scope,item,command(f,{operation_key:`order-${table}`,expected_updated_at:current.updated_at,to_status:current.status==='in_progress'?'blocked':'in_progress'})).then(value=>({value}),error=>({error}));
        await waitFor(f,ap,gp);
        revocation=revoker.unsafe(`UPDATE allura.${table} SET ${disable} WHERE ${where}`).then(()=>undefined);
        await waitFor(f,rp,ap);go.release();await barrier;await revocation;
        const result=await operation;
        if(result.error){expect(result.error.code).toBe('forbidden');}else{expect(JSON.parse(result.value!).operation_receipt.outcome).toBe('committed');}
        expect((await f.owner`SELECT count(*)::int AS n FROM allura.work_receipts WHERE group_id=${f.scope.groupId} AND operation_key=${`order-${table}`}`)[0].n).toBe(1);
        await denied(readWorkItem(app,f.identities.author,f.scope,item),'forbidden');
        await denied(transitionWorkItem(app,f.identities.author,f.scope,item,command(f)),'forbidden');
      }finally{go.release();await barrier;await revocation;await operation;await f.owner.unsafe('DROP TRIGGER IF EXISTS work_fixture_wait ON allura.work_items;DROP FUNCTION IF EXISTS allura.work_fixture_wait()');await f.owner.unsafe(`UPDATE allura.${table} SET ${enable} WHERE ${where}`);await gate.close();await revoker.close();await app.close();}
    }
  }finally{await f.close();}
},20000);

test('work plane backend termination is unknown and leaves state event receipt unchanged',async()=>{
  const f=await setup(),gate=new SQL(process.env.ALLURA_DISPOSABLE_DB_URL!,{max:1}),app=new SQL(f.appUrl,{max:1});
  const held=latch(),go=latch();let barrier:Promise<unknown>|undefined,operation:Promise<unknown>|undefined;
  try{
    const before=await snapshot(f),gp=Number((await gate`SELECT pg_backend_pid() AS pid`)[0].pid),ap=Number((await app`SELECT pg_backend_pid() AS pid`)[0].pid);
    await f.owner.unsafe(`CREATE FUNCTION allura.work_fixture_kill() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(131303); RETURN NEW; END $$; CREATE TRIGGER work_fixture_kill AFTER INSERT ON allura.work_events FOR EACH ROW EXECUTE FUNCTION allura.work_fixture_kill()`);
    barrier=gate.begin(async tx=>{await tx`SELECT pg_advisory_xact_lock(131303)`;held.release();await go.promise;});await held.promise;
    operation=transitionWorkItem(app,f.identities.author,f.scope,item,command(f)).then(value=>({value}),error=>({error}));
    await waitFor(f,ap,gp);expect((await f.owner`SELECT pg_terminate_backend(${ap}) AS killed`)[0].killed).toBe(true);
    expect((await operation as {error:{code:string}}).error.code).toBe('unknown');
    go.release();await barrier;expect(await snapshot(f)).toBe(before);
  }finally{go.release();await barrier;await operation;await f.owner.unsafe('DROP TRIGGER IF EXISTS work_fixture_kill ON allura.work_events;DROP FUNCTION IF EXISTS allura.work_fixture_kill()');await app.close();await gate.close();await f.close();}
});
test('work plane finite operation cap permits exact replay and PostgreSQL digest binds canonical bytes',async()=>{
  const f=await setup();
  try{
    const input=command(f,{reason:'é'.repeat(1023)+'\r\n'}),normalized=parseWorkTransition(input);
    const raw=await transitionWorkItem(f.app,f.identities.author,f.scope,item,input),r=JSON.parse(raw).operation_receipt;
    const [expected]=await f.owner`SELECT encode(sha256(convert_to((${normalized}::jsonb-'operation_key'||jsonb_build_object('authority_instance_id','synthetic-owner','work_item_id',${item}::text,'project_id',${project}::text))::text,'UTF8')),'hex') AS digest`;
    expect(r.request_digest).toBe(expected.digest);
    await scopedTransaction(f.app,f.identities.author,f.scope,'memory:read',async tx=>{
      let x=JSON.parse(raw).work_item;
      for(let n=1;n<1024;n++){
        const v=parseWorkTransition(command(f,{operation_key:`cap-${n}`,expected_updated_at:x.updated_at,to_status:x.status==='in_progress'?'blocked':'in_progress'}));
        const [next]=await tx`SELECT allura.transition_work_item(${f.scope.groupId},${f.scope.workspaceId},${item},${v}::jsonb) AS raw`;
        x=JSON.parse(next.raw).work_item;
      }
      await tx.unsafe('SET CONSTRAINTS ALL IMMEDIATE');
    });
    expect((await f.owner`SELECT count(*)::int AS n FROM allura.work_receipts WHERE group_id=${f.scope.groupId}`)[0].n).toBe(1024);
    const before=await snapshot(f),x=JSON.parse(await readWorkItem(f.app,f.identities.author,f.scope,item)).work_item;
    await denied(transitionWorkItem(f.app,f.identities.author,f.scope,item,command(f,{operation_key:'overflow',expected_updated_at:x.updated_at,to_status:x.status==='in_progress'?'blocked':'in_progress'})),'capacity');
    expect(await transitionWorkItem(f.app,f.identities.author,f.scope,item,input)).toBe(raw);expect(await snapshot(f)).toBe(before);
  }finally{await f.close();}
},20000);

test('work plane restricted SQL forced RLS immutable history scoped FK and pool reuse cannot bypass authority',async()=>{
  const f=await setup(),pool=new SQL(f.appUrl,{max:1});
  try{
    const raw=await transitionWorkItem(pool,f.identities.author,f.scope,item,command(f)),r=JSON.parse(raw).operation_receipt;
    const tables=['work_authority','work_entitlements','work_projects','work_items','work_events','work_receipts'];
    for(const table of tables){
      const [flags]=await f.owner`SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=${'allura.'+table}::regclass`;expect(flags).toEqual({relrowsecurity:true,relforcerowsecurity:true});
      for(const sql of [`SELECT * FROM allura.${table}`,`DELETE FROM allura.${table}`,`TRUNCATE allura.${table}`]){await expect(Promise.resolve(pool.unsafe(sql))).rejects.toThrow();}
    }
    await expect(Promise.resolve(pool.unsafe(`INSERT INTO allura.work_projects VALUES('allura-forged','${f.scope.workspaceId}','forged','synthetic-owner',true)`))).rejects.toThrow();
    await expect(Promise.resolve(pool.unsafe(`INSERT INTO allura.work_entitlements VALUES('${f.scope.groupId}','${f.scope.workspaceId}','${f.ids.viewer}','work:read',true)`))).rejects.toThrow();
    await expect(Promise.resolve(pool`SELECT allura.work_snapshot(NULL::allura.work_items)`)).rejects.toThrow();
    for(const table of ['work_events','work_receipts']){
      await expect(Promise.resolve(f.owner.unsafe(`UPDATE allura.${table} SET id=id WHERE group_id='${f.scope.groupId}'`))).rejects.toThrow();
      await expect(Promise.resolve(f.owner.unsafe(`DELETE FROM allura.${table} WHERE group_id='${f.scope.groupId}'`))).rejects.toThrow();
      await expect(Promise.resolve(f.owner.unsafe(`TRUNCATE allura.${table} CASCADE`))).rejects.toThrow();
    }
    expect(r.work_item_id).toBe(item);
    await expect(Promise.resolve(f.owner`INSERT INTO allura.work_items(group_id,workspace_id,project_id,id,title,status,created_at,updated_at) VALUES(${f.scope.groupId},${f.foreignWorkspace},${project},'splice','splice','ready',${token}::timestamptz,${token}::timestamptz)`)).rejects.toThrow();
    await expect(Promise.resolve(f.owner`UPDATE allura.work_projects SET workspace_id=${f.foreignWorkspace} WHERE group_id=${f.scope.groupId}`)).rejects.toThrow();
    await expect(Promise.resolve(f.owner`INSERT INTO allura.work_projects VALUES(${f.scope.groupId},${f.foreignWorkspace},${project},'other-owner',true)`)).rejects.toThrow();
    // A then B then absent context on the very same backend, no cached scope.
    expect(JSON.parse(await readWorkItem(pool,f.identities.author,f.scope,item)).work_item.id).toBe(item);
    await denied(readWorkItem(pool,f.identities.author,{...f.scope,workspaceId:f.foreignWorkspace},item),'forbidden');
    await expect(Promise.resolve(pool`SELECT allura.read_work_item(${f.scope.groupId},${f.scope.workspaceId},${item})`)).rejects.toThrow('forbidden');
    expect((await pool`SELECT nullif(current_setting('allura.principal',true),'') AS principal`)[0].principal).toBeNull();
    await f.owner`UPDATE allura.work_entitlements SET active=false WHERE group_id=${f.scope.groupId} AND action='work:write'`;
    await denied(transitionWorkItem(pool,f.identities.author,f.scope,item,command(f)),'forbidden');
    expect(JSON.parse(await readWorkItem(pool,f.identities.author,f.scope,item)).work_item.status).toBe('in_progress');
  }finally{await pool.close();await f.close();}
});

test('work plane unsupported foreign mapping and DTO storage bounds preserve semantic run and foreign snapshots',async()=>{
  const f=await setup();
  try{
    const unrelated=async()=>{
      const result:Record<string,string>={};
      for(const t of ['events','semantic_versions','semantic_heads','decision_receipts','run_records','run_state','run_journal','run_operation_receipts']){result[t]=(await f.owner.unsafe(`SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text),'[]')::text AS raw FROM allura.${t} x`))[0].raw;}
      return result;
    };
    const before=await unrelated();
    await f.owner`INSERT INTO allura.work_projects VALUES(${f.scope.groupId},${f.scope.workspaceId},'foreign-project','foreign-owner',true)`;
    await f.owner`INSERT INTO allura.work_items(group_id,workspace_id,project_id,id,title,status,created_at,updated_at) VALUES(${f.scope.groupId},${f.scope.workspaceId},'foreign-project','foreign-item','private foreign','ready',${token}::timestamptz,${token}::timestamptz)`;
    const foreign=(await f.owner`SELECT to_jsonb(x)::text AS raw FROM allura.work_items x WHERE group_id=${f.scope.groupId} AND id='foreign-item'`)[0].raw;
    await denied(readWorkItem(f.app,f.identities.author,f.scope,'foreign-item'),'not_found');
    await denied(transitionWorkItem(f.app,f.identities.author,f.scope,'foreign-item',command(f)),'not_found');
    await f.owner`UPDATE allura.work_items SET title=${'é'.repeat(256)},description=${'é'.repeat(4096)},acceptance_criteria=${Array(32).fill('x')}::jsonb WHERE group_id=${f.scope.groupId} AND id=${item}`;
    for(const [column,value] of [['title','é'.repeat(257)],['description','é'.repeat(4097)],['acceptance_criteria',JSON.stringify(Array(33).fill('x'))],['acceptance_criteria',JSON.stringify([[[[[[[[['too deep']]]]]]]]])]]){
      const error=await f.owner.unsafe(`UPDATE allura.work_items SET ${column}=$1${column==='acceptance_criteria'?'::jsonb':''} WHERE group_id=$2 AND id=$3`,[column==='acceptance_criteria'?JSON.parse(value!):value!,f.scope.groupId,item]).then(()=>null,e=>e);
      expect(error?.errno).toBe('23514');
    }
    const raw=await transitionWorkItem(f.app,f.identities.author,f.scope,item,command(f));
    expect(JSON.parse(raw).work_item.title).toBe('é'.repeat(256));
    expect(await unrelated()).toEqual(before);
    expect((await f.owner`SELECT to_jsonb(x)::text AS raw FROM allura.work_items x WHERE group_id=${f.scope.groupId} AND id='foreign-item'`)[0].raw).toBe(foreign);
  }finally{await f.close();}
});

test('work plane device worker owner linked and selected authenticated clients cannot inherit work entitlements',async()=>{
  const f=await setup();
  try{
    const before=await snapshot(f);
    for(const mode of ['device','worker','owner','selected'] as const){
      const principal=randomUUID(),connection=randomUUID(),secret=randomBytes(32).toString('base64url'),digest=createHash('sha256').update(secret).digest('hex');
      await f.owner`INSERT INTO allura.principals(id,kind) VALUES(${principal},${mode==='device'||mode==='worker'?mode:'service'})`;
      await f.owner`INSERT INTO allura.memberships(group_id,principal_id) VALUES(${f.scope.groupId},${principal})`;
      await f.owner`INSERT INTO allura.workspace_grants(group_id,workspace_id,principal_id,role,issuer) VALUES(${f.scope.groupId},${f.scope.workspaceId},${principal},'viewer',${f.ids.author})`;
      for(const action of ['work:read','work:write']){await f.owner`INSERT INTO allura.work_entitlements VALUES(${f.scope.groupId},${f.scope.workspaceId},${principal},${action},true)`;}
      if(mode==='owner'){
        await f.owner`INSERT INTO allura.client_delegations(id,client_id,group_id,workspace_id,owner_id,owner_issuer,owner_subject,actions) VALUES(${connection},${principal},${f.scope.groupId},${f.scope.workspaceId},${f.ids.author},${f.humanConfig.issuer},${f.scope.groupId+':author'},ARRAY['memory:read'])`;
      }
      if(mode==='selected'){
        await f.owner`INSERT INTO allura.selected_connections(id,group_id,workspace_id,recipient_id,recipient_issuer,recipient_subject,client_id,resource,principal_id) VALUES(${connection},${f.scope.groupId},${f.scope.workspaceId},${f.ids.author},${f.humanConfig.issuer},${f.scope.groupId+':author'},'synthetic','https://work.invalid/mcp',${principal})`;
        await f.owner`INSERT INTO allura.selected_credentials(digest,connection_id,principal_id,group_id,workspace_id,client_id,resource,expires_at) VALUES(${digest},${connection},${principal},${f.scope.groupId},${f.scope.workspaceId},'synthetic','https://work.invalid/mcp',clock_timestamp()+interval '1 hour')`;
      }else{
        await f.owner`INSERT INTO allura.machine_credentials(principal_id,digest,group_id,workspace_id,actions,expires_at,client_bound,client_delegation_id) VALUES(${principal},decode(${digest},'hex'),${f.scope.groupId},${f.scope.workspaceId},ARRAY['memory:read'],clock_timestamp()+interval '1 hour',${mode==='owner'},${mode==='owner'?connection:null}::uuid)`;
      }
      if(mode==='device'){
        const credential=(await f.owner`SELECT id FROM allura.machine_credentials WHERE principal_id=${principal}`)[0].id;
        await f.owner`INSERT INTO allura.device_owners(device_id,group_id,workspace_id,owner_id,owner_issuer,owner_subject,current_credential_id) VALUES(${principal},${f.scope.groupId},${f.scope.workspaceId},${f.ids.author},${f.humanConfig.issuer},${f.scope.groupId+':author'},${credential})`;
      }
      const identity=await authenticateMachine(secret,async d=>mode==='selected'?(await f.app`SELECT allura.selected_lookup(${d},'https://work.invalid/mcp') AS c`)[0].c:new DatabaseStore(f.app).lookupMachine(d));
      await denied(readWorkItem(f.app,identity,f.scope,item),'forbidden');await denied(transitionWorkItem(f.app,identity,f.scope,item,command(f,{actor_id:principal})),'forbidden');
      if(mode!=='selected'){
        const error=await scopedTransaction(f.app,identity,f.scope,'memory:read',async tx=>{await tx`SELECT allura.work_guard(${f.scope.groupId},${f.scope.workspaceId},true)`;}).then(()=>null,e=>e);
        expect(error?.message).toBe('forbidden');
      }
    }
    expect(await snapshot(f)).toBe(before);
  }finally{await f.close();}
});

test('work plane fresh process reconciles exact key after committed acknowledgement is withheld',async()=>{
  const f=await setup();
  const prefix=`import {SQL} from 'bun';import {createPublicKey} from 'node:crypto';import {authenticateHuman} from './src/authentication.ts';import {transitionWorkItem} from './src/work-plane.ts';const p=JSON.parse(process.env.WORK_FIXTURE);const db=new SQL(p.url,{max:1});try{const identity=authenticateHuman({assertion:p.jwt},{issuer:p.issuer,audience:'fixture',keys:new Map([['key',createPublicKey(p.key)]])});const raw=await transitionWorkItem(db,identity,p.scope,p.item,p.input);`;
  const payload={url:f.appUrl,jwt:f.jwt('author'),issuer:f.humanConfig.issuer,key:f.humanConfig.keys.get('key')!.export({type:'spki',format:'pem'}),scope:f.scope,item,input:command(f)};
  const env={...process.env,WORK_FIXTURE:JSON.stringify(payload)};
  let child:ReturnType<typeof Bun.spawn>|undefined;
  try{
    child=Bun.spawn([process.execPath,'-e',prefix+`console.log('committed-withheld');await Bun.sleep(20000);}finally{await db.close();}`],{env,stdout:'pipe',stderr:'pipe'});
    const reader=(child.stdout as ReadableStream<Uint8Array>).getReader();
    const first=await reader.read();expect(new TextDecoder().decode(first.value)).toBe('committed-withheld\n');reader.releaseLock();
    child.kill('SIGKILL');await child.exited;
    const before=await snapshot(f),stored=(await f.owner`SELECT response_text FROM allura.work_receipts WHERE group_id=${f.scope.groupId}`)[0].response_text;
    const fresh=Bun.spawn([process.execPath,'-e',prefix+`console.log(raw);}finally{await db.close();}`],{env,stdout:'pipe',stderr:'pipe'});
    const [output,errors,exit]=await Promise.all([new Response(fresh.stdout).text(),new Response(fresh.stderr).text(),fresh.exited]);
    expect(exit).toBe(0);expect(errors).toBe('');expect(output.trim()).toBe(stored);expect(await snapshot(f)).toBe(before);
  }finally{if(child && child.exitCode===null){child.kill('SIGKILL');await child.exited;}await f.close();}
},20000);

test('work plane retained project and item caps reject owner fixture overflow without deleting history',async()=>{
  const f=await setup();
  try{
    await f.owner`INSERT INTO allura.work_projects(group_id,workspace_id,id,authority_instance_id) SELECT ${f.scope.groupId},${f.scope.workspaceId}::uuid,'project-'||n,'synthetic-owner' FROM generate_series(1,63) n`;
    const projectError=await f.owner`INSERT INTO allura.work_projects VALUES(${f.scope.groupId},${f.scope.workspaceId},'overflow','synthetic-owner',true)`.then(()=>null,e=>e);expect(projectError?.message).toBe('capacity');
    await f.owner`INSERT INTO allura.work_items(group_id,workspace_id,project_id,id,title,status,created_at,updated_at) SELECT ${f.scope.groupId},${f.scope.workspaceId}::uuid,${project},'item-'||n,'Synthetic','ready',${token}::timestamptz,${token}::timestamptz FROM generate_series(1,255) n`;
    const itemError=await f.owner`INSERT INTO allura.work_items(group_id,workspace_id,project_id,id,title,status,created_at,updated_at) VALUES(${f.scope.groupId},${f.scope.workspaceId},${project},'overflow','Synthetic','ready',${token}::timestamptz,${token}::timestamptz)`.then(()=>null,e=>e);expect(itemError?.message).toBe('capacity');
    const raw=await transitionWorkItem(f.app,f.identities.author,f.scope,item,command(f));expect(JSON.parse(raw).work_item.status).toBe('in_progress');
    expect((await f.owner`SELECT count(*)::int AS n FROM allura.work_items WHERE group_id=${f.scope.groupId}`)[0].n).toBe(256);
  }finally{await f.close();}
});

test('work plane concurrent fresh exact keys accept one event and replay original bytes',async()=>{
  const f=await setup(),a=new SQL(f.appUrl,{max:1}),b=new SQL(f.appUrl,{max:1});
  try{
    const values=await Promise.all([transitionWorkItem(a,f.identities.author,f.scope,item,command(f)),transitionWorkItem(b,f.identities.author,f.scope,item,command(f))]);
    expect(values[0]).toBe(values[1]);
    expect((await f.owner`SELECT count(*)::int AS n FROM allura.work_events WHERE group_id=${f.scope.groupId}`)[0].n).toBe(1);
    expect((await f.owner`SELECT count(*)::int AS n FROM allura.work_receipts WHERE group_id=${f.scope.groupId}`)[0].n).toBe(1);
  }finally{await a.close();await b.close();await f.close();}
});

async function snapshot(f:Fixture) {
  const [row]=await f.owner`SELECT jsonb_build_object('items',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM allura.work_items x WHERE group_id=${f.scope.groupId}),'events',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM allura.work_events x WHERE group_id=${f.scope.groupId}),'receipts',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM allura.work_receipts x WHERE group_id=${f.scope.groupId}))::text AS value`;
  return row.value as string;
}
async function denied(work:Promise<unknown>,code:string) {
  const error=await work.then(()=>null,e=>e);
  expect(error).not.toBeNull();expect(error?.message).toBe(code);expect(error?.code).toBe(code);
  expect(String(error)).not.toContain('Synthetic');expect(String(error)).not.toContain(item);
}

test('work plane explicit entitlement actor mapping and nonhuman denials disclose no private state',async()=>{
  const f=await setup();
  try {
    const before=await snapshot(f);
    for(const name of ['viewer','curator','org','machine'] as const){
      await denied(readWorkItem(f.app,f.identities[name],f.scope,item),'forbidden');
      await denied(transitionWorkItem(f.app,f.identities[name],f.scope,item,command(f,{actor_id:f.ids[name]})),'forbidden');
    }
    await denied(transitionWorkItem(f.app,f.identities.author,f.scope,item,command(f,{actor_id:f.ids.reviewer})),'forbidden');
    await denied(readWorkItem(f.app,f.identities.author,f.scope,'absent'),'not_found');
    await denied(readWorkItem(f.app,f.identities.author,{...f.scope,workspaceId:f.foreignWorkspace},item),'forbidden');
    await f.owner`UPDATE allura.work_projects SET active=false WHERE group_id=${f.scope.groupId}`;
    await denied(readWorkItem(f.app,f.identities.author,f.scope,item),'not_found');
    await denied(transitionWorkItem(f.app,f.identities.author,f.scope,item,command(f)),'not_found');
    expect(await snapshot(f)).toBe(before);
  }finally{await f.close();}
});

test('work plane same token concurrency exact shared key replay and current read stay distinct',async()=>{
  const f=await setup(),a=new SQL(f.appUrl,{max:1}),b=new SQL(f.appUrl,{max:1});
  try {
    const results=await Promise.allSettled([
      transitionWorkItem(a,f.identities.author,f.scope,item,command(f)),
      transitionWorkItem(b,f.identities.reviewer,f.scope,item,command(f,{operation_key:'second',actor_id:f.ids.reviewer,to_status:'backlog'}))
    ]);
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    expect(results.filter(r=>r.status==='rejected').map(r=>(r as PromiseRejectedResult).reason.code)).toEqual(['conflict']);
    const winner=results[0]!.status==='fulfilled'?0:1,identity=winner===0?f.identities.author:f.identities.reviewer;
    const original=winner===0?command(f):command(f,{operation_key:'second',actor_id:f.ids.reviewer,to_status:'backlog'});
    const raw=(results[winner] as PromiseFulfilledResult<string>).value;
    expect(await Promise.all([transitionWorkItem(a,identity,f.scope,item,original),transitionWorkItem(b,identity,f.scope,item,original)])).toEqual([raw,raw]);
    const accepted=JSON.parse(raw).work_item;
    const next=await transitionWorkItem(a,identity,f.scope,item,{...original,operation_key:'later',expected_updated_at:accepted.updated_at,to_status:winner===0?'blocked':'ready'});
    expect(await transitionWorkItem(b,identity,f.scope,item,original)).toBe(raw);
    expect(JSON.parse(await readWorkItem(a,identity,f.scope,item)).work_item).toEqual(JSON.parse(next).work_item);
    for(const changed of [{reason:'private different'},{to_status:'cancelled'},{expected_updated_at:'2026-01-02T03:04:05.123457Z'}]){
      await denied(transitionWorkItem(a,identity,f.scope,item,{...original,...changed}),'conflict');
    }
    // Unsupported literal rejection is NOT serialization of two implemented APIs.
    await denied(transitionWorkItem(a,identity,f.scope,item,{...original,command:'create'}),'invalid');
    expect((await f.owner`SELECT count(*)::int AS n FROM allura.work_receipts WHERE group_id=${f.scope.groupId}`)[0].n).toBe(2);
  }finally{await a.close();await b.close();await f.close();}
});

test('work plane invalid graph stale microseconds terminal reopen and unsupported evidence are unchanged',async()=>{
  const f=await setup();
  try{
    const before=await snapshot(f);
    for(const v of [{to_status:'ready'},{to_status:'done'},{evidence_id:'private-reference'},{expected_updated_at:'2026-01-02T03:04:05.123Z'},{expected_updated_at:'2026-02-30T03:04:05.123456Z'}]){
      await denied(transitionWorkItem(f.app,f.identities.author,f.scope,item,command(f,v)),'invalid');
    }
    await denied(transitionWorkItem(f.app,f.identities.author,f.scope,item,command(f,{expected_updated_at:'2026-01-02T03:04:05.123457Z',to_status:'done'})),'conflict');
    expect(await snapshot(f)).toBe(before);
    const raw=await transitionWorkItem(f.app,f.identities.author,f.scope,item,command(f,{to_status:'cancelled'}));
    const x=JSON.parse(raw).work_item;expect(x.completed_at).toBe(x.updated_at);
    await denied(transitionWorkItem(f.app,f.identities.author,f.scope,item,command(f,{operation_key:'reopen',expected_updated_at:x.updated_at})),'invalid');
    expect(await transitionWorkItem(f.app,f.identities.author,f.scope,item,command(f,{to_status:'cancelled'}))).toBe(raw);
  }finally{await f.close();}
});

test('work plane microseconds advance in one transaction through regressed clocks and overflow fails closed',async()=>{
  const f=await setup();
  try{
    await f.owner`UPDATE allura.work_items SET updated_at='9998-01-02T03:04:05.123456Z' WHERE group_id=${f.scope.groupId}`;
    await scopedTransaction(f.app,f.identities.author,f.scope,'memory:read',async tx=>{
      const first=parseWorkTransition(command(f,{expected_updated_at:'9998-01-02T03:04:05.123456Z'}));
      const [one]=await tx`SELECT allura.transition_work_item(${f.scope.groupId},${f.scope.workspaceId},${item},${first}::jsonb) AS raw`;
      const x=JSON.parse(one.raw).work_item;expect(x.updated_at).toBe('9998-01-02T03:04:05.123457Z');
      const second=parseWorkTransition(command(f,{operation_key:'clock-two',expected_updated_at:x.updated_at,to_status:'blocked'}));
      const [two]=await tx`SELECT allura.transition_work_item(${f.scope.groupId},${f.scope.workspaceId},${item},${second}::jsonb) AS raw`;
      expect(JSON.parse(two.raw).work_item.updated_at).toBe('9998-01-02T03:04:05.123458Z');
      await tx.unsafe('SET CONSTRAINTS ALL IMMEDIATE');
    });
    await f.owner`UPDATE allura.work_items SET updated_at='9999-12-31T23:59:59.999999Z' WHERE group_id=${f.scope.groupId}`;
    const before=await snapshot(f);
    await denied(transitionWorkItem(f.app,f.identities.author,f.scope,item,command(f,{operation_key:'overflow',expected_updated_at:'9999-12-31T23:59:59.999999Z'})),'capacity');
    expect(await snapshot(f)).toBe(before);
  }finally{await f.close();}
});
