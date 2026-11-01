import {test,expect} from 'bun:test';
import {randomUUID,createHmac,createHash,randomBytes,generateKeyPairSync,sign} from 'node:crypto';
import {SQL} from 'bun';
import {mkdtemp,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseWorkList,workListBinding,signWorkListCursor,workGraph} from '../src/work-plane-contract.ts';
import {listWorkItems} from '../src/work-plane.ts';
import {createWorkRoutes} from '../src/work-plane-api.ts';
import {createGateway} from '../src/gateway.ts';
import {DatabaseStore,scopedTransaction} from '../src/persistence.ts';
import {authenticateMachine,authenticateHuman} from '../src/authentication.ts';
import {fixture} from './lifecycle-fixture.ts';
import {createCoreGateway} from '../src/core-api.ts';
import {EMBEDDING} from '../src/embedding.ts';
const origin='https://work.invalid',project='Project:Alpha',token='2026-01-02T03:04:05.123456Z';
const key=new Uint8Array(32).fill(7),provider={identity:EMBEDDING,embed:async():Promise<number[]>=>{throw new Error('work must not embed');}};
type Fixture=Awaited<ReturnType<typeof fixture>>;
async function setup(){
 const setupStarted=performance.now();
 const f=await fixture(`allura-work-list-${randomUUID()}`);
 await f.owner`INSERT INTO allura.work_authority VALUES(true,'synthetic-owner') ON CONFLICT DO NOTHING`;
 await f.owner`INSERT INTO allura.work_projects VALUES(${f.scope.groupId},${f.scope.workspaceId},${project},'synthetic-owner',true)`;
 for(const n of ['author','reviewer'] as const){await f.owner`INSERT INTO allura.work_entitlements VALUES(${f.scope.groupId},${f.scope.workspaceId},${f.ids[n]},'work:read',true)`;}
 for(const [id,t] of [['é/tie',token],['a+tie',token],['Newest','2026-01-02T03:04:05.123457Z']]){await f.owner`INSERT INTO allura.work_items(group_id,workspace_id,project_id,id,title,status,created_at,updated_at) VALUES(${f.scope.groupId},${f.scope.workspaceId},${project},${id},${id},'ready',${t}::timestamptz,${t}::timestamptz)`;}
 recordSnapshotPhase({phase:'setup',ms:performance.now()-setupStarted});
 return f;
}
function gateway(f:Fixture){return createCoreGateway(f.app,f.humanConfig,origin,key,provider,undefined,undefined,'human',undefined,'work-plane-compatibility-v1');}
function request(f:Fixture,changes:Record<string,string>={},path='/api/work-items',who:Parameters<Fixture['jwt']>[0]='author'){
 const query=new URLSearchParams({group_id:f.scope.groupId,workspace_id:f.scope.workspaceId,project_id:project,limit:'2',...changes});
 if(path!=='/api/work-items'){query.delete('project_id');query.delete('limit');}
 return new Request(`${origin}${path}?${query}`,{headers:{'Cf-Access-Jwt-Assertion':f.jwt(who),'X-Allura-Work-Contract':'work-plane-compatibility-v1'}});
}
// Fixed whole-table observations at the existing quiescent comparison boundaries.
// One statement gives one consistent observation, unlike the former pool waves.
const snapshotTables=['work_items','work_events','work_receipts','events','semantic_versions','run_journal','run_operation_receipts'] as const;
type Snapshot={row:string}[][];
function recordSnapshotPhase(...samples:{phase:string;ms:number;tables?:{table:string;rows:number;bytes:number}[]}[]){console.log(JSON.stringify({workSnapshotPhases:{suite:'list',samples}}));}
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
type Page={work_items:{id:string;created_at:string;updated_at:string;status:string;project_id:string}[];has_more:boolean;next_cursor:string|null};
async function page(send:(r:Request)=>Promise<Response>,req:Request):Promise<Page>{const r=await send(req);expect(r.status).toBe(200);return await r.json() as Page;}
async function outcome(r:Response,status:number,code:string){expect(r.status).toBe(status);expect(await r.json()).toEqual({outcome:code});expect(r.headers.get('cache-control')).toBe('no-store');}
async function insert(f:Fixture,id:string,t=token,p=project,status='ready',description:string|null=null){await f.owner`INSERT INTO allura.work_items(group_id,workspace_id,project_id,id,title,status,description,created_at,updated_at,completed_at) VALUES(${f.scope.groupId},${f.scope.workspaceId},${p},${id},${id},${status},${description},${t}::timestamptz,${t}::timestamptz,${['done','cancelled'].includes(status)?t:null}::timestamptz)`;}

test('work list signed HTTP returns scoped ordered items and an authenticated next cursor',async()=>{
 const f=await setup();try{
  const send=gateway(f);expect((await f.app`SELECT current_user AS role`)[0].role).toBe('allura_app');
  const item=await send(request(f,{},'/api/work-items/'+encodeURIComponent('é/tie')));expect(item.status).toBe(200);expect((await item.json() as {work_item:{updated_at:string}}).work_item.updated_at).toBe(token);
  expect((await send(request(f,{},'/api/dashboard/context'))).status).toBe(200);
  expect((await send(request(f,{},'/api/dashboard/context','org'))).status).toBe(403);
  for(const disabled of [createCoreGateway(f.app,f.humanConfig,origin,key,provider),createCoreGateway(f.app,undefined,origin,key,provider,undefined,undefined,'machine-only',undefined,'work-plane-compatibility-v1')]){expect((await disabled(request(f))).status).toBe(404);}
  const before=await snapshot(f),response=await send(request(f));
  console.log(JSON.stringify({workListFirstStatus:response.status,controls:'restricted-role item200 exact-microseconds context200 org403 disabled404 machine-only404'}));
  expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('no-store');
  const page=await response.json() as {work_items:{id:string;updated_at:string}[];has_more:boolean;next_cursor:string};
  expect(page.work_items.map(x=>x.id)).toEqual(['Newest','é/tie']);expect(page.work_items[1]!.updated_at).toBe(token);expect(page.has_more).toBe(true);expect(page.next_cursor.length).toBeGreaterThan(40);
  expect(Object.keys(page).sort()).toEqual(['has_more','next_cursor','work_items']);compareSnapshot(await snapshot(f),before);
 }finally{await f.close();}
});

test('work list empty mapped project filters exact microseconds and stable ties remain bounded',async()=>{
 const f=await setup();try{
  const send=gateway(f);await f.owner`INSERT INTO allura.work_projects VALUES(${f.scope.groupId},${f.scope.workspaceId},'empty','synthetic-owner',true)`;
  expect(await page(send,request(f,{project_id:'empty'}))).toEqual({work_items:[],has_more:false,next_cursor:null});await outcome(await send(request(f,{project_id:'missing'})),404,'not_found');
  const first=await page(send,request(f)),last=await page(send,request(f,{cursor:first.next_cursor!}));expect(last.work_items.map(x=>x.id)).toEqual(['a+tie']);expect(last.has_more).toBe(false);expect(last.next_cursor).toBeNull();
  const afterLast=signWorkListCursor(key,workListBinding(parseWorkList(new URL(request(f).url).search),f.ids.author,'synthetic-owner'),{created_at:token,id:'a+tie'});expect(await page(send,request(f,{cursor:afterLast}))).toEqual({work_items:[],has_more:false,next_cursor:null});
  for(const status of Object.keys(workGraph)){await insert(f,'status-'+status,token,project,status);expect((await page(send,request(f,{status,limit:'100'}))).work_items.every(x=>x.status===status)).toBe(true);}
  for(let n=0;n<103;n++){await insert(f,'bound-'+String(n).padStart(3,'0'));}
  for(const limit of ['1','100']){const p=await page(send,request(f,{limit}));expect(p.work_items).toHaveLength(Number(limit));expect(p.has_more).toBe(true);}
  const defaultReq=request(f);const u=new URL(defaultReq.url);u.searchParams.delete('limit');const d=await page(send,new Request(u.toString(),{headers:defaultReq.headers}));expect(d.work_items).toHaveLength(100);expect(d.has_more).toBe(true);
  await f.owner`INSERT INTO allura.work_projects VALUES(${f.scope.groupId},${f.scope.workspaceId},' Project+é%2F ','synthetic-owner',true)`;
  await insert(f,' MiXeD+é/🧠 ',token,' Project+é%2F ');expect((await page(send,request(f,{project_id:' Project+é%2F '}))).work_items[0]!.id).toBe(' MiXeD+é/🧠 ');
  expect(first.work_items.map(x=>x.created_at)).toEqual(['2026-01-02T03:04:05.123457Z',token]);
 }finally{await f.close();}
});
test('work list strict selectors versions malformed encoding and unsupported lanes fail closed',async()=>{
 const f=await setup();try{
  const send=gateway(f),before=await snapshot(f),base=request(f);
  for(const changes of [{limit:'0'},{limit:'01'},{limit:'101'},{limit:'1e2'},{limit:'1.0'},{limit:'-1'},{limit:''},{status:'unknown'},{lane_id:''},{project_id:''},{project_id:'\0'},{unknown:'x'}]){await outcome(await send(request(f,changes)),400,'invalid');}
  for(const suffix of ['&project_id=other','&project%5fid=other','&limit=2','&status=%','&status=%GG','&project_id=%C0%AF','&lane_id=%ED%A0%80','&lane_id=%00','&lane_id=%F4%90%80%80','&lane_id=%E2%82']){await outcome(await send(new Request(base.url+suffix,{headers:base.headers})),400,'invalid');}
  for(const missing of ['group_id','workspace_id','project_id']){const u=new URL(base.url);u.searchParams.delete(missing);await outcome(await send(new Request(u.toString(),{headers:base.headers})),400,'invalid');}
  for(const version of ['', 'v2','work-plane-compatibility-v1, work-plane-compatibility-v1']){const req=request(f);req.headers.set('X-Allura-Work-Contract',version);await outcome(await send(req),400,'invalid');}
  const missing=request(f);missing.headers.delete('X-Allura-Work-Contract');await outcome(await send(missing),400,'invalid');
  await outcome(await send(request(f,{lane_id:'valid opaque lane'})),404,'not_found');await outcome(await send(request(f,{lane_id:'valid',project_id:'missing'})),404,'not_found');
  const get=request(f);get.headers.set('Content-Length','65537');get.headers.set('Content-Type','not-json');expect((await send(get)).status).toBe(200);expect(get.bodyUsed).toBe(false);
  compareSnapshot(await snapshot(f),before);
 }finally{await f.close();}
});
test('work list cursor binds principal scope project filters mapping and expiry without disclosure',async()=>{
 const f=await setup();try{
  const send=gateway(f),first=await page(send,request(f)),cursor=first.next_cursor!,v=parseWorkList(new URL(request(f).url).search),binding=workListBinding(v,f.ids.author,'synthetic-owner');
  for(const changes of [{limit:'1'},{status:'ready'},{project_id:'other'}]){
   if(changes.project_id){await f.owner`INSERT INTO allura.work_projects VALUES(${f.scope.groupId},${f.scope.workspaceId},'other','synthetic-owner',true)`;}
   await outcome(await send(request(f,{cursor,...changes})),400,'invalid');
  }
  await outcome(await send(request(f,{cursor},'/api/work-items','reviewer')),400,'invalid');
  const last=first.work_items.at(-1)!;
  const custom=(value:unknown)=>{const p=Buffer.from(JSON.stringify(value)).toString('base64url');return p+'.'+createHmac('sha256',key).update('allura-work-list-cursor-v1\0'+p).digest('base64url');};
  const payload={b:binding,t:Date.now(),c:last.created_at,i:last.id};
  for(const bad of [cursor.slice(0,-2)+'AA',cursor+'=',cursor+'.x','x'.repeat(1025),signWorkListCursor(new Uint8Array(32).fill(8),binding,last),signWorkListCursor(key,binding,last,Date.now()-900001),signWorkListCursor(key,binding,last,Date.now()+60000),signWorkListCursor(key,workListBinding(v,f.ids.author,'wrong-mapping'),last),custom({...payload,c:'2026-02-30T03:04:05.123456Z'}),custom({...payload,extra:true}),custom({...payload,i:''}),custom({...payload,t:1e100})]){await outcome(await send(request(f,{cursor:bad})),400,'invalid');}
  for(const [field,value] of [['group_id','allura-foreign'],['workspace_id',randomUUID()]]){await outcome(await send(request(f,{cursor:signWorkListCursor(key,workListBinding({...v,[field!]:value},f.ids.author,'synthetic-owner'),last)})),400,'invalid');}
  await f.owner`UPDATE allura.work_projects SET active=false WHERE group_id=${f.scope.groupId} AND id=${project}`;await outcome(await send(request(f,{cursor})),404,'not_found');
 }finally{await f.close();}
});

test('work list current read entitlement original binding and authenticated machine denials remain enforced',async()=>{
 const f=await setup();try{
  const send=gateway(f),before=await snapshot(f);
  for(const who of ['viewer','curator','org'] as const){await outcome(await send(request(f,{},'/api/work-items',who)),403,'forbidden');}
  await f.owner`INSERT INTO allura.work_entitlements VALUES(${f.scope.groupId},${f.scope.workspaceId},${f.ids.viewer},'work:read',true)`;
  expect((await send(request(f,{},'/api/work-items','viewer'))).status).toBe(200);
  expect((await f.owner`SELECT count(*)::int AS n FROM allura.work_entitlements WHERE principal_id=${f.ids.viewer} AND action='work:write'`)[0].n).toBe(0);
  const routes=createWorkRoutes(f.app,key).map(r=>({...r,handle:async(c:Parameters<typeof r.handle>[0])=>{
   await f.owner`UPDATE allura.identity_bindings SET principal_id=${f.ids.reviewer} WHERE subject=${f.scope.groupId+':author'}`;
   try{return await r.handle(c);}finally{await f.owner`UPDATE allura.identity_bindings SET principal_id=${f.ids.author} WHERE subject=${f.scope.groupId+':author'}`;}
  }}));
  await outcome(await createGateway({human:f.humanConfig,origin,store:new DatabaseStore(f.app),machineLookup:async()=>null,routes})(request(f)),403,'forbidden');
  const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048}),human={...f.humanConfig,keys:new Map([['expiring',publicKey]])},now=Math.floor(Date.now()/1000),exp=now+2;
  const data=[{alg:'RS256',kid:'expiring'},{iss:human.issuer,aud:human.audience,sub:f.scope.groupId+':author',email:'author@example.invalid',type:'app',iat:now,exp}].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.'),jwt=data+'.'+sign('RSA-SHA256',Buffer.from(data),privateKey).toString('base64url'),identity=authenticateHuman({assertion:jwt},human);
  const expiring=createGateway({human,origin,store:new DatabaseStore(f.app),machineLookup:async()=>null,routes:createWorkRoutes(f.app,key)}),signed=request(f);signed.headers.set('Cf-Access-Jwt-Assertion',jwt);expect((await expiring(signed)).status).toBe(200);
  await Bun.sleep(Math.max(0,exp*1000-Date.now()+10));await outcome(await expiring(signed),401,'unauthenticated');
  await expect(listWorkItems(f.app,identity,f.scope,new URL(request(f).url).search,key,f.ids.author)).rejects.toThrow('unauthenticated');
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
   await expect(listWorkItems(f.app,identity,f.scope,new URL(request(f).url).search,key,principal)).rejects.toThrow('forbidden');
   const req=request(f);req.headers.delete('Cf-Access-Jwt-Assertion');req.headers.set('Authorization','Bearer '+secret);await outcome(await send(req),401,'unauthenticated');
  }
  await f.owner`UPDATE allura.work_entitlements SET active=false WHERE principal_id=${f.ids.author}`;await outcome(await send(request(f)),403,'forbidden');compareSnapshot(await snapshot(f),before);
 }finally{await f.close();}
});
function latch(){let release!:()=>void;const promise=new Promise<void>(r=>{release=r;});return {promise,release};}
async function waitFor(f:Fixture,waiter:number,blocker:number,label:string){const end=Date.now()+1500;while(Date.now()<end){if((await f.owner`SELECT ${blocker}::int=ANY(pg_blocking_pids(${waiter}::int)) AS waiting`)[0].waiting){expect(waiter).not.toBe(blocker);console.log(JSON.stringify({workListWait:{waiter,blocker,label}}));return;}await Bun.sleep(5);}throw new Error('attributable list wait absent: '+label);}
test('work list authority entitlement and mapping revocation serialize in both attributable orders',async()=>{
 const f=await setup();try{
  const before=await snapshot(f);
  const targets=[['principals',`id='${f.ids.author}'`,'active'],['identity_bindings',`principal_id='${f.ids.author}'`,'active'],['memberships',`principal_id='${f.ids.author}'`,'active'],['workspace_grants',`principal_id='${f.ids.author}'`,'active'],['work_entitlements',`principal_id='${f.ids.author}'`,'active'],['tenants',`group_id='${f.scope.groupId}'`,'active'],['workspaces',`id='${f.scope.workspaceId}'`,'locked'],['work_projects',`group_id='${f.scope.groupId}'`,'active']];
  for(const [table,where,column] of targets){for(const order of ['revoke-first','read-first']){
   const app=new SQL(f.appUrl,{max:1}),rev=new SQL(process.env.ALLURA_DISPOSABLE_DB_URL!,{max:1}),gate=new SQL(process.env.ALLURA_DISPOSABLE_DB_URL!,{max:1}),held=latch(),go=latch();let holding:Promise<unknown>|undefined,reading:Promise<Response>|undefined,revoking:Promise<unknown>|undefined;
   const disable=`UPDATE allura.${table} SET ${column}=${column==='locked'?'true':'false'} WHERE ${where}`,enable=`UPDATE allura.${table} SET ${column}=${column==='locked'?'false':'true'} WHERE ${where}`;
   try{
    const ap=Number((await app`SELECT pg_backend_pid() AS pid`)[0].pid),rp=Number((await rev`SELECT pg_backend_pid() AS pid`)[0].pid),gp=Number((await gate`SELECT pg_backend_pid() AS pid`)[0].pid);
    if(order==='revoke-first'){
     holding=rev.begin(async tx=>{await tx.unsafe(disable);held.release();await go.promise;});await held.promise;
     reading=gateway({...f,app})(request(f));await waitFor(f,ap,rp,table+' '+order);go.release();await holding;
    }else{
     holding=gate.begin(async tx=>{await tx`SELECT id FROM allura.work_items WHERE group_id=${f.scope.groupId} AND id='Newest' FOR UPDATE`;held.release();await go.promise;});await held.promise;
     reading=gateway({...f,app})(request(f));await waitFor(f,ap,gp,table+' read reached data after authority');
     revoking=rev.unsafe(disable).then(()=>undefined);await waitFor(f,rp,ap,table+' '+order);go.release();await holding;await revoking;
    }
    await outcome(await reading,table==='work_projects'?404:403,table==='work_projects'?'not_found':'forbidden');compareSnapshot(await snapshot(f),before);
   }finally{go.release();await holding;await reading;await revoking;await f.owner.unsafe(enable);await app.close();await rev.close();await gate.close();}
  }}
  for(const map of [false,true]){
   const routes=createWorkRoutes(f.app,key).map(r=>({...r,handle:async(c:Parameters<typeof r.handle>[0])=>{const result=await r.handle(c);if(map){await f.owner`UPDATE allura.work_projects SET active=false WHERE group_id=${f.scope.groupId}`;}else{await f.owner`UPDATE allura.work_entitlements SET active=false WHERE principal_id=${f.ids.author}`;}return result;}}));
   await outcome(await createGateway({human:f.humanConfig,origin,store:new DatabaseStore(f.app),machineLookup:async()=>null,routes})(request(f)),map?404:403,map?'not_found':'forbidden');
   await f.owner`UPDATE allura.work_projects SET active=true WHERE group_id=${f.scope.groupId}`;await f.owner`UPDATE allura.work_entitlements SET active=true WHERE principal_id=${f.ids.author}`;
  }
  compareSnapshot(await snapshot(f),before);
 }finally{await f.close();}
},20000);

test('work list restricted SQL foreign projects and pooled reuse cannot disclose or write state',async()=>{
 const f=await setup(),app=new SQL(f.appUrl,{max:1});try{
  await f.owner`INSERT INTO allura.work_projects VALUES(${f.scope.groupId},${f.scope.workspaceId},'foreign','other-authority',true),(${f.scope.groupId},${f.scope.workspaceId},'sibling','synthetic-owner',true)`;
  await insert(f,'PRIVATE-foreign','2026-01-03T00:00:00.000001Z','foreign');await insert(f,'PRIVATE-sibling','2026-01-03T00:00:00.000002Z','sibling');
  const before=await snapshot(f),send=gateway({...f,app});
  const p=await page(send,request(f,{limit:'100'}));expect(p.work_items.map(x=>x.id)).toEqual(['Newest','é/tie','a+tie']);
  for(const id of ['foreign','missing']){await outcome(await send(request(f,{project_id:id})),404,'not_found');}
  await expect(scopedTransaction(app,f.identities.viewer,f.scope,'memory:read',tx=>tx`SELECT allura.work_project_map(${f.scope.groupId},${f.scope.workspaceId}::uuid,${project})`)).rejects.toThrow('forbidden');
  await expect(scopedTransaction(app,f.identities.viewer,f.scope,'memory:read',tx=>tx`SELECT allura.list_work_items(${f.scope.groupId},${f.scope.workspaceId}::uuid,${project},NULL,2,NULL,NULL)`)).rejects.toThrow('forbidden');
  for(const query of ['SELECT * FROM allura.work_items','SELECT allura.work_token(now())','SELECT allura.work_snapshot(NULL::allura.work_items)','UPDATE allura.work_projects SET active=false','TRUNCATE allura.work_receipts']){await expect(Promise.resolve(app.unsafe(query))).rejects.toThrow();}
  await f.owner`INSERT INTO allura.workspace_grants(group_id,workspace_id,principal_id,role,issuer) VALUES(${f.scope.groupId},${f.foreignWorkspace},${f.ids.author},'viewer',${f.ids.author})`;
  await f.owner`INSERT INTO allura.work_entitlements VALUES(${f.scope.groupId},${f.foreignWorkspace},${f.ids.author},'work:read',true)`;
  await f.owner`INSERT INTO allura.work_projects VALUES(${f.scope.groupId},${f.foreignWorkspace},'B','synthetic-owner',true)`;
  await outcome(await send(request(f,{workspace_id:f.foreignWorkspace})),404,'not_found');
  expect(await page(send,request(f,{workspace_id:f.foreignWorkspace,project_id:'B'}))).toEqual({work_items:[],has_more:false,next_cursor:null});
  expect((await app`SELECT nullif(current_setting('allura.principal',true),'') AS principal`)[0].principal).toBeNull();
  await expect(Promise.resolve(app`SELECT allura.list_work_items(${f.scope.groupId},${f.scope.workspaceId}::uuid,${project},NULL,2,NULL,NULL)`)).rejects.toThrow('forbidden');
  expect((await send(request(f))).status).toBe(200);compareSnapshot(await snapshot(f),before);
 }finally{await app.close();await f.close();}
});
test('work list concurrent transitions and inserts preserve honest current page semantics without history writes',async()=>{
 const f=await setup();try{
  const send=gateway(f),first=await page(send,request(f,{status:'ready'}));
  await f.owner`INSERT INTO allura.work_entitlements VALUES(${f.scope.groupId},${f.scope.workspaceId},${f.ids.author},'work:write',true)`;
  const transition=new Request(request(f,{},'/api/work-items/a%2Btie/transition').url,{method:'POST',headers:{...Object.fromEntries(request(f).headers),'Content-Type':'application/json',Origin:origin,'Sec-Fetch-Site':'same-origin'},body:JSON.stringify({group_id:f.scope.groupId,workspace_id:f.scope.workspaceId,actor_id:f.ids.author,operation_key:'between-pages',expected_updated_at:token,to_status:'in_progress'})});
  expect((await send(transition)).status).toBe(200);
  await insert(f,'Later-new','2026-01-03T00:00:00.000001Z');await insert(f,'older-new','2026-01-01T00:00:00.000001Z');
  const before=await snapshot(f),second=await page(send,request(f,{status:'ready',cursor:first.next_cursor!}));expect(second.work_items.map(x=>x.id)).toEqual(['older-new']);expect(second.has_more).toBe(false);expect(second.next_cursor).toBeNull();
  expect((await page(send,request(f,{status:'ready'}))).work_items[0]!.id).toBe('Later-new');compareSnapshot(await snapshot(f),before);
  expect((await f.owner`SELECT count(*)::int AS n FROM allura.work_receipts WHERE group_id=${f.scope.groupId}`)[0].n).toBe(1);
 }finally{await f.close();}
});
test('work list response target and service failure bounds never masquerade as a complete board',async()=>{
 const f=await setup();try{
  const send=gateway(f);
  for(let n=0;n<20;n++){await insert(f,'large-'+n,token,project,'ready','x'.repeat(8192));}
  await outcome(await send(request(f,{limit:'100'})),503,'unknown');
  const raw=await listWorkItems(f.app,f.identities.author,f.scope,new URL(request(f,{limit:'100'}).url).search,key,f.ids.author);let excess=Buffer.byteLength(raw)-131072;expect(excess).toBeGreaterThan(0);
  for(let n=0;excess>0;n++){const remove=Math.min(excess,8192);await f.owner`UPDATE allura.work_items SET description=${'x'.repeat(8192-remove)} WHERE group_id=${f.scope.groupId} AND id=${'large-'+n}`;excess-=remove;}
  const exact=await send(request(f,{limit:'100'}));expect(exact.status).toBe(200);expect(Buffer.byteLength(await exact.text())).toBe(131072);
  await f.owner`UPDATE allura.work_items SET description=description||'x' WHERE group_id=${f.scope.groupId} AND id='large-0'`;await outcome(await send(request(f,{limit:'100'})),503,'unknown');
  const before=await snapshot(f);expect((await page(send,request(f,{limit:'1'}))).work_items).toHaveLength(1);
  const base=request(f),fit=base.url+'&unknown=';await outcome(await send(new Request(fit+'x'.repeat(2048-fit.length),{headers:base.headers})),400,'invalid');await outcome(await send(new Request(fit+'x'.repeat(2049-fit.length),{headers:base.headers})),414,'invalid');
  // Loss of the exact mapping store is unknown, not an empty/missing board.
  await f.owner.unsafe('ALTER TABLE allura.work_projects RENAME TO list_map_unavailable');
  try{await outcome(await send(request(f)),503,'unknown');}finally{await f.owner.unsafe('ALTER TABLE allura.list_map_unavailable RENAME TO work_projects');}
  const app=new SQL(f.appUrl,{max:1}),gate=new SQL(process.env.ALLURA_DISPOSABLE_DB_URL!,{max:1}),held=latch(),go=latch();let holding:Promise<unknown>|undefined,reading:Promise<Response>|undefined;
  try{
   const ap=Number((await app`SELECT pg_backend_pid() AS pid`)[0].pid),gp=Number((await gate`SELECT pg_backend_pid() AS pid`)[0].pid);
   holding=gate.begin(async tx=>{await tx`SELECT id FROM allura.work_items WHERE group_id=${f.scope.groupId} AND id='Newest' FOR UPDATE`;held.release();await go.promise;});await held.promise;
   reading=gateway({...f,app})(request(f));await waitFor(f,ap,gp,'backend loss');expect((await f.owner`SELECT pg_terminate_backend(${ap}) AS killed`)[0].killed).toBe(true);await outcome(await reading,503,'unknown');
  }finally{go.release();await holding;await reading;await app.close();await gate.close();}
  const release=latch(),entered=latch();let handles=0;
  const routes=createWorkRoutes(f.app,key).map(r=>({...r,handle:async(c:Parameters<typeof r.handle>[0])=>{const result=await r.handle(c);handles++;if(handles===16){entered.release();}await release.promise;return result;}}));
  const bounded=createGateway({human:f.humanConfig,origin,store:new DatabaseStore(f.app),machineLookup:async()=>null,routes});
  const started=performance.now(),pending=Array.from({length:16},()=>bounded(request(f,{limit:'1'})));
  try{await entered.promise;await outcome(await bounded(request(f,{limit:'1'})),429,'unavailable');const responses=await Promise.all(pending);for(const response of responses){await outcome(response,503,'unknown');}expect(performance.now()-started).toBeGreaterThanOrEqual(4900);expect(performance.now()-started).toBeLessThan(6500);await outcome(await bounded(request(f,{limit:'1'})),429,'unavailable');}finally{release.release();await Promise.all(pending);}
  for(let n=0;n<100;n++){const response=await bounded(request(f,{limit:'1'}));if(response.status===200){break;}expect(response.status).toBe(429);await Bun.sleep(5);}
  expect((await bounded(request(f,{limit:'1'}))).status).toBe(200);compareSnapshot(await snapshot(f),before);
 }finally{await f.close();}
},10000);

test('work list additive migration preserves accepted history and the exact revision eight run bundle',async()=>{
 const pin='b4cacbe68db7b6334ad3b8c29110c867161cec77',target=process.env.ALLURA_DISPOSABLE_DB_URL;
 if(!target||new URL(target).hostname!=='127.0.0.1'||process.env.ALLURA_DISPOSABLE_DB!=='owned-test-container'){throw new Error('Requires owned disposable runner');}
 const root=new URL('../../',import.meta.url).pathname,exported=await mkdtemp(join(tmpdir(),'allura-list-upgrade-')),admin=new SQL(target,{max:1}),database='list_upgrade_'+randomUUID().replaceAll('-',''),hashes:Record<string,string>={};let f:Fixture|undefined,created=false;
 try{
  const archive=Bun.spawnSync(['git','archive',pin,'foundation'],{cwd:root});expect(archive.exitCode).toBe(0);expect(Bun.spawnSync(['tar','-x','-C',exported],{stdin:archive.stdout}).exitCode).toBe(0);
  const files=Bun.spawnSync(['git','ls-tree','-r','--name-only',pin,'foundation'],{cwd:root});expect(files.exitCode).toBe(0);
  for(const path of files.stdout.toString().trim().split('\n')){const original=Bun.spawnSync(['git','show',`${pin}:${path}`],{cwd:root});expect(original.exitCode).toBe(0);const bytes=Buffer.from(await Bun.file(join(exported,path)).arrayBuffer());expect(bytes.equals(original.stdout)).toBe(true);hashes[path]=createHash('sha256').update(bytes).digest('hex');}
  await symlink(join(root,'foundation/node_modules'),join(exported,'foundation/node_modules'));
  await admin.unsafe(`CREATE DATABASE ${database}`);created=true;const url=new URL(target);url.pathname='/'+database;
  const oldFixture=await import(join(exported,'foundation/tests/lifecycle-fixture.ts')) as typeof import('./lifecycle-fixture.ts');
  const oldWork=await import(join(exported,'foundation/src/work-plane.ts')) as typeof import('../src/work-plane.ts');
  const oldRuns=await import(join(exported,'foundation/src/runs.ts')) as typeof import('../src/runs.ts');
  const oldContract=await import(join(exported,'foundation/src/run-contract.ts')) as typeof import('../src/run-contract.ts');
  const targetPin='502578872b72cabbe474ffcf74cef77d47a96f41',targetExport=join(exported,'historical034');
  expect(Bun.spawnSync(['mkdir','-p',targetExport]).exitCode).toBe(0);
  const targetArchive=Bun.spawnSync(['git','archive',targetPin,'foundation'],{cwd:root});expect(targetArchive.exitCode).toBe(0);expect(Bun.spawnSync(['tar','-x','-C',targetExport],{stdin:targetArchive.stdout}).exitCode).toBe(0);
  const targetFiles=Bun.spawnSync(['git','ls-tree','-r','--name-only',targetPin,'foundation'],{cwd:root});expect(targetFiles.exitCode).toBe(0);
  for(const path of targetFiles.stdout.toString().trim().split('\n')){const original=Bun.spawnSync(['git','show',`${targetPin}:${path}`],{cwd:root});expect(original.exitCode).toBe(0);const bytes=Buffer.from(await Bun.file(join(targetExport,path)).arrayBuffer());expect(bytes.equals(original.stdout)).toBe(true);hashes['historical034/'+path]=createHash('sha256').update(bytes).digest('hex');}
  await symlink(join(root,'foundation/node_modules'),join(targetExport,'foundation/node_modules'));
  const currentRuns=await import(join(targetExport,'foundation/src/runs.ts')) as typeof import('../src/runs.ts');
  const historicalContract=await import(join(targetExport,'foundation/src/run-contract.ts')) as typeof import('../src/run-contract.ts'),historicalPersistence=await import(join(targetExport,'foundation/src/persistence.ts')) as typeof import('../src/persistence.ts'),historicalAuth=await import(join(targetExport,'foundation/src/authentication.ts')) as typeof import('../src/authentication.ts'),historicalCore=await import(join(targetExport,'foundation/src/core-api.ts')) as typeof import('../src/core-api.ts');
  f=await oldFixture.fixture('allura-list-upgrade-'+randomUUID(),url.toString());const fx=f;
  expect((await f.owner`SELECT count(*)::int AS n FROM allura.schema_migrations`)[0].n).toBe(33);
  await f.owner`INSERT INTO allura.work_authority VALUES(true,'synthetic-owner')`;
  await f.owner`INSERT INTO allura.work_projects VALUES(${f.scope.groupId},${f.scope.workspaceId},${project},'synthetic-owner',true)`;
  for(const a of ['work:read','work:write']){await f.owner`INSERT INTO allura.work_entitlements VALUES(${f.scope.groupId},${f.scope.workspaceId},${f.ids.author},${a},true)`;}
  await insert(f,'old-item');
  const command={contract:'work-plane-compatibility-v1',command:'transition',group_id:f.scope.groupId,workspace_id:f.scope.workspaceId,actor_id:f.ids.author,operation_key:'genuine-old',expected_updated_at:token,to_status:'in_progress'};
  const accepted=await oldWork.transitionWorkItem(f.app,f.identities.author,f.scope,'old-item',command);
  await f.owner`UPDATE allura.workspace_grants SET role='workspace_admin' WHERE group_id=${f.scope.groupId} AND principal_id=${f.ids.reviewer}`;
  const text='Genuine accepted revision8 evidence',input={operationKey:randomUUID(),definitionId:'local-evidence-handoff',definitionRevision:8,goal:'Additive read migration',reviewerPrincipalId:f.ids.reviewer,artifact:{text,expectedSha256:createHash('sha256').update(text).digest('hex'),sourceRevision:null}};
  const started=await oldRuns.startRun(f.app,f.identities.author,f.scope,input),runId=JSON.parse(started).runId,advance={runId,expectedRevision:1,operationKey:randomUUID()},paused=await oldRuns.advanceRun(f.app,f.identities.author,f.scope,advance);
  const tables=['work_items','work_events','work_receipts','events','semantic_versions','proposal_state','run_definitions','run_records','run_state','run_steps','run_journal','run_operation_receipts','run_effect_receipts','run_approval_requests','run_approval_decisions','run_handoff_links'];
  const snap=()=>Promise.all(tables.map(async t=>[...await fx.owner.unsafe(`SELECT to_jsonb(t)::text AS row FROM allura.${t} t ORDER BY 1`)]));
  const before=await snap(),definition=await oldContract.runDefinition();expect(definition).toEqual(await historicalContract.runDefinition());
  expect(JSON.stringify(definition)).toContain('fdb1a89fa08178acc34f17cf3fd30eec76cda240fc003377f6dfcdf37e7b6d84');
  await historicalPersistence.migrate(f.owner);expect((await f.owner`SELECT count(*)::int AS n FROM allura.schema_migrations`)[0].n).toBe(34);expect(await snap()).toEqual(before);
  expect(await oldWork.transitionWorkItem(f.app,f.identities.author,f.scope,'old-item',command)).toBe(accepted);
  const identity=historicalAuth.authenticateHuman({assertion:f.jwt('author')},f.humanConfig),reviewer=historicalAuth.authenticateHuman({assertion:f.jwt('reviewer')},f.humanConfig);
  expect(await currentRuns.startRun(f.app,identity,f.scope,input)).toBe(started);expect(await currentRuns.advanceRun(f.app,identity,f.scope,advance)).toBe(paused);
  const historicalGateway=historicalCore.createCoreGateway(f.app,f.humanConfig,origin,key,provider,undefined,undefined,'human',undefined,'work-plane-compatibility-v1');
  const p=await page(historicalGateway,request(f));expect(p.work_items.map(x=>x.id)).toEqual(['old-item']);expect(p.work_items[0]!.updated_at).toBe(JSON.parse(accepted).work_item.updated_at);expect(await snap()).toEqual(before);
  const approval=JSON.parse((await f.owner`SELECT request_text FROM allura.run_approval_requests WHERE run_id=${runId}::uuid`)[0].request_text);
  await currentRuns.decideRun(f.app,reviewer,f.scope,{runId,expectedRevision:3,operationKey:randomUUID(),approvalRequestId:approval.id,reviewedEvidenceDigest:approval.evidenceDigest,decision:'approve',rationale:'Current exact review'});
  await currentRuns.resumeRun(f.app,identity,f.scope,{runId,expectedRevision:4,operationKey:randomUUID()});
  const view=await currentRuns.inspectRun(f.app,identity,f.scope,new URLSearchParams({group_id:f.scope.groupId,workspace_id:f.scope.workspaceId,run_id:runId}));expect(view.completionVerified).toBe(true);expect(view.doctor).not.toContain('definition_drift');
  console.log(JSON.stringify({workListAdditiveUpgrade:{pin,archiveSha256:createHash('sha256').update(archive.stdout).digest('hex'),hashes,definition,tables,beforeSha256:createHash('sha256').update(JSON.stringify(before)).digest('hex'),oldPausedReceiptSha256:createHash('sha256').update(paused).digest('hex'),historical034RevisionEightExecutable:true,targetPin}}));
 }finally{
  await f?.close();try{if(created){await admin.unsafe(`DROP DATABASE ${database} WITH (FORCE)`);expect(await admin`SELECT datname FROM pg_database WHERE datname=${database}`).toHaveLength(0);}}finally{await admin.close();}
  for(const [p,h] of Object.entries(hashes)){expect(createHash('sha256').update(new Uint8Array(await Bun.file(join(exported,p)).arrayBuffer())).digest('hex')).toBe(h);}
  await rm(exported,{recursive:true,force:true});expect(await Bun.file(join(exported,'foundation/src/persistence.ts')).exists()).toBe(false);console.log(JSON.stringify({workListExportRemoved:exported}));
 }
},30000);
