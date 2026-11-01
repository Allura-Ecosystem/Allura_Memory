import {test,expect} from 'bun:test';
import { randomUUID,randomBytes,generateKeyPairSync,sign,createHash } from 'node:crypto';
import {authenticateHuman,authenticateMachine} from '../src/authentication.ts';
import {SQL} from 'bun';
import {mkdtemp,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createWorkItem} from '../src/work-plane.ts';
import {parseWorkCreate} from '../src/work-plane-contract.ts';
import {createWorkRoutes} from '../src/work-plane-api.ts';
import {createGateway} from '../src/gateway.ts';
import {DatabaseStore,scopedTransaction,migrate} from '../src/persistence.ts';

import {fixture} from './lifecycle-fixture.ts';
import {createCoreGateway} from '../src/core-api.ts';
import {EMBEDDING} from '../src/embedding.ts';
const origin='https://work.invalid',project=' Empty:opaque+é ',token='2026-01-02T03:04:05.123456Z';
const key=new Uint8Array(32).fill(7),provider={identity:EMBEDDING,embed:async():Promise<number[]>=>{throw new Error('work must not embed');}};
type Fixture=Awaited<ReturnType<typeof fixture>>;
async function setup(){
 const setupStarted=performance.now();
 const f=await fixture('allura-work-create-'+randomUUID());
 await f.owner`INSERT INTO allura.work_authority VALUES(true,'synthetic-owner') ON CONFLICT DO NOTHING`;
 for(const p of [project,'seeded']){await f.owner`INSERT INTO allura.work_projects VALUES(${f.scope.groupId},${f.scope.workspaceId},${p},'synthetic-owner',true)`;}
 for(const action of ['work:read','work:write']){await f.owner`INSERT INTO allura.work_entitlements VALUES(${f.scope.groupId},${f.scope.workspaceId},${f.ids.author},${action},true)`;}
 await f.owner`INSERT INTO allura.work_items(group_id,workspace_id,project_id,id,title,status,created_at,updated_at) VALUES(${f.scope.groupId},${f.scope.workspaceId},'seeded','existing','Existing','ready',${token}::timestamptz,${token}::timestamptz)`;
 recordSnapshotPhase({phase:'setup',ms:performance.now()-setupStarted});
 return f;
}
function gateway(f:Fixture){return createCoreGateway(f.app,f.humanConfig,origin,key,provider,undefined,undefined,'human',undefined,'work-plane-compatibility-v1');}
function request(f:Fixture,path='/api/work-items',body:unknown=undefined,who:Parameters<Fixture['jwt']>[0]='author'){
 const query=new URLSearchParams({group_id:f.scope.groupId,workspace_id:f.scope.workspaceId});
 return new Request(`${origin}${path}${path.includes('?')?'&':'?'}${query}`,{method:body===undefined?'GET':'POST',headers:{'Cf-Access-Jwt-Assertion':f.jwt(who),'X-Allura-Work-Contract':'work-plane-compatibility-v1','Content-Type':'application/json',Origin:origin,'Sec-Fetch-Site':'same-origin'},...(body===undefined?{}:{body:JSON.stringify(body)})});
}
function command(f:Fixture){return {group_id:f.scope.groupId,workspace_id:f.scope.workspaceId,operation_key:'create:first',project_id:project,title:' Exact create 🧠 '};}
test('work create signed HTTP returns 201 with one server assigned item event and receipt',async()=>{
 const f=await setup();try{
  const send=gateway(f),role=(await f.app`SELECT current_user AS name,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user`)[0];
  expect(role.name).toBe('allura_app');expect(role.rolsuper).toBe(false);expect(role.rolbypassrls).toBe(false);
  expect((await send(request(f,'/api/dashboard/context'))).status).toBe(200);
  expect((await send(request(f,'/api/dashboard/context',undefined,'org'))).status).toBe(403);
  const empty=await send(request(f,'/api/work-items?'+new URLSearchParams({project_id:project})));expect(empty.status).toBe(200);expect(await empty.json()).toEqual({work_items:[],has_more:false,next_cursor:null});
  const existing=await send(request(f,'/api/work-items/existing'));expect(existing.status).toBe(200);expect((await existing.json() as {work_item:{updated_at:string}}).work_item.updated_at).toBe(token);
  for(const disabled of [createCoreGateway(f.app,f.humanConfig,origin,key,provider),createCoreGateway(f.app,undefined,origin,key,provider,undefined,undefined,'machine-only',undefined,'work-plane-compatibility-v1')]){const req=request(f,'/api/work-items',command(f));expect((await disabled(req)).status).toBe(404);expect(req.bodyUsed).toBe(false);}
  const response=await send(request(f,'/api/work-items',command(f)));
  console.log(JSON.stringify({workCreateFirstStatus:response.status,expected:201,controls:'restricted-role nonsuper nonbypass context200 org403 empty-mapped-list200 existing-get200 exact-microseconds disabled404 machine-only404'}));
  expect(response.status).toBe(201);
  expect(response.headers.get('cache-control')).toBe('no-store');expect(response.headers.get('x-content-type-options')).toBe('nosniff');expect(response.headers.get('content-type')).toBe('application/json');
  const raw=await response.text(),v=JSON.parse(raw),x=v.work_item,r=v.operation_receipt;
  expect(x.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);expect(x.project_id).toBe(project);expect(x.title).toBe(command(f).title);expect(x.status).toBe('backlog');expect(x.priority).toBe('medium');
  for(const k of ['description','owner_id','lane_id','team_id','linked_run_id','blocker','completed_at']){expect(x[k]).toBeNull();}expect(x.acceptance_criteria).toEqual([]);
  expect(x.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/);expect(x.updated_at).toBe(x.created_at);expect(x.latest_receipt_id).toBe(r.receipt_id);
  expect(r).toEqual({contract:'work-plane-compatibility-v1',receipt_id:r.receipt_id,event_id:r.event_id,authority_instance_id:'synthetic-owner',group_id:f.scope.groupId,workspace_id:f.scope.workspaceId,actor_id:f.ids.author,operation_key:command(f).operation_key,command:'create',request_digest:r.request_digest,work_item_id:x.id,project_id:project,before_status:null,after_status:'backlog',before_updated_at:null,after_updated_at:x.updated_at,evidence_refs:[],accepted_at:x.updated_at,outcome:'committed'});
  const receipts=await f.owner`SELECT * FROM allura.work_receipts WHERE group_id=${f.scope.groupId}`;expect(receipts).toHaveLength(1);expect(receipts[0].response_text).toBe(raw);expect(receipts[0].http_status).toBe(201);expect(JSON.parse(receipts[0].receipt_text)).toEqual(r);
  const events=await f.owner`SELECT * FROM allura.work_events WHERE group_id=${f.scope.groupId}`;expect(events).toHaveLength(1);expect(events[0].kind).toBe('work_item_create');expect(events[0].payload).toEqual(r);expect(events[0].receipt_id).toBe(r.receipt_id);expect(events[0].id).toBe(r.event_id);
  expect((await f.owner`SELECT count(*)::int AS n FROM allura.work_items WHERE group_id=${f.scope.groupId} AND project_id=${project}`)[0].n).toBe(1);
  const get=await send(request(f,'/api/work-items/'+x.id));expect(get.status).toBe(200);expect(await get.json()).toEqual({work_item:x});
  const list=await send(request(f,'/api/work-items?'+new URLSearchParams({project_id:project})));expect(list.status).toBe(200);expect(await list.json()).toEqual({work_items:[x],has_more:false,next_cursor:null});
 }finally{await f.close();}
});

// Fixed whole-table observations at the existing quiescent comparison boundaries.
// One statement gives one consistent observation, unlike the former pool waves.
const snapshotTables=['work_items','work_events','work_receipts','events','semantic_versions','run_records','run_state','run_journal'] as const;
type Snapshot={row:string}[][];
function recordSnapshotPhase(...samples:{phase:string;ms:number;tables?:{table:string;rows:number;bytes:number}[]}[]){console.log(JSON.stringify({workSnapshotPhases:{suite:'create',samples}}));}
async function snapshot(f:Fixture):Promise<Snapshot>{
 const started=performance.now();
 const rows=await f.owner.unsafe<{table_index:number;row:string}[]>(snapshotTables.map((table,index)=>`SELECT ${index} AS table_index,to_jsonb(t)::text AS row FROM allura.${table} t`).join(' UNION ALL ')+' ORDER BY table_index,row');
 const fetched=performance.now(),result:Snapshot=snapshotTables.map(()=>[]);
 for(const {table_index,row} of rows){result[table_index]!.push({row});}
 const tables=result.map((rows,index)=>({table:snapshotTables[index]!,rows:rows.length,bytes:rows.reduce((n,{row})=>n+Buffer.byteLength(row),0)}));
 recordSnapshotPhase({phase:'snapshot-fetch',ms:fetched-started},{phase:'snapshot-reconstruct-and-measure',ms:performance.now()-fetched,tables});
 return result;
}
function compareSnapshot(actual:Snapshot,expected:Snapshot){
 const started=performance.now();try{expect(actual).toEqual(expected);}finally{recordSnapshotPhase({phase:'snapshot-compare',ms:performance.now()-started});}
}
async function outcome(response:Response,status:number,code:string){expect(response.status).toBe(status);expect(await response.json()).toEqual({outcome:code});expect(response.headers.get('cache-control')).toBe('no-store');}
async function accepted(f:Fixture,body:unknown=command(f)){const r=await gateway(f)(request(f,'/api/work-items',body));expect(r.status).toBe(201);return await r.text();}
async function transition(f:Fixture,id:string,updated:string,status:string,operation_key:string){return gateway(f)(request(f,'/api/work-items/'+encodeURIComponent(id)+'/transition',{group_id:f.scope.groupId,workspace_id:f.scope.workspaceId,actor_id:f.ids.author,operation_key,expected_updated_at:updated,to_status:status}));}
test('work create exact replay keeps original 201 bytes while current GET and list show later state',async()=>{
 const f=await setup();try{
  const input={...command(f),acceptance_criteria:[{b:1,a:[true,null,'é']},1]},raw=await accepted(f,input),x=JSON.parse(raw).work_item;
  const aliases={acceptance_criteria:[{a:[true,null,'é'],b:1},1],lane_id:null,owner_id:null,description:null,priority:'medium',...command(f)};
  expect(await accepted(f,aliases)).toBe(raw);
  let current=x;for(const status of ['ready','in_progress']){const t=await transition(f,x.id,current.updated_at,status,'move:'+status);expect(t.status).toBe(200);current=(await t.json() as {work_item:typeof x}).work_item;}
  const before=await snapshot(f);expect(await accepted(f,input)).toBe(raw);expect(JSON.parse(raw).work_item.status).toBe('backlog');
  const get=await gateway(f)(request(f,'/api/work-items/'+x.id));expect(get.status).toBe(200);expect(await get.json()).toEqual({work_item:current});
  const list=await gateway(f)(request(f,'/api/work-items?'+new URLSearchParams({project_id:project})));expect(list.status).toBe(200);expect(await list.json()).toEqual({work_items:[current],has_more:false,next_cursor:null});compareSnapshot(await snapshot(f),before);
 }finally{await f.close();}
});
test('work create concurrent same key accepts one item and changed content conflicts',async()=>{
 const f=await setup();try{
  const results=await Promise.all(Array.from({length:8},()=>accepted(f)));expect(new Set(results).size).toBe(1);
  expect((await f.owner`SELECT count(*)::int AS n FROM allura.work_receipts WHERE group_id=${f.scope.groupId}`)[0].n).toBe(1);const before=await snapshot(f);
  for(const change of [{title:'changed'},{description:''},{priority:'high'},{project_id:'seeded'},{acceptance_criteria:[1,2]},{acceptance_criteria:[2,1]}]){await outcome(await gateway(f)(request(f,'/api/work-items',{...command(f),...change})),409,'conflict');compareSnapshot(await snapshot(f),before);}
  const second=JSON.parse(await accepted(f,{...command(f),operation_key:'second'}));expect(second.work_item.id).not.toBe(JSON.parse(results[0]!).work_item.id);
 }finally{await f.close();}
});

function latch(){let release!:()=>void;const promise=new Promise<void>(r=>{release=r;});return {promise,release};}
async function waitFor(f:Fixture,waiter:number,blocker:number,label:string){const end=Date.now()+1500;while(Date.now()<end){if((await f.owner`SELECT ${blocker}::int=ANY(pg_blocking_pids(${waiter}::int)) AS waiting`)[0].waiting){expect(waiter).not.toBe(blocker);console.log(JSON.stringify({workCreateWait:{waiter,blocker,label}}));return;}await Bun.sleep(5);}throw new Error('attributable create wait absent: '+label);}
test('work create and transition share one actor key namespace in both attributable orders',async()=>{
 for(const order of ['create-first','transition-first']){
  const f=await setup(),a=new SQL(f.appUrl,{max:1}),b=new SQL(f.appUrl,{max:1}),gate=new SQL(process.env.ALLURA_DISPOSABLE_DB_URL!,{max:1}),held=latch(),go=latch();let holding:Promise<unknown>|undefined,first:Promise<Response>|undefined,second:Promise<Response>|undefined;
  try{
   const ap=Number((await a`SELECT pg_backend_pid() AS pid`)[0].pid),bp=Number((await b`SELECT pg_backend_pid() AS pid`)[0].pid),gp=Number((await gate`SELECT pg_backend_pid() AS pid`)[0].pid);
   holding=gate.begin(async tx=>{await tx`SELECT pg_advisory_xact_lock(hashtextextended(jsonb_build_array(${f.scope.groupId}::text,${f.scope.workspaceId}::uuid,'work-operations-v1')::text,13002))`;held.release();await go.promise;});await held.promise;
   const create=(app:SQL)=>gateway({...f,app})(request(f,'/api/work-items',command(f))),move=(app:SQL)=>transition({...f,app},'existing',token,'in_progress',command(f).operation_key);
   first=order==='create-first'?create(a):move(a);await waitFor(f,ap,gp,order+' winner waiting');second=order==='create-first'?move(b):create(b);await waitFor(f,bp,ap,order+' loser queued');go.release();await holding;
   const winner=await first;expect(winner.status).toBe(order==='create-first'?201:200);const raw=await winner.text();await outcome(await second,409,'conflict');
   const rows=await f.owner`SELECT response_text,http_status FROM allura.work_receipts WHERE group_id=${f.scope.groupId}`;expect(rows).toHaveLength(1);expect(rows[0].response_text).toBe(raw);expect(rows[0].http_status).toBe(winner.status);
   expect((await f.owner`SELECT status FROM allura.work_items WHERE group_id=${f.scope.groupId} AND id='existing'`)[0].status).toBe(order==='create-first'?'ready':'in_progress');expect((await f.owner`SELECT count(*)::int AS n FROM allura.work_items WHERE group_id=${f.scope.groupId} AND project_id=${project}`)[0].n).toBe(order==='create-first'?1:0);
  }finally{go.release();await holding;await first;await second;await a.close();await b.close();await gate.close();await f.close();}
 }
});
test('work create strict nested criteria selectors defaults and unsupported references fail closed',async()=>{
 const f=await setup();try{
  const send=gateway(f),before=await snapshot(f),raw=JSON.stringify(command(f)),prefix=raw.slice(0,-1)+',"acceptance_criteria":';
  for(const body of [prefix+'[{"a":1,"\\u0061":2}]}',prefix+'[9007199254740993]}',prefix+'[1.0000000000000001]}',prefix+'["\\ud800"]}',raw.slice(0,-1)+',"title":"duplicate"}',raw.slice(0,-1)+',"actor_id":"forged"}']){const req=request(f,'/api/work-items',{});await outcome(await send(new Request(req.url,{method:'POST',headers:req.headers,body})),400,'invalid');}
  for(const change of [{priority:null},{acceptance_criteria:null},{owner_id:''},{lane_id:1},{title:'\n'},{description:'\t'},{status:'backlog'},{project_id:''}]){await outcome(await send(request(f,'/api/work-items',{...command(f),...change})),400,'invalid');}
  for(const change of [{owner_id:'opaque'},{lane_id:'opaque'},{project_id:'missing'}]){await outcome(await send(request(f,'/api/work-items',{...command(f),...change})),404,'not_found');}
  for(const extra of ['&workspace_id=x','&unknown=x','&project_id=x','&group%5fid=x','&x=%GG','&x=%C0%AF']){const req=request(f,'/api/work-items',command(f));await outcome(await send(new Request(req.url+extra,req)),400,'invalid');}
  const bad=request(f,'/api/work-items',command(f));bad.headers.set('X-Allura-Work-Contract','v2');await outcome(await send(bad),400,'invalid');compareSnapshot(await snapshot(f),before);
  const nested=JSON.parse('[{"__proto__":{"a":1},"constructor":2},{"a":1},{"a":2}]');expect(JSON.parse(await accepted(f,{...command(f),acceptance_criteria:nested})).work_item.acceptance_criteria).toEqual(nested);expect(Object.hasOwn(Object.prototype,'a')).toBe(false);
 }finally{await f.close();}
});
test('work create current human entitlements original binding and mixed identity precede body work',async()=>{
 const f=await setup();try{
  let parsed=0,handled=0;const routes=createWorkRoutes(f.app,key).map(r=>({...r,...(r.parseBody?{parseBody:(text:string)=>{parsed++;return r.parseBody!(text);}}:{}),handle:async(c:Parameters<typeof r.handle>[0])=>{handled++;return r.handle(c);}}));
  const send=createGateway({human:f.humanConfig,origin,store:new DatabaseStore(f.app),machineLookup:async()=>null,routes}),before=await snapshot(f);
  for(const who of ['viewer','curator','reviewer','org'] as const){const req=request(f,'/api/work-items',command(f),who);await outcome(await send(req),403,'forbidden');expect(req.bodyUsed).toBe(false);}
  for(const cookie of [false,true]){const req=request(f,'/api/work-items',command(f));if(cookie){req.headers.delete('Cf-Access-Jwt-Assertion');req.headers.set('Cookie','CF_Authorization='+f.jwt('author'));}req.headers.set('Authorization','Bearer synthetic');await outcome(await send(req),401,'unauthenticated');expect(req.bodyUsed).toBe(false);}
  expect(parsed).toBe(0);expect(handled).toBe(0);compareSnapshot(await snapshot(f),before);
  for(const action of ['work:read','work:write']){await f.owner`INSERT INTO allura.work_entitlements VALUES(${f.scope.groupId},${f.scope.workspaceId},${f.ids.viewer},${action},true)`;}
  expect((await send(request(f,'/api/work-items',command(f),'viewer'))).status).toBe(201);
  await expect(createWorkItem(f.app,f.identities.machine,f.scope,{...command(f),contract:'work-plane-compatibility-v1',command:'create',actor_id:f.ids.machine},f.ids.machine)).rejects.toThrow('forbidden');
  await expect(createWorkItem(f.app,f.identities.author,f.scope,{...command(f),contract:'work-plane-compatibility-v1',command:'create',actor_id:f.ids.author},f.ids.reviewer)).rejects.toThrow('forbidden');
  const drift=createWorkRoutes(f.app,key).map(r=>({...r,handle:async(c:Parameters<typeof r.handle>[0])=>{await f.owner`UPDATE allura.identity_bindings SET principal_id=${f.ids.reviewer} WHERE subject=${f.scope.groupId+':author'}`;try{return await r.handle(c);}finally{await f.owner`UPDATE allura.identity_bindings SET principal_id=${f.ids.author} WHERE subject=${f.scope.groupId+':author'}`;}}}));
  await outcome(await createGateway({human:f.humanConfig,origin,store:new DatabaseStore(f.app),machineLookup:async()=>null,routes:drift})(request(f,'/api/work-items',command(f))),403,'forbidden');
 const priorParsed=parsed,priorHandled=handled,machineBefore=await snapshot(f);
  for(const mode of ['device','worker','owner','selected'] as const){
   const principal=randomUUID(),connection=randomUUID(),secret=randomBytes(32).toString('base64url'),digest=createHash('sha256').update(secret).digest('hex');
   await f.owner`INSERT INTO allura.principals(id,kind) VALUES(${principal},${mode==='device'||mode==='worker'?mode:'service'})`;
   await f.owner`INSERT INTO allura.memberships(group_id,principal_id) VALUES(${f.scope.groupId},${principal})`;
   await f.owner`INSERT INTO allura.workspace_grants(group_id,workspace_id,principal_id,role,issuer) VALUES(${f.scope.groupId},${f.scope.workspaceId},${principal},'viewer',${f.ids.author})`;
   await f.owner`INSERT INTO allura.work_entitlements VALUES(${f.scope.groupId},${f.scope.workspaceId},${principal},'work:read',true)`;
   if(mode==='owner'){await f.owner`INSERT INTO allura.client_delegations(id,client_id,group_id,workspace_id,owner_id,owner_issuer,owner_subject,actions) VALUES(${connection},${principal},${f.scope.groupId},${f.scope.workspaceId},${f.ids.author},${f.humanConfig.issuer},${f.scope.groupId+':author'},ARRAY['memory:read'])`;}
   if(mode==='selected'){
    await f.owner`INSERT INTO allura.selected_connections(id,group_id,workspace_id,recipient_id,recipient_issuer,recipient_subject,client_id,resource,principal_id) VALUES(${connection},${f.scope.groupId},${f.scope.workspaceId},${f.ids.author},${f.humanConfig.issuer},${f.scope.groupId+':author'},'synthetic','https://work.invalid/mcp',${principal})`;
    await f.owner`INSERT INTO allura.selected_credentials(digest,connection_id,principal_id,group_id,workspace_id,client_id,resource,expires_at) VALUES(${digest},${connection},${principal},${f.scope.groupId},${f.scope.workspaceId},'synthetic','https://work.invalid/mcp',clock_timestamp()+interval '1 hour')`;
   }else{await f.owner`INSERT INTO allura.machine_credentials(principal_id,digest,group_id,workspace_id,actions,expires_at,client_bound,client_delegation_id) VALUES(${principal},decode(${digest},'hex'),${f.scope.groupId},${f.scope.workspaceId},ARRAY['memory:read'],clock_timestamp()+interval '1 hour',${mode==='owner'},${mode==='owner'?connection:null}::uuid)`;}
   if(mode==='device'){const credential=(await f.owner`SELECT id FROM allura.machine_credentials WHERE principal_id=${principal}`)[0].id;await f.owner`INSERT INTO allura.device_owners(device_id,group_id,workspace_id,owner_id,owner_issuer,owner_subject,current_credential_id) VALUES(${principal},${f.scope.groupId},${f.scope.workspaceId},${f.ids.author},${f.humanConfig.issuer},${f.scope.groupId+':author'},${credential})`;}
   const identity=await authenticateMachine(secret,async d=>mode==='selected'?(await f.app`SELECT allura.selected_lookup(${d},'https://work.invalid/mcp') AS c`)[0].c:new DatabaseStore(f.app).lookupMachine(d));expect(identity.kind).not.toBe('human');
   await expect(createWorkItem(f.app,identity,f.scope,{...command(f),contract:'work-plane-compatibility-v1',command:'create',actor_id:principal},principal)).rejects.toThrow('forbidden');
   const req=request(f,'/api/work-items',command(f));req.headers.delete('Cf-Access-Jwt-Assertion');req.headers.set('Authorization','Bearer '+secret);await outcome(await send(req),401,'unauthenticated');expect(req.bodyUsed).toBe(false);
  }
 expect(parsed).toBe(priorParsed);expect(handled).toBe(priorHandled);compareSnapshot(await snapshot(f),machineBefore);
 }finally{await f.close();}
});
test('work create authority entitlement and mapping revocation serialize in both attributable orders',async()=>{
 const f=await setup();try{
  const targets=[['principals',`id='${f.ids.author}'`,'active'],['identity_bindings',`principal_id='${f.ids.author}'`,'active'],['memberships',`principal_id='${f.ids.author}'`,'active'],['workspace_grants',`principal_id='${f.ids.author}'`,'active'],['work_entitlements',`principal_id='${f.ids.author}'`,'active'],['tenants',`group_id='${f.scope.groupId}'`,'active'],['workspaces',`id='${f.scope.workspaceId}'`,'locked'],['work_projects',`group_id='${f.scope.groupId}'`,'active']];
  for(const [table,where,column] of targets){for(const order of ['revoke-first','create-first']){
   const app=new SQL(f.appUrl,{max:1}),rev=new SQL(process.env.ALLURA_DISPOSABLE_DB_URL!,{max:1}),gate=new SQL(process.env.ALLURA_DISPOSABLE_DB_URL!,{max:1}),held=latch(),go=latch();let holding:Promise<unknown>|undefined,creating:Promise<Response>|undefined,revoking:Promise<unknown>|undefined;
   const disable=`UPDATE allura.${table} SET ${column}=${column==='locked'?'true':'false'} WHERE ${where}`,enable=`UPDATE allura.${table} SET ${column}=${column==='locked'?'false':'true'} WHERE ${where}`,body={...command(f),operation_key:table+':'+order},before=await snapshot(f);
   try{
    const ap=Number((await app`SELECT pg_backend_pid() AS pid`)[0].pid),rp=Number((await rev`SELECT pg_backend_pid() AS pid`)[0].pid),gp=Number((await gate`SELECT pg_backend_pid() AS pid`)[0].pid);
    if(order==='revoke-first'){holding=rev.begin(async tx=>{await tx.unsafe(disable);held.release();await go.promise;});await held.promise;creating=gateway({...f,app})(request(f,'/api/work-items',body));await waitFor(f,ap,rp,table+' '+order);go.release();await holding;}
    else{holding=gate.begin(async tx=>{await tx`SELECT pg_advisory_xact_lock(hashtextextended(jsonb_build_array(${f.scope.groupId}::text,${f.scope.workspaceId}::uuid,'work-operations-v1')::text,13002))`;held.release();await go.promise;});await held.promise;creating=gateway({...f,app})(request(f,'/api/work-items',body));await waitFor(f,ap,gp,table+' create admitted');revoking=rev.unsafe(disable).then(()=>undefined);await waitFor(f,rp,ap,table+' '+order);go.release();await holding;await revoking;}
    await outcome(await creating,table==='work_projects'?404:403,table==='work_projects'?'not_found':'forbidden');if(order==='revoke-first'){compareSnapshot(await snapshot(f),before);}else{expect((await f.owner`SELECT count(*)::int AS n FROM allura.work_receipts WHERE group_id=${f.scope.groupId} AND operation_key=${body.operation_key}`)[0].n).toBe(1);await outcome(await gateway(f)(request(f,'/api/work-items',body)),table==='work_projects'?404:403,table==='work_projects'?'not_found':'forbidden');}
   }finally{go.release();await holding;await creating;await revoking;await f.owner.unsafe(enable);await app.close();await rev.close();await gate.close();}
   if(order==='create-first'){const original=(await f.owner`SELECT response_text FROM allura.work_receipts WHERE group_id=${f.scope.groupId} AND operation_key=${body.operation_key}`)[0].response_text;expect(await accepted(f,body)).toBe(original);}
  }}
  const app=new SQL(f.appUrl,{max:1}),gate=new SQL(process.env.ALLURA_DISPOSABLE_DB_URL!,{max:1}),held=latch(),go=latch();let holding:Promise<unknown>|undefined,pending:Promise<unknown>|undefined;
  try{const ap=Number((await app`SELECT pg_backend_pid() AS pid`)[0].pid),gp=Number((await gate`SELECT pg_backend_pid() AS pid`)[0].pid),pair=generateKeyPairSync('rsa',{modulusLength:2048});f.humanConfig.keys.set('expiry',pair.publicKey);const now=Math.floor(Date.now()/1000),expiry=now+1,text=[{alg:'RS256',kid:'expiry'},{iss:f.humanConfig.issuer,aud:f.humanConfig.audience,sub:`${f.scope.groupId}:author`,email:'author@example.invalid',type:'app',iat:now,exp:expiry}].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.'),identity=authenticateHuman({assertion:text+'.'+sign('RSA-SHA256',Buffer.from(text),pair.privateKey).toString('base64url')},f.humanConfig),before=await snapshot(f);
   holding=gate.begin(async tx=>{await tx`SELECT pg_advisory_xact_lock(hashtextextended(jsonb_build_array(${f.scope.groupId}::text,${f.scope.workspaceId}::uuid,'work-operations-v1')::text,13002))`;held.release();await go.promise;});await held.promise;
   pending=createWorkItem(app,identity,f.scope,{...command(f),contract:'work-plane-compatibility-v1',command:'create',actor_id:f.ids.author,operation_key:'expired-create'},f.ids.author);void pending.catch(()=>{});await waitFor(f,ap,gp,'expiry admitted');await Bun.sleep(Math.max(0,expiry*1000-Date.now()+20));go.release();await holding;await expect(pending).rejects.toThrow('unauthenticated');compareSnapshot(await snapshot(f),before);
  }finally{go.release();await holding;await pending?.catch(()=>{});await app.close();await gate.close();}
 }finally{await f.close();}
},20000);

test('work create restricted SQL pooled contexts and foreign projects cannot bypass authority',async()=>{
 const f=await setup(),app=new SQL(f.appUrl,{max:1});try{
  const normalized=parseWorkCreate({...command(f),contract:'work-plane-compatibility-v1',command:'create',actor_id:f.ids.author}),before=await snapshot(f);
  await expect(Promise.resolve(app`SELECT * FROM allura.create_work_item(${f.scope.groupId},${f.scope.workspaceId}::uuid,${normalized}::jsonb)`)).rejects.toThrow('forbidden');
  await f.owner`INSERT INTO allura.work_entitlements VALUES(${f.scope.groupId},${f.scope.workspaceId},${f.ids.viewer},'work:read',true)`;
  for(const who of ['viewer','machine'] as const){await expect(scopedTransaction(app,f.identities[who],f.scope,'memory:read',tx=>tx`SELECT * FROM allura.create_work_item(${f.scope.groupId},${f.scope.workspaceId}::uuid,${{...normalized,actor_id:f.ids[who]}}::jsonb)`)).rejects.toThrow('forbidden');}
  for(const query of ['SELECT * FROM allura.work_items','INSERT INTO allura.work_entitlements VALUES (NULL,NULL,NULL,NULL,true)','UPDATE allura.work_projects SET active=false','DELETE FROM allura.work_events','TRUNCATE allura.work_receipts','SELECT allura.work_create_json(\'[]\',8)','SELECT allura.work_event_receipt_coherent()']){await expect(Promise.resolve(app.unsafe(query))).rejects.toThrow();}
  await f.owner`INSERT INTO allura.work_projects VALUES(${f.scope.groupId},${f.scope.workspaceId},'foreign-owner','other-owner',true)`;await outcome(await gateway({...f,app})(request(f,'/api/work-items',{...command(f),project_id:'foreign-owner'})),404,'not_found');compareSnapshot(await snapshot(f),before);
  const raw=await accepted({...f,app});await f.owner`INSERT INTO allura.workspace_grants(group_id,workspace_id,principal_id,role,issuer) VALUES(${f.scope.groupId},${f.foreignWorkspace},${f.ids.author},'viewer',${f.ids.author})`;
  await expect(createWorkItem(app,f.identities.author,{...f.scope,workspaceId:f.foreignWorkspace},{...normalized,workspace_id:f.foreignWorkspace},f.ids.author)).rejects.toThrow('forbidden');
  expect((await app`SELECT nullif(current_setting('allura.principal',true),'') AS principal`)[0].principal).toBeNull();await expect(Promise.resolve(app`SELECT * FROM allura.create_work_item(${f.scope.groupId},${f.scope.workspaceId}::uuid,${normalized}::jsonb)`)).rejects.toThrow('forbidden');expect(await accepted({...f,app})).toBe(raw);
  for(const table of ['work_events','work_receipts']){for(const action of ['UPDATE','DELETE','TRUNCATE']){const query=action==='UPDATE'?`UPDATE allura.${table} SET item_id=item_id`:action==='DELETE'?`DELETE FROM allura.${table}`:`TRUNCATE allura.${table} CASCADE`;await expect(Promise.resolve(f.owner.unsafe(query))).rejects.toThrow();}}
 }finally{await app.close();await f.close();}
});
test('work create item event receipt and deferred faults roll back every new row',async()=>{
 const f=await setup();try{
  for(const [table,when,behavior] of [['work_items','BEFORE','raise'],['work_items','AFTER','raise'],['work_events','AFTER','raise'],['work_receipts','AFTER','raise'],['work_receipts','DEFERRED','raise'],['work_events','BEFORE','suppress'],['work_receipts','BEFORE','suppress']] as const){
   const before=await snapshot(f),body={...command(f),operation_key:table+':'+when+':'+behavior};
   await f.owner.unsafe(`CREATE FUNCTION allura.create_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN ${behavior==='suppress'?'RETURN NULL;':"RAISE EXCEPTION 'synthetic fault';"} END $$`);
   await f.owner.unsafe(when==='DEFERRED'?`CREATE CONSTRAINT TRIGGER create_fault AFTER INSERT ON allura.${table} DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION allura.create_fault()`:`CREATE TRIGGER create_fault ${when} INSERT ON allura.${table} FOR EACH ROW EXECUTE FUNCTION allura.create_fault()`);
   try{await outcome(await gateway(f)(request(f,'/api/work-items',body)),500,'failed');compareSnapshot(await snapshot(f),before);}finally{await f.owner.unsafe(`DROP TRIGGER create_fault ON allura.${table};DROP FUNCTION allura.create_fault()`);}
   expect(JSON.parse(await accepted(f,body)).operation_receipt.operation_key).toBe(body.operation_key);
  }
  const app=new SQL(f.appUrl,{max:1}),gate=new SQL(process.env.ALLURA_DISPOSABLE_DB_URL!,{max:1}),held=latch(),go=latch();let holding:Promise<unknown>|undefined,creating:Promise<Response>|undefined;
  try{const ap=Number((await app`SELECT pg_backend_pid() AS pid`)[0].pid),gp=Number((await gate`SELECT pg_backend_pid() AS pid`)[0].pid),before=await snapshot(f);
   holding=gate.begin(async tx=>{await tx`SELECT pg_advisory_xact_lock(hashtextextended(jsonb_build_array(${f.scope.groupId}::text,${f.scope.workspaceId}::uuid,'work-operations-v1')::text,13002))`;held.release();await go.promise;});await held.promise;creating=gateway({...f,app})(request(f,'/api/work-items',{...command(f),operation_key:'terminated'}));await waitFor(f,ap,gp,'terminated in flight');expect((await f.owner`SELECT pg_terminate_backend(${ap}) AS killed`)[0].killed).toBe(true);await outcome(await creating,503,'unknown');compareSnapshot(await snapshot(f),before);
  }finally{go.release();await holding;await creating;await app.close();await gate.close();}
 }finally{await f.close();}
});
test('work create lost committed HTTP response reconciles in a fresh process with the same key',async()=>{
 const f=await setup();let child:ReturnType<typeof Bun.spawn>|undefined;
 const script=`import {SQL} from 'bun';import {createPublicKey} from 'node:crypto';import {createCoreGateway} from './src/core-api.ts';import {EMBEDDING} from './src/embedding.ts';const p=JSON.parse(process.env.WORK_HTTP_FIXTURE);const db=new SQL(p.url,{max:2});const g=createCoreGateway(db,{issuer:p.issuer,audience:'fixture',keys:new Map([['key',createPublicKey(p.key)]])},p.origin,new Uint8Array(32).fill(7),{identity:EMBEDDING,embed:async()=>{throw new Error('unused');}},undefined,undefined,'human',undefined,'work-plane-compatibility-v1');const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch:async r=>{const reply=await g(r);if(p.lose){if(reply.status!==201){throw new Error('commit not established');}server.stop(true);}return reply;}});console.log(server.port);process.on('SIGTERM',async()=>{server.stop(true);await db.close();process.exit(0);});`;
 async function start(lose:boolean){child=Bun.spawn([process.execPath,'-e',script],{env:{...process.env,WORK_HTTP_FIXTURE:JSON.stringify({url:f.appUrl,issuer:f.humanConfig.issuer,key:f.humanConfig.keys.get('key')!.export({type:'spki',format:'pem'}),origin,lose})},stdout:'pipe',stderr:'pipe'});const reader=(child.stdout as ReadableStream<Uint8Array>).getReader();const first=await reader.read();reader.releaseLock();const port=Number(new TextDecoder().decode(first.value).trim());expect(port).toBeGreaterThan(0);return `http://127.0.0.1:${port}`;}
 async function stop(){if(child){child.kill('SIGTERM');expect(await child.exited).toBe(0);expect(await new Response(child.stderr as ReadableStream<Uint8Array>).text()).toBe('');child=undefined;}}
 try{const lost=await start(true),req=request(f,'/api/work-items',command(f)),send=(host:string)=>new Request(req.url.replace(origin,host),{method:'POST',headers:req.headers,body:JSON.stringify(command(f))});await expect(fetch(send(lost))).rejects.toThrow();await stop();
  const rows=await f.owner`SELECT response_text FROM allura.work_receipts WHERE group_id=${f.scope.groupId}`;expect(rows).toHaveLength(1);const stored=rows[0].response_text,before=await snapshot(f),fresh=await start(false),reply=await fetch(send(fresh));expect(reply.status).toBe(201);expect(await reply.text()).toBe(stored);await stop();compareSnapshot(await snapshot(f),before);console.log(JSON.stringify({createResponseLoss:{client:'connection lost',reconciledStatus:201,storedSha256:createHash('sha256').update(stored).digest('hex')}}));
 }finally{await stop();await f.close();}
},20000);
test('work create retained item and operation capacity races preserve replay at saturation',async()=>{
 for(const cap of ['items','operations']){const f=await setup();try{
  const raw=await accepted(f),x=JSON.parse(raw).work_item;
  const fillStarted=performance.now();
  if(cap==='items'){
   await f.owner`INSERT INTO allura.work_items(group_id,workspace_id,project_id,id,title,status,created_at,updated_at,completed_at) SELECT ${f.scope.groupId},${f.scope.workspaceId}::uuid,${project},'retained-'||n,'retained','cancelled',${token}::timestamptz,${token}::timestamptz,${token}::timestamptz FROM generate_series(1,253) n`;
   expect((await f.owner`SELECT count(*)::int AS n FROM allura.work_items WHERE group_id=${f.scope.groupId}`)[0].n).toBe(255);
  }else{
   await scopedTransaction(f.app,f.identities.author,f.scope,'memory:read',async tx=>{
    let current={updated_at:token,status:'ready'};for(let n=0;n<1022;n++){
     const v={contract:'work-plane-compatibility-v1',command:'transition',group_id:f.scope.groupId,workspace_id:f.scope.workspaceId,actor_id:f.ids.author,operation_key:'fill:'+n,expected_updated_at:current.updated_at,to_status:current.status==='ready'?'backlog':'ready',reason:null,evidence_id:null};const r=(await tx`SELECT allura.transition_work_item(${f.scope.groupId},${f.scope.workspaceId}::uuid,'existing',${v}::jsonb) AS response`)[0].response;current=JSON.parse(r).work_item;
    }
   });expect((await f.owner`SELECT count(*)::int AS n FROM allura.work_receipts WHERE group_id=${f.scope.groupId}`)[0].n).toBe(1023);
  }
  recordSnapshotPhase({phase:'capacity-fill-'+cap,ms:performance.now()-fillStarted});
  const results=await Promise.all(['last-a','last-b'].map(operation_key=>gateway(f)(request(f,'/api/work-items',{...command(f),operation_key}))));expect(results.map(r=>r.status).sort()).toEqual([201,503]);await outcome(results.find(r=>r.status===503)!,503,'capacity');
  const before=await snapshot(f);expect(await accepted(f)).toBe(raw);compareSnapshot(await snapshot(f),before);expect(JSON.parse(raw).work_item.id).toBe(x.id);
  expect((await f.owner.unsafe(`SELECT count(*)::int AS n FROM allura.${cap==='items'?'work_items':'work_receipts'} WHERE group_id='${f.scope.groupId}'`))[0].n).toBe(cap==='items'?256:1024);
  await f.owner`UPDATE allura.work_entitlements SET active=false WHERE principal_id=${f.ids.author}`;await outcome(await gateway(f)(request(f,'/api/work-items',command(f))),403,'forbidden');compareSnapshot(await snapshot(f),before);
 }finally{await f.close();}}
},20000);
test('work create request response admission and timeout bounds retain honest unknown outcomes',async()=>{
 const f=await setup();try{
  const send=gateway(f),raw=JSON.stringify(command(f)),base=request(f,'/api/work-items',command(f));
  const exact=await send(new Request(base.url,{method:'POST',headers:base.headers,body:' '.repeat(65536-Buffer.byteLength(raw))+raw}));expect(exact.status).toBe(201);const original=await exact.text();
  await outcome(await send(new Request(base.url,{method:'POST',headers:base.headers,body:' '.repeat(65537-Buffer.byteLength(raw))+raw})),413,'invalid');
  const bytes=Buffer.from(raw);let index=0;const body=new ReadableStream<Uint8Array>({pull(c){if(index<bytes.length){c.enqueue(bytes.subarray(index,index+1));index++;}else{c.close();}}});const split=await send(new Request(base.url,{method:'POST',headers:base.headers,body}));expect(split.status).toBe(201);expect(await split.text()).toBe(original);
  const fit=base.url+'&unknown=';await outcome(await send(new Request(fit+'x'.repeat(2048-fit.length),{method:'POST',headers:base.headers,body:raw})),400,'invalid');await outcome(await send(new Request(fit+'x'.repeat(2049-fit.length),{method:'POST',headers:base.headers,body:raw})),414,'invalid');
  await f.owner.unsafe('ALTER TABLE allura.work_projects RENAME TO create_map_unavailable');try{await outcome(await send(request(f,'/api/work-items',command(f))),503,'unknown');}finally{await f.owner.unsafe('ALTER TABLE allura.create_map_unavailable RENAME TO work_projects');}
  const release=latch(),entered=latch();let handles=0;const routes=createWorkRoutes(f.app,key).map(r=>({...r,handle:async(c:Parameters<typeof r.handle>[0])=>{const result=await r.handle(c);handles++;if(handles===16){entered.release();}await release.promise;return result;}}));const bounded=createGateway({human:f.humanConfig,origin,store:new DatabaseStore(f.app),machineLookup:async()=>null,routes});
  const before=await snapshot(f),started=performance.now(),pending=Array.from({length:16},()=>bounded(request(f,'/api/work-items',command(f))));
  try{await entered.promise;await outcome(await bounded(request(f,'/api/work-items/existing')),429,'unavailable');for(const r of await Promise.all(pending)){await outcome(r,503,'unknown');}expect(performance.now()-started).toBeGreaterThanOrEqual(4900);expect(performance.now()-started).toBeLessThan(6500);await outcome(await bounded(request(f,'/api/work-items/existing')),429,'unavailable');}finally{release.release();await Promise.all(pending);}
  for(let n=0;n<100;n++){if((await bounded(request(f,'/api/work-items/existing'))).status===200){break;}await Bun.sleep(5);}expect(await accepted(f)).toBe(original);compareSnapshot(await snapshot(f),before);
 }finally{await f.close();}
},10000);

test('work create additive schema preserves accepted transition history and exact 200 replay',async()=>{
 const historyStarted=performance.now();
 const pin='502578872b72cabbe474ffcf74cef77d47a96f41',target=process.env.ALLURA_DISPOSABLE_DB_URL!;if(new URL(target).hostname!=='127.0.0.1'||process.env.ALLURA_DISPOSABLE_DB!=='owned-test-container'){throw new Error('Requires owned disposable runner');}
 const root=new URL('../../',import.meta.url).pathname,exported=await mkdtemp(join(tmpdir(),'allura-create-history-')),hashes:Record<string,string>={},admin=new SQL(target,{max:1}),database='create_history_'+randomUUID().replaceAll('-','');let f:Fixture|undefined,created=false;
 try{
  const archive=Bun.spawnSync(['git','archive',pin,'foundation'],{cwd:root});expect(archive.exitCode).toBe(0);expect(Bun.spawnSync(['tar','-x','-C',exported],{stdin:archive.stdout}).exitCode).toBe(0);
  const files=Bun.spawnSync(['git','ls-tree','-r','--name-only',pin,'foundation'],{cwd:root});expect(files.exitCode).toBe(0);for(const path of files.stdout.toString().trim().split('\n')){const old=Bun.spawnSync(['git','show',`${pin}:${path}`],{cwd:root});expect(old.exitCode).toBe(0);const bytes=Buffer.from(await Bun.file(join(exported,path)).arrayBuffer());expect(bytes.equals(old.stdout)).toBe(true);hashes[path]=createHash('sha256').update(bytes).digest('hex');}
  recordSnapshotPhase({phase:'historical-export',ms:performance.now()-historyStarted});
  await symlink(join(root,'foundation/node_modules'),join(exported,'foundation/node_modules'));await admin.unsafe(`CREATE DATABASE ${database}`);created=true;const url=new URL(target);url.pathname='/'+database;
  const legacy=await import(join(exported,'foundation/tests/lifecycle-fixture.ts')) as typeof import('./lifecycle-fixture.ts'),work=await import(join(exported,'foundation/src/work-plane.ts')) as typeof import('../src/work-plane.ts');f=await legacy.fixture('allura-create-history-'+randomUUID(),url.toString());const fx=f;
  await f.owner`INSERT INTO allura.work_authority VALUES(true,'synthetic-owner')`;await f.owner`INSERT INTO allura.work_projects VALUES(${f.scope.groupId},${f.scope.workspaceId},${project},'synthetic-owner',true)`;for(const a of ['work:read','work:write']){await f.owner`INSERT INTO allura.work_entitlements VALUES(${f.scope.groupId},${f.scope.workspaceId},${f.ids.author},${a},true)`;}
  await f.owner`INSERT INTO allura.work_items(group_id,workspace_id,project_id,id,title,status,created_at,updated_at) VALUES(${f.scope.groupId},${f.scope.workspaceId},${project},'existing','Existing','ready',${token}::timestamptz,${token}::timestamptz)`;
  const v={contract:'work-plane-compatibility-v1',command:'transition',group_id:f.scope.groupId,workspace_id:f.scope.workspaceId,actor_id:f.ids.author,operation_key:'old-transition',expected_updated_at:token,to_status:'in_progress'};
  const accepted=await work.transitionWorkItem(f.app,f.identities.author,f.scope,'existing',v),tables=['work_authority','work_entitlements','work_projects','work_items','work_events','work_receipts','events','semantic_versions','run_definitions','run_records','run_state','run_steps','run_journal','run_operation_receipts','run_effect_receipts','run_approval_requests','run_approval_decisions','run_handoff_links'],snap=()=>Promise.all(tables.map(async t=>[...await fx.owner.unsafe(`SELECT to_jsonb(t)::text AS row FROM allura.${t} t ORDER BY 1`)])),before=await snap();
  expect((await f.owner`SELECT count(*)::int AS n FROM allura.schema_migrations`)[0].n).toBe(34);const migrations=[...await f.owner`SELECT version,digest FROM allura.schema_migrations ORDER BY version`];const migrationStarted=performance.now();await migrate(f.owner);recordSnapshotPhase({phase:'historical-migration',ms:performance.now()-migrationStarted});expect((await f.owner`SELECT count(*)::int AS n FROM allura.schema_migrations`)[0].n).toBe(35);expect(await snap()).toEqual(before);expect([...await f.owner`SELECT version,digest FROM allura.schema_migrations WHERE version<=34 ORDER BY version`]).toEqual(migrations);
  const replay=await gateway(f)(request(f,'/api/work-items/existing/transition',{...v,contract:undefined,command:undefined}));expect(replay.status).toBe(200);expect(await replay.text()).toBe(accepted);expect(await snap()).toEqual(before);
  console.log(JSON.stringify({createHistoricalTransition:{pin,hashes,before,after:await snap(),receipt:accepted}}));
 }finally{const cleanupStarted=performance.now();await f?.close();try{if(created){await admin.unsafe(`DROP DATABASE ${database} WITH (FORCE)`);expect(await admin`SELECT datname FROM pg_database WHERE datname=${database}`).toHaveLength(0);}}finally{await admin.close();}for(const [p,h] of Object.entries(hashes)){expect(createHash('sha256').update(new Uint8Array(await Bun.file(join(exported,p)).arrayBuffer())).digest('hex')).toBe(h);}await rm(exported,{recursive:true,force:true});expect(await Bun.file(join(exported,'foundation/src/work-plane.ts')).exists()).toBe(false);recordSnapshotPhase({phase:'historical-cleanup',ms:performance.now()-cleanupStarted});}
},30000);
test('work create service SQL and wire canonical digests preserve bounded nested data',async()=>{
 const f=await setup();try{
  const input={...command(f),acceptance_criteria:[{b:1,a:['é','é',true,null,0.1]},[1,2]]},normalized=parseWorkCreate({...input,contract:'work-plane-compatibility-v1',command:'create',actor_id:f.ids.author}),raw=await accepted(f,input),v=JSON.parse(raw);
  const independent=(await f.owner`SELECT encode(sha256(convert_to((${normalized}::jsonb-'operation_key'||jsonb_build_object('authority_instance_id','synthetic-owner'))::text,'UTF8')),'hex') AS digest`)[0].digest;expect(v.operation_receipt.request_digest).toBe(independent);
  expect((await createWorkItem(f.app,f.identities.author,f.scope,normalized,f.ids.author)).body).toBe(raw);
  const wire=JSON.stringify(input).replace('"b":1','"b":1e0').replace('0.1','0.10'),req=request(f,'/api/work-items',{}),alias=await gateway(f)(new Request(req.url,{method:'POST',headers:req.headers,body:wire}));expect(alias.status).toBe(201);expect(await alias.text()).toBe(raw);
  for(const criteria of [[{b:1,a:['é','é',true,null,0.1]},[1,2]],[{b:1,a:['é','é',true,null,0.1]},[2,1]]]){await outcome(await gateway(f)(request(f,'/api/work-items',{...input,acceptance_criteria:criteria})),409,'conflict');}
  for(const change of [{extra:true},{title:1},{priority:null},{acceptance_criteria:null},{description:true},{owner_id:2},{actor_id:f.ids.reviewer}]){const dto={...normalized,...change};await expect(scopedTransaction(f.app,f.identities.author,f.scope,'memory:read',tx=>tx`SELECT * FROM allura.create_work_item(${f.scope.groupId},${f.scope.workspaceId}::uuid,${dto}::jsonb)`)).rejects.toThrow(change.actor_id?'forbidden':'invalid');}
  for(const n of ['1','0.1','5e-324','9007199254740991','9007199254740993','1.0000000000000001','0.10000000000000001']){
   const ok=['1','0.1','5e-324','9007199254740991'].includes(n),dto=JSON.stringify({...normalized,operation_key:'numeric:'+n,acceptance_criteria:[]}).replace('"acceptance_criteria":[]','"acceptance_criteria":['+n+']');
   const invoke=()=>scopedTransaction(f.app,f.identities.author,f.scope,'memory:read',tx=>tx`SELECT * FROM allura.create_work_item(${f.scope.groupId},${f.scope.workspaceId}::uuid,${dto}::text::jsonb)`);if(ok){expect((await invoke())[0].http_status).toBe(201);}else{await expect(invoke()).rejects.toThrow('invalid');}
  }
  for(const multibyte of [false,true]){
   const criteria:unknown[]=[Array(1000).fill(0),''],size=Number((await f.owner`SELECT octet_length(${criteria}::jsonb::text) AS n`)[0].n),remaining=16384-size;criteria[1]=multibyte?'é'.repeat(Math.floor(remaining/2))+'x'.repeat(remaining%2):'x'.repeat(remaining);
   expect((await f.owner`SELECT octet_length(${criteria}::jsonb::text) AS n`)[0].n).toBe(16384);const body={...command(f),operation_key:'size:'+multibyte,acceptance_criteria:criteria};expect(JSON.parse(await accepted(f,body)).work_item.acceptance_criteria).toEqual(criteria);
   const over=[criteria[0],criteria[1]+'x'];expect((await f.owner`SELECT octet_length(${over}::jsonb::text) AS n`)[0].n).toBe(16385);await outcome(await gateway(f)(request(f,'/api/work-items',{...body,operation_key:'over:'+multibyte,acceptance_criteria:over})),400,'invalid');
  }
  const dto={...normalized,operation_key:'immutable-copy',acceptance_criteria:[{nested:['original']}]},promise=createWorkItem(f.app,f.identities.author,f.scope,dto,f.ids.author);dto.acceptance_criteria[0]!.nested[0]='changed';expect(JSON.parse((await promise).body).work_item.acceptance_criteria).toEqual([{nested:['original']}]);
 }finally{await f.close();}
});
