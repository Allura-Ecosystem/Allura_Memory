import {test,expect} from 'bun:test';
import {randomBytes,createHash} from 'node:crypto';
import {createGateway} from '../src/gateway.ts';
import {type AuthorityRecord} from '../src/authority.ts';
import {type MachineCredential} from '../src/authentication.ts';
import {type SQL} from 'bun';
import {createCoreGateway} from '../src/core-api.ts';
import {createDashboardHandler} from '../src/dashboard-server.ts';
import {createMcpRoutes} from '../src/mcp-api.ts';
import {EMBEDDING} from '../src/embedding.ts';
import {parseCoreConfig} from '../src/core-config.ts';
const environment={ALLURA_DATABASE_URL:'postgres://allura_app:test@127.0.0.1:15432/allura_test',ALLURA_CURSOR_KEY:randomBytes(32).toString('base64url')};
const local={mode:'machine-only',origin:'http://127.0.0.1:18181',port:18181};
test('explicit machine-only configuration needs no human credentials and permits only canonical numeric loopback origins',()=>{
 const parsed=parseCoreConfig(local,environment);
 expect(parsed).toMatchObject({mode:'machine-only',host:'127.0.0.1',origin:local.origin,port:18181});
 expect(parsed.human).toBeUndefined();
 for(const raw of [{...local,mode:'unknown'},{...local,issuer:'https://example.cloudflareaccess.com'},{...local,audience:'no'},{...local,keys:[]},{...local,host:'0.0.0.0'},...['http://localhost:18181','http://remote.invalid:18181','https://remote.invalid','http://127.0.0.2:18181','http://127.0.0.1:18181/path','http://user@127.0.0.1:18181','http://127.0.0.1:18182','http://2130706433:18181'].map(origin=>({...local,origin}))]){expect(()=>parseCoreConfig(raw,environment)).toThrow('core_configuration_invalid');}
 for(const env of [{},{...environment,ALLURA_CURSOR_KEY:'bad'},{...environment,ALLURA_DATABASE_URL:'postgres://postgres:test@127.0.0.1/allura_test'}]){expect(()=>parseCoreConfig(local,env)).toThrow('core_configuration_invalid');}
});
test('machine-only transport matches its declared local origin and rejects explicit null mode',()=>{
 const tls={certificateFile:'/owned/cert.pem',privateKeyFile:'/owned/key.pem'};
 expect(()=>parseCoreConfig({...local,mode:null},environment)).toThrow('core_configuration_invalid');
 expect(()=>parseCoreConfig({...local,tls},environment)).toThrow('core_configuration_invalid');
 expect(()=>parseCoreConfig({...local,origin:'https://127.0.0.1:18181'},environment)).toThrow('core_configuration_invalid');
 expect(parseCoreConfig({...local,origin:'https://127.0.0.1:18181',tls},environment).tls).toEqual(tls);
});
const unusedSql=new Proxy({}, {get(){throw new Error('database must not be used');}}) as SQL;
const unusedProvider={identity:EMBEDDING,embed:async():Promise<number[]>=>{throw new Error('embedding must not be used');}};
test('assembled local runtime denies human API dashboard assets and MCP without touching database',async()=>{
 const config=parseCoreConfig(local,environment);
 const api=createCoreGateway(unusedSql,config.human,config.origin,config.cursorKey,unusedProvider,undefined,undefined,config.mode);
 const handler=await createDashboardHandler(api,'/nonexistent-assets',config.mode);
 for(const path of ['/api/health','/mcp/human','/dashboard','/memory','/assets/app.js']){
  for(const method of ['GET','POST']){const request=new Request(local.origin+path,{method,headers:{'Cf-Access-Jwt-Assertion':'invalid',Cookie:'CF_Authorization=a; CF_Authorization=b'},...(method==='POST'?{body:'malformed'}:{})});expect((await handler(request)).status).toBe(404);expect(request.bodyUsed).toBe(false);}
 }
 expect((await handler(new Request(local.origin+'/api/agent/health'))).status).toBe(401);
 expect((await handler(new Request(local.origin+'/mcp',{method:'POST',body:'malformed'}))).status).toBe(401);
 expect((await handler(new Request(local.origin+'/health/live'))).status).toBe(200);
});
test('machine-only denies human routes before inspecting credentials or content',async()=>{
 const gateway=createGateway({mode:'machine-only',origin:local.origin,store:{resolve:async()=>{throw new Error('must not resolve');}},machineLookup:async()=>{throw new Error('must not look up');},routes:[{path:'/mcp/human',method:'POST',identity:'human',action:'memory:read',handle:async()=>{throw new Error('must not run');}}]});
 const request=new Request(local.origin+'/mcp/human',{method:'POST',headers:{'Cf-Access-Jwt-Assertion':'malformed',Cookie:'CF_Authorization=a; CF_Authorization=b','Content-Type':'bad'},body:'not JSON'});
 expect((await gateway(request)).status).toBe(404);expect(request.bodyUsed).toBe(false);
});
test('real loopback machine-only HTTP preserves opaque token scope grant and revocation checks',async()=>{
 const token=randomBytes(32).toString('base64url'),digest=createHash('sha256').update(token).digest('hex');
 const scope={groupId:'allura-test',workspaceId:'11111111-1111-4111-8111-111111111111'},query='?group_id='+scope.groupId+'&workspace_id='+scope.workspaceId;
 let credential:MachineCredential={...scope,kind:'service',principalId:'22222222-2222-4222-8222-222222222222',actions:['memory:read','health:read'],expiresAt:Math.floor(Date.now()/1000)+600,revoked:false};
 let row:AuthorityRecord={...scope,principalId:credential.principalId,kind:'service',role:'workspace_admin',principalActive:true,tenantActive:true,membershipActive:true,workspaceLocked:false,grantActive:true,reviewApprove:false,credentialActions:credential.actions};
 const gateway=createGateway({mode:'machine-only',origin:local.origin,store:{resolve:async()=>row},machineLookup:async d=>d===digest?credential:null,routes:[
 ...createMcpRoutes(unusedSql,randomBytes(32),unusedProvider),
 {path:'/api/agent/health',method:'GET',identity:'machine',action:'health:read',handle:async()=>({status:'ready'})},
 {path:'/api/health',method:'GET',identity:'human',action:'health:read',handle:async()=>({})}]});
 const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch:gateway});
 try{
  const headers={Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body=JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'test',version:'1'}}});
  const send=(path:string,extra:Record<string,string>={})=>fetch(new URL(path+query,server.url),{method:'POST',headers:{...headers,...extra},body});
  const ok=await send('/mcp');expect(ok.status).toBe(200);expect(await ok.json()).toMatchObject({jsonrpc:'2.0',id:1,result:{serverInfo:{name:'allura-memory'}}});
  for(const extra of [{Authorization:''},{Authorization:'Bearer invalid'},{'Cf-Access-Jwt-Assertion':'malformed'},{Cookie:'CF_Authorization=malformed'}]){expect((await send('/mcp',extra)).status).toBe(401);}
  for(const path of ['/mcp/human','/api/health','/dashboard','/assets/app.js']){expect((await send(path,{'Cf-Access-Jwt-Assertion':'malformed',Cookie:'CF_Authorization=a; CF_Authorization=b'})).status).toBe(404);}
  expect((await fetch(new URL('/api/agent/health'+query,server.url))).status).toBe(401);
  expect((await fetch(new URL('/api/agent/health'+query,server.url),{headers})).status).toBe(200);
  expect((await fetch(new URL('/health/live',server.url))).status).toBe(200);
  expect((await fetch(new URL('/mcp?group_id=allura-foreign&workspace_id='+scope.workspaceId,server.url),{method:'POST',headers,body})).status).toBe(403);
  row={...row,grantActive:false};expect((await send('/mcp')).status).toBe(403);
  row={...row,grantActive:true};credential={...credential,revoked:true};expect((await send('/mcp')).status).toBe(401);
 }finally{await server.stop(true);}
});
