import { test, expect } from 'bun:test';
import { SQL } from 'bun';
import { randomUUID, generateKeyPairSync, sign, createHash, randomBytes } from 'node:crypto';
import { fixture } from './lifecycle-fixture.ts';
import { createCoreGateway } from '../src/core-api.ts';
import { createGateway } from '../src/gateway.ts';
import { createWorkRoutes } from '../src/work-plane-api.ts';
import { parseWorkTransition } from '../src/work-plane-contract.ts';
import { DatabaseStore, scopedTransaction } from '../src/persistence.ts';
import { authenticateMachine } from '../src/authentication.ts';
import { EMBEDDING } from '../src/embedding.ts';


async function empty(f:Fixture){expect((await f.owner`SELECT count(*)::int AS n FROM allura.work_receipts WHERE group_id=${f.scope.groupId}`)[0].n).toBe(0);}
async function outcome(response:Response,status:number,code:string){expect(response.status).toBe(status);expect(await response.json()).toEqual({outcome:code});expect(response.headers.get('cache-control')).toBe('no-store');expect(response.headers.get('x-content-type-options')).toBe('nosniff');}
test('work HTTP opaque path segments decode once and never alias malformed or literal percent IDs',async()=>{
 const f=await setup();try{
  const send=gateway(f);
  const ids=['a/b','a%2Fb',' A é 🧠 ','MiXeD','mixed','é'.repeat(128),'slash\\back'];
  for(const id of ids){await f.owner`INSERT INTO allura.work_items(group_id,workspace_id,project_id,id,title,status,created_at,updated_at) VALUES(${f.scope.groupId},${f.scope.workspaceId},'Project:Alpha',${id},${id},'ready',${token}::timestamptz,${token}::timestamptz)`;}
  for(const id of ids){const r=await send(request(f,`/api/work-items/${encodeURIComponent(id)}`,null));expect(r.status).toBe(200);expect((await r.json() as {work_item:{id:string}}).work_item.id).toBe(id);}
  for(const id of ['%','%GG','%C0%AF','%ED%A0%80','%F4%90%80%80','%00','%1f','%7f','é'.repeat(129),'']){await outcome(await send(request(f,`/api/work-items/${id}`,null)),400,'invalid');}
  for(const path of ['/api/work-items/a/b','/api/work-items/unknown','/api/work-items/:id','/api/work-items/%25252F']){await outcome(await send(request(f,path,null)),404,'not_found');}
  await empty(f);
 }finally{await f.close();}
});
test('work HTTP strict header selectors flat streamed body and fatal UTF8 reject without effects',async()=>{
 const f=await setup();try{
  const send=gateway(f),base=request(f);
  for(const header of ['', 'v1','work-plane-compatibility-v2','work-plane-compatibility-v1, work-plane-compatibility-v1']){await outcome(await send(request(f,undefined,body(f),{'X-Allura-Work-Contract':header})),400,'invalid');}
  const missing=request(f);missing.headers.delete('X-Allura-Work-Contract');await outcome(await send(missing),400,'invalid');
  for(const query of ['',`group_id=${f.scope.groupId}`,`group_id=${f.scope.groupId}&workspace_id=${f.scope.workspaceId}&unknown=x`,`group_id=${f.scope.groupId}&workspace_id=${f.scope.workspaceId}&group_id=${f.scope.groupId}`]){await outcome(await send(new Request(base.url.split('?')[0]+'?'+query,{method:'POST',headers:base.headers,body:JSON.stringify(body(f))})),400,'invalid');}
  for(const change of [{workspace_id:f.foreignWorkspace},{group_id:'allura-other'},{contract:'work-plane-compatibility-v1'},{command:'transition'},{expected_updated_at:'2026-01-02T03:04:05.123Z'},{evidence_id:'secret'},{reason:'x'.repeat(2049)},{reason:'\0'}]){await outcome(await send(request(f,undefined,body(f,change))),400,'invalid');}
  await outcome(await send(request(f,undefined,body(f,{actor_id:f.ids.reviewer}))),403,'forbidden');
  const raw=JSON.stringify(body(f));
  const cases=[raw.slice(0,-1)+',"operation_\\u006bey":"other"}',raw.slice(0,-1)+',"reason":null,"\\u0072eason":null}','\ufeff'+raw,'null','[]','{',raw.replace('"in_progress"','{}'),raw.replace('"in_progress"','false')];
  for(const source of cases){const bytes=Buffer.from(source);let at=0;const stream=new ReadableStream<Uint8Array>({pull(c){if(at<bytes.length){c.enqueue(bytes.subarray(at,++at));}else{c.close();}}},{highWaterMark:0});await outcome(await send(new Request(base.url,{method:'POST',headers:base.headers,body:stream})),400,'invalid');}
  for(const invalid of [[0x80],[0xc0,0xaf],[0xe2,0x82],[0xed,0xa0,0x80]]){await outcome(await send(new Request(base.url,{method:'POST',headers:base.headers,body:Buffer.concat([Buffer.from('{"reason":"'),Buffer.from(invalid),Buffer.from('"}')])})),400,'invalid');}
  await outcome(await send(new Request(base.url,{method:'POST',headers:base.headers,body:' '.repeat(65537)})),413,'invalid');
  await empty(f);
  const accepted=await send(new Request(base.url,{method:'POST',headers:base.headers,body:JSON.stringify(body(f,{reason:' Exact é\r\n'}),null,2)}));expect(accepted.status).toBe(200);
 }finally{await f.close();}
});
test('work HTTP denies forged mixed org unentitled revoked and machine only identities before body',async()=>{
 const f=await setup();try{
  const send=gateway(f);
  for(const [headers,status,code] of [
   [{'Cf-Access-Jwt-Assertion':'forged'},401,'unauthenticated'],[{'Cf-Access-Jwt-Assertion':''},401,'unauthenticated'],
   [{Authorization:'Bearer synthetic-device-worker-owner-selected'},401,'unauthenticated'],
   [{Cookie:`CF_Authorization=${f.jwt('author')}`,Authorization:'Bearer synthetic'},401,'unauthenticated'],
   [{Origin:'https://foreign.invalid'},403,'forbidden'],[{'Sec-Fetch-Site':'cross-site'},403,'forbidden'],
   ...(['org','viewer','curator'] as const).map(n=>[{'Cf-Access-Jwt-Assertion':f.jwt(n)},403,'forbidden'])
  ] as [Record<string,string>,number,string][]){const req=request(f,undefined,body(f),headers);await outcome(await send(req),status,code);expect(req.bodyUsed).toBe(false);}
  await f.owner`UPDATE allura.identity_bindings SET active=false WHERE principal_id=${f.ids.author}`;
  const unbound=request(f);await outcome(await send(unbound),403,'forbidden');expect(unbound.bodyUsed).toBe(false);
  await f.owner`UPDATE allura.identity_bindings SET active=true WHERE principal_id=${f.ids.author}`;
  await f.owner`UPDATE allura.work_entitlements SET active=false WHERE principal_id=${f.ids.author} AND action='work:write'`;
  const revoked=request(f);await outcome(await send(revoked),403,'forbidden');expect(revoked.bodyUsed).toBe(false);
  expect((await send(request(f,`/api/work-items/${encodeURIComponent(item)}`,null))).status).toBe(200);
  const disabled=createCoreGateway(f.app,f.humanConfig,origin,new Uint8Array(32).fill(7),provider);
  const machine=createCoreGateway(f.app,undefined,origin,new Uint8Array(32).fill(7),provider,undefined,undefined,'machine-only',undefined,'work-plane-compatibility-v1');
  for(const g of [disabled,machine]){const req=request(f);await outcome(await g(req),404,'not_found');expect(req.bodyUsed).toBe(false);}
  await empty(f);
 }finally{await f.close();}
});
test('work HTTP concurrent keys stale graph terminal and rollback outcomes preserve private history',async()=>{
 const f=await setup();try{
  const send=gateway(f);
  for(const change of [{to_status:'ready'},{to_status:'done'},{expected_updated_at:'2026-02-30T03:04:05.123456Z'}]){await outcome(await send(request(f,undefined,body(f,change))),400,'invalid');}
  await outcome(await send(request(f,undefined,body(f,{expected_updated_at:'2026-01-02T03:04:05.123457Z',to_status:'done'}))),409,'conflict');
  await f.owner.unsafe(`CREATE FUNCTION allura.http_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'private SQL path reason token'; END $$;CREATE CONSTRAINT TRIGGER http_fault AFTER INSERT ON allura.work_receipts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION allura.http_fault()`);
  try{await outcome(await send(request(f)),500,'failed');await empty(f);}finally{await f.owner.unsafe('DROP TRIGGER http_fault ON allura.work_receipts;DROP FUNCTION allura.http_fault()');}
  const twins=await Promise.all([send(request(f)),send(request(f))]);expect(twins.map(r=>r.status)).toEqual([200,200]);const raw=await twins[0]!.text();expect(await twins[1]!.text()).toBe(raw);
  for(const change of [{reason:'different private'},{to_status:'backlog'},{expected_updated_at:'2026-01-02T03:04:05.123457Z'}]){await outcome(await send(request(f,undefined,body(f,change))),409,'conflict');}
  const x=JSON.parse(raw).work_item;
  const contenders=await Promise.all([send(request(f,undefined,body(f,{operation_key:'contender1',expected_updated_at:x.updated_at,to_status:'blocked'}))),send(request(f,undefined,body(f,{operation_key:'contender2',expected_updated_at:x.updated_at,to_status:'in_review'})))]);expect(contenders.map(r=>r.status).sort()).toEqual([200,409]);
  const current=await (await send(request(f,`/api/work-items/${encodeURIComponent(item)}`,null))).json() as {work_item:{updated_at:string}};
  const cancelled=await send(request(f,undefined,body(f,{operation_key:'cancel',expected_updated_at:current.work_item.updated_at,to_status:'cancelled'})));expect(cancelled.status).toBe(200);const terminal=await cancelled.json() as {work_item:{updated_at:string;completed_at:string}};expect(terminal.work_item.completed_at).toBe(terminal.work_item.updated_at);
  await outcome(await send(request(f,undefined,body(f,{operation_key:'reopen',expected_updated_at:terminal.work_item.updated_at}))),400,'invalid');
  expect(await (await send(request(f))).text()).toBe(raw);
  expect((await f.owner`SELECT count(*)::int AS n FROM allura.work_events WHERE group_id=${f.scope.groupId}`)[0].n).toBe(3);
 }finally{await f.close();}
});


function revocations(f:Fixture){return [
 ['principals','id',f.ids.author,'active=false','active=true'],
 ['identity_bindings','principal_id',f.ids.author,'active=false','active=true'],
 ['memberships','principal_id',f.ids.author,'active=false','active=true'],
 ['workspace_grants','principal_id',f.ids.author,'active=false','active=true'],
 ['work_entitlements','principal_id',f.ids.author,'active=false','active=true'],
 ['tenants','group_id',f.scope.groupId,'active=false','active=true'],
 ['workspaces','id',f.scope.workspaceId,'locked=true','locked=false'],
 ];}
function latch(){let release!:()=>void;const promise=new Promise<void>(r=>{release=r;});return {promise,release};}
async function waitFor(f:Fixture,waiter:number,blocker:number){
 const end=Date.now()+1500;while(Date.now()<end){if((await f.owner`SELECT ${blocker}::int=ANY(pg_blocking_pids(${waiter}::int)) AS waiting`)[0].waiting){expect(waiter).not.toBe(blocker);console.log(JSON.stringify({workHttpWait:{waiter,blocker}}));return;}await Bun.sleep(5);}throw new Error('attributable HTTP wait absent');
}
test('work HTTP current base authority and entitlement revocation serialize both attributable lock orders',async()=>{
 const f=await setup();try{
  for(const [table,column,selector,disable,enable] of revocations(f)){
   const where=`${column}='${selector}'`;
   const revoke=new SQL(process.env.ALLURA_DISPOSABLE_DB_URL!,{max:1}),app=new SQL(f.appUrl,{max:1});const held=latch(),go=latch();let revocation:Promise<unknown>|undefined,operation:Promise<Response>|undefined;
   try{
    const rp=Number((await revoke`SELECT pg_backend_pid() AS pid`)[0].pid),ap=Number((await app`SELECT pg_backend_pid() AS pid`)[0].pid);
    revocation=revoke.begin(async tx=>{await tx.unsafe(`UPDATE allura.${table} SET ${disable} WHERE ${where}`);held.release();await go.promise;});await held.promise;
    operation=gateway({...f,app})(request(f));await waitFor(f,ap,rp);go.release();await revocation;await outcome(await operation,403,'forbidden');await empty(f);
   }finally{go.release();await revocation;await operation;await app.close();await revoke.close();await f.owner.unsafe(`UPDATE allura.${table} SET ${enable} WHERE ${where}`);}
  }
  for(const [table,column,selector,disable,enable] of revocations(f)){
   const where=`${column}='${selector}'`;
   const gate=new SQL(process.env.ALLURA_DISPOSABLE_DB_URL!,{max:1}),revoke=new SQL(process.env.ALLURA_DISPOSABLE_DB_URL!,{max:1}),app=new SQL(f.appUrl,{max:1});const held=latch(),go=latch();let barrier:Promise<unknown>|undefined,operation:Promise<Response>|undefined,revocation:Promise<unknown>|undefined;
   try{
    const gp=Number((await gate`SELECT pg_backend_pid() AS pid`)[0].pid),rp=Number((await revoke`SELECT pg_backend_pid() AS pid`)[0].pid),ap=Number((await app`SELECT pg_backend_pid() AS pid`)[0].pid);
    await f.owner.unsafe(`CREATE FUNCTION allura.http_wait() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(131304); RETURN NEW; END $$;CREATE TRIGGER http_wait BEFORE UPDATE ON allura.work_items FOR EACH ROW EXECUTE FUNCTION allura.http_wait()`);
    const current=await (await gateway(f)(request(f,`/api/work-items/${encodeURIComponent(item)}`,null))).json() as {work_item:{updated_at:string;status:string}};
    barrier=gate.begin(async tx=>{await tx`SELECT pg_advisory_xact_lock(131304)`;held.release();await go.promise;});await held.promise;
    operation=gateway({...f,app})(request(f,undefined,body(f,{operation_key:'ordered-'+table,expected_updated_at:current.work_item.updated_at,to_status:current.work_item.status==='in_progress'?'blocked':'in_progress'})));
    await waitFor(f,ap,gp);revocation=revoke.unsafe(`UPDATE allura.${table} SET ${disable} WHERE ${where}`).then(()=>undefined);await waitFor(f,rp,ap);go.release();await barrier;await revocation;
    const response=await operation;expect([200,403]).toContain(response.status);
    expect((await f.owner`SELECT count(*)::int AS n FROM allura.work_receipts WHERE group_id=${f.scope.groupId} AND operation_key=${'ordered-'+table}`)[0].n).toBe(1);
    await outcome(await gateway(f)(request(f)),403,'forbidden');
   }finally{go.release();await barrier;await operation;await revocation;await f.owner.unsafe('DROP TRIGGER IF EXISTS http_wait ON allura.work_items;DROP FUNCTION IF EXISTS allura.http_wait()');await f.owner.unsafe(`UPDATE allura.${table} SET ${enable} WHERE ${where}`);await app.close();await revoke.close();await gate.close();}
  }
 }finally{await f.close();}
},20000);
test('work HTTP backend termination is unknown and capacity preserves exact authorized replay',async()=>{
 const f=await setup(),app=new SQL(f.appUrl,{max:1}),gate=new SQL(process.env.ALLURA_DISPOSABLE_DB_URL!,{max:1});const held=latch(),go=latch();let barrier:Promise<unknown>|undefined,operation:Promise<Response>|undefined;
 try{
  const send=gateway({...f,app}),ap=Number((await app`SELECT pg_backend_pid() AS pid`)[0].pid),gp=Number((await gate`SELECT pg_backend_pid() AS pid`)[0].pid);
  await f.owner.unsafe(`CREATE FUNCTION allura.http_kill() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(131305); RETURN NEW; END $$;CREATE TRIGGER http_kill AFTER INSERT ON allura.work_events FOR EACH ROW EXECUTE FUNCTION allura.http_kill()`);
  barrier=gate.begin(async tx=>{await tx`SELECT pg_advisory_xact_lock(131305)`;held.release();await go.promise;});await held.promise;operation=send(request(f));await waitFor(f,ap,gp);
  expect((await f.owner`SELECT pg_terminate_backend(${ap}) AS killed`)[0].killed).toBe(true);await outcome(await operation,503,'unknown');go.release();await barrier;await empty(f);
  await f.owner.unsafe('DROP TRIGGER http_kill ON allura.work_events;DROP FUNCTION allura.http_kill()');
  const normal=gateway(f),reply=await normal(request(f));expect(reply.status).toBe(200);const raw=await reply.text();
  await scopedTransaction(f.app,f.identities.author,f.scope,'memory:read',async tx=>{
   let x=JSON.parse(raw).work_item;
   for(let n=1;n<1024;n++){const input=parseWorkTransition({...body(f,{operation_key:'cap-'+n,expected_updated_at:x.updated_at,to_status:x.status==='in_progress'?'blocked':'in_progress'}),contract:'work-plane-compatibility-v1',command:'transition'});const [next]=await tx`SELECT allura.transition_work_item(${f.scope.groupId},${f.scope.workspaceId},${item},${input}::jsonb) AS raw`;x=JSON.parse(next.raw).work_item;}
   await tx.unsafe('SET CONSTRAINTS ALL IMMEDIATE');
  });
  const current=await (await normal(request(f,`/api/work-items/${encodeURIComponent(item)}`,null))).json() as {work_item:{updated_at:string;status:string}};
  await outcome(await normal(request(f,undefined,body(f,{operation_key:'overflow',expected_updated_at:current.work_item.updated_at,to_status:current.work_item.status==='in_progress'?'blocked':'in_progress'}))),503,'capacity');
  expect(await (await normal(request(f))).text()).toBe(raw);expect((await f.owner`SELECT count(*)::int AS n FROM allura.work_receipts WHERE group_id=${f.scope.groupId}`)[0].n).toBe(1024);
 }finally{go.release();await barrier;await operation;await f.owner.unsafe('DROP TRIGGER IF EXISTS http_kill ON allura.work_events;DROP FUNCTION IF EXISTS allura.http_kill()');await app.close();await gate.close();await f.close();}
},20000);
test('work HTTP loopback response loss after commit reconciles in a fresh server process exactly once',async()=>{
 const f=await setup();let child:ReturnType<typeof Bun.spawn>|undefined;
 const script=`import {SQL} from 'bun';import {createPublicKey} from 'node:crypto';import {createCoreGateway} from './src/core-api.ts';import {EMBEDDING} from './src/embedding.ts';const p=JSON.parse(process.env.WORK_HTTP_FIXTURE);const db=new SQL(p.url,{max:2});const g=createCoreGateway(db,{issuer:p.issuer,audience:'fixture',keys:new Map([['key',createPublicKey(p.key)]])},p.origin,new Uint8Array(32).fill(7),{identity:EMBEDDING,embed:async()=>{throw new Error('unused');}},undefined,undefined,'human',undefined,'work-plane-compatibility-v1');const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch:async r=>{const reply=await g(r);if(p.lose){if(reply.status!==200){throw new Error('commit not established');}server.stop(true);}return reply;}});console.log(server.port);process.on('SIGTERM',async()=>{server.stop(true);await db.close();process.exit(0);});`;
 async function start(lose:boolean){
  child=Bun.spawn([process.execPath,'-e',script],{env:{...process.env,WORK_HTTP_FIXTURE:JSON.stringify({url:f.appUrl,issuer:f.humanConfig.issuer,key:f.humanConfig.keys.get('key')!.export({type:'spki',format:'pem'}),origin,lose})},stdout:'pipe',stderr:'pipe'});
  const reader=(child.stdout as ReadableStream<Uint8Array>).getReader();const first=await reader.read();reader.releaseLock();const port=Number(new TextDecoder().decode(first.value).trim());expect(port).toBeGreaterThan(0);return `http://127.0.0.1:${port}`;
 }
 async function stop(){if(child){child.kill('SIGTERM');expect(await child.exited).toBe(0);expect(await new Response(child.stderr as ReadableStream<Uint8Array>).text()).toBe('');child=undefined;}}
 try{
  const lostOrigin=await start(true),req=request(f),send=(host:string)=>new Request(req.url.replace(origin,host),{method:'POST',headers:req.headers,body:JSON.stringify(body(f))});
  await expect(fetch(send(lostOrigin))).rejects.toThrow();await stop();
  const rows=await f.owner`SELECT response_text FROM allura.work_receipts WHERE group_id=${f.scope.groupId}`;expect(rows).toHaveLength(1);const stored=rows[0].response_text;
  const freshOrigin=await start(false),reply=await fetch(send(freshOrigin));expect(reply.status).toBe(200);expect(await reply.text()).toBe(stored);await stop();
  expect((await f.owner`SELECT count(*)::int AS n FROM allura.work_events WHERE group_id=${f.scope.groupId}`)[0].n).toBe(1);expect((await f.owner`SELECT count(*)::int AS n FROM allura.work_receipts WHERE group_id=${f.scope.groupId}`)[0].n).toBe(1);
 }finally{await stop();await f.close();}
},20000);


test('work HTTP exact signed expiry and postcommit revocation deny disclosure without undoing history',async()=>{
 const f=await setup();try{
  const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048}),human={...f.humanConfig,keys:new Map([['key',publicKey]])};
  function jwt(subject:string,exp:number){const now=Math.floor(Date.now()/1000),data=[{alg:'RS256',kid:'key'},{iss:human.issuer,aud:human.audience,sub:subject,email:'synthetic@example.invalid',type:'app',iat:now-60,exp}].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');return data+'.'+sign('RSA-SHA256',Buffer.from(data),privateKey).toString('base64url');}
  const send=createCoreGateway(f.app,human,origin,new Uint8Array(32).fill(7),provider,undefined,undefined,'human',undefined,'work-plane-compatibility-v1');
  const expired=request(f,undefined,body(f),{'Cf-Access-Jwt-Assertion':jwt(f.scope.groupId+':author',Math.floor(Date.now()/1000)-1)});await outcome(await send(expired),401,'unauthenticated');expect(expired.bodyUsed).toBe(false);
  const unbound=request(f,undefined,body(f),{'Cf-Access-Jwt-Assertion':jwt('unbound',Math.floor(Date.now()/1000)+60)});await outcome(await send(unbound),403,'forbidden');expect(unbound.bodyUsed).toBe(false);await empty(f);
  for(const type of ['entitlement','expiry'] as const){
   const exp=Math.floor(Date.now()/1000)+2;
   const routes=createWorkRoutes(f.app,new Uint8Array(32).fill(7)).map(route=>({...route,handle:async(c:Parameters<typeof route.handle>[0])=>{
    const result=await route.handle(c);
    if(type==='entitlement'){await f.owner`UPDATE allura.work_entitlements SET active=false WHERE principal_id=${f.ids.author} AND action='work:read'`;}
    else{await Bun.sleep(Math.max(0,exp*1000-Date.now()+10));}
    return result;
   }}));
   const wrapped=createGateway({human,origin,store:new DatabaseStore(f.app),machineLookup:async()=>null,routes});
   const response=await wrapped(request(f,undefined,body(f),{'Cf-Access-Jwt-Assertion':jwt(f.scope.groupId+':author',exp)}));
   await outcome(response,type==='entitlement'?403:401,type==='entitlement'?'forbidden':'unauthenticated');
   expect((await f.owner`SELECT count(*)::int AS n FROM allura.work_receipts WHERE group_id=${f.scope.groupId}`)[0].n).toBe(1);
   await f.owner`UPDATE allura.work_entitlements SET active=true WHERE principal_id=${f.ids.author}`;
  }
 }finally{await f.close();}
},10000);
test('work HTTP unsupported mapping foreign scope and pooled current reads remain private',async()=>{
 const f=await setup(),app=new SQL(f.appUrl,{max:1});try{
  const send=gateway({...f,app}),path=`/api/work-items/${encodeURIComponent(item)}`;
  await f.owner`UPDATE allura.work_projects SET active=false WHERE group_id=${f.scope.groupId}`;
  for(const req of [request(f),request(f,path,null)]){await outcome(await send(req),404,'not_found');}
  await f.owner`UPDATE allura.work_projects SET active=true WHERE group_id=${f.scope.groupId}`;
  await f.owner`INSERT INTO allura.work_projects VALUES(${f.scope.groupId},${f.scope.workspaceId},'foreign','other-authority',true)`;
  await f.owner`INSERT INTO allura.work_items(group_id,workspace_id,project_id,id,title,status,created_at,updated_at) VALUES(${f.scope.groupId},${f.scope.workspaceId},'foreign','foreign-item','PRIVATE foreign','ready',${token}::timestamptz,${token}::timestamptz)`;
  await outcome(await send(request(f,'/api/work-items/foreign-item',null)),404,'not_found');
  await outcome(await send(request(f,'/api/work-items/missing',null)),404,'not_found');
  await f.owner`INSERT INTO allura.workspace_grants(group_id,workspace_id,principal_id,role,issuer) VALUES(${f.scope.groupId},${f.foreignWorkspace},${f.ids.author},'viewer',${f.ids.author})`;
  await f.owner`INSERT INTO allura.work_entitlements VALUES(${f.scope.groupId},${f.foreignWorkspace},${f.ids.author},'work:read',true)`;
  const original=request(f,path,null),foreign=new Request(original.url.replace(f.scope.workspaceId,f.foreignWorkspace),{headers:original.headers});
  expect((await send(original)).status).toBe(200);await outcome(await send(foreign),404,'not_found');
  expect((await app`SELECT nullif(current_setting('allura.principal',true),'') AS principal`)[0].principal).toBeNull();
  await expect(Promise.resolve(app`SELECT allura.read_work_item(${f.scope.groupId},${f.scope.workspaceId},${item})`)).rejects.toThrow('forbidden');
  expect((await send(request(f,path,null))).status).toBe(200);await empty(f);
 }finally{await app.close();await f.close();}
});

test('work HTTP authenticated device worker delegated and selected clients cannot inherit work entitlements',async()=>{
  const f=await setup();
  try{
    const send=gateway(f);
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
      expect(identity.kind).not.toBe('human');
      const req=request(f);req.headers.delete('Cf-Access-Jwt-Assertion');req.headers.set('Authorization','Bearer '+secret);
      await outcome(await send(req),401,'unauthenticated');expect(req.bodyUsed).toBe(false);

    }
    await empty(f);
  }finally{await f.close();}
});


const origin='https://work.invalid',item='Legacy:Work/é.A',token='2026-01-02T03:04:05.123456Z';
type Fixture=Awaited<ReturnType<typeof fixture>>;
async function setup(){
 const f=await fixture(`allura-work-http-${randomUUID()}`);
 await f.owner`INSERT INTO allura.work_authority(singleton,id) VALUES(true,'synthetic-owner') ON CONFLICT DO NOTHING`;
 await f.owner`INSERT INTO allura.work_projects(group_id,workspace_id,id,authority_instance_id) VALUES(${f.scope.groupId},${f.scope.workspaceId},'Project:Alpha','synthetic-owner')`;
 for(const name of ['author','reviewer'] as const){for(const action of ['work:read','work:write']){await f.owner`INSERT INTO allura.work_entitlements VALUES(${f.scope.groupId},${f.scope.workspaceId},${f.ids[name]},${action},true)`;}}
 await f.owner`INSERT INTO allura.work_items(group_id,workspace_id,project_id,id,title,status,created_at,updated_at) VALUES(${f.scope.groupId},${f.scope.workspaceId},'Project:Alpha',${item},'Synthetic private work','ready',${token}::timestamptz,${token}::timestamptz)`;
 return f;
}
const provider={identity:EMBEDDING,embed:async():Promise<number[]>=>{throw new Error('work must not embed');}};
function gateway(f:Fixture){
 // Extra trailing capability is deliberately ignored by the accepted baseline;
 // the first RED must be HTTP404, not an absent import or type failure.
 return Reflect.apply(createCoreGateway,undefined,[f.app,f.humanConfig,origin,new Uint8Array(32).fill(7),provider,undefined,undefined,'human',undefined,'work-plane-compatibility-v1']) as (r:Request)=>Promise<Response>;
}
function body(f:Fixture,overrides:Record<string,unknown>={}){return {group_id:f.scope.groupId,workspace_id:f.scope.workspaceId,actor_id:f.ids.author,operation_key:'first',expected_updated_at:token,to_status:'in_progress',...overrides};}
function request(f:Fixture,path=`/api/work-items/${encodeURIComponent(item)}/transition`,value:unknown=body(f),headers:Record<string,string>={}){
 const get=value===null;
 return new Request(`${origin}${path}?group_id=${f.scope.groupId}&workspace_id=${f.scope.workspaceId}`,{method:get?'GET':'POST',headers:{'Cf-Access-Jwt-Assertion':f.jwt('author'),'X-Allura-Work-Contract':'work-plane-compatibility-v1',Origin:origin,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json',...headers},...(get?{}:{body:JSON.stringify(value)})});
}
test('work HTTP service refuses original principal binding drift even when restored before disclosure',async()=>{
 const f=await setup();
 try{
  const routes=createWorkRoutes(f.app,new Uint8Array(32).fill(7)).map(route=>({...route,handle:async (c:Parameters<typeof route.handle>[0])=>{
   await f.owner`UPDATE allura.identity_bindings SET principal_id=${f.ids.reviewer} WHERE issuer=${f.humanConfig.issuer} AND subject=${f.scope.groupId+':author'}`;
   try{return await route.handle(c);}finally{await f.owner`UPDATE allura.identity_bindings SET principal_id=${f.ids.author} WHERE issuer=${f.humanConfig.issuer} AND subject=${f.scope.groupId+':author'}`;}
  }}));
  const send=createGateway({human:f.humanConfig,origin,store:new DatabaseStore(f.app),machineLookup:async()=>null,routes});
  const response=await send(request(f,`/api/work-items/${encodeURIComponent(item)}`,null));
  expect(response.status).toBe(403);expect(await response.json()).toEqual({outcome:'forbidden'});
  expect((await f.owner`SELECT count(*)::int AS n FROM allura.work_receipts WHERE group_id=${f.scope.groupId}`)[0].n).toBe(0);
 }finally{await f.close();}
});

test('work plane signed HTTP transition preserves opaque ID receipt bytes and current read',async()=>{
 const f=await setup();
 try{
  const send=gateway(f);
  expect((await f.app`SELECT current_user AS role`)[0].role).toBe('allura_app');
  const control=await send(request(f,'/api/dashboard/context',null));expect(control.status).toBe(200);expect((await control.json() as {principalId:string}).principalId).toBe(f.ids.author);
  expect((await send(request(f,'/api/dashboard/context',null,{'Cf-Access-Jwt-Assertion':f.jwt('org')}))).status).toBe(403);
  expect((await send(request(f,'/api/work-items/<encoded-id>',null))).status).toBe(404);
  expect((await send(request(f,'/api/work-items',null))).status).toBe(400);
  const reply=await send(request(f));expect(reply.status).toBe(200);
  const raw=await reply.text(),accepted=JSON.parse(raw);
  expect(accepted.work_item.id).toBe(item);expect(accepted.operation_receipt.before_updated_at).toBe(token);
  expect(accepted.work_item.updated_at).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/);
  expect(reply.headers.get('cache-control')).toBe('no-store');expect(reply.headers.get('x-content-type-options')).toBe('nosniff');
  expect((await f.owner`SELECT response_text FROM allura.work_receipts WHERE group_id=${f.scope.groupId}`)[0].response_text).toBe(raw);
  expect(await (await send(request(f))).text()).toBe(raw);
  const later=await send(request(f,undefined,body(f,{operation_key:'later',expected_updated_at:accepted.work_item.updated_at,to_status:'blocked'})));expect(later.status).toBe(200);
  const current=await send(request(f,`/api/work-items/${encodeURIComponent(item)}`,null));expect(current.status).toBe(200);expect((await current.json() as {work_item:unknown}).work_item).toEqual((await later.json() as {work_item:unknown}).work_item);
  expect(await (await send(request(f))).text()).toBe(raw);
  expect((await f.owner`SELECT count(*)::int AS n FROM allura.work_events WHERE group_id=${f.scope.groupId}`)[0].n).toBe(2);
  expect((await f.owner`SELECT count(*)::int AS n FROM allura.work_receipts WHERE group_id=${f.scope.groupId}`)[0].n).toBe(2);
 }finally{await f.close();}
});
