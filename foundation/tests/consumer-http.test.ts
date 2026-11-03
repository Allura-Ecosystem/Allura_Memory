import {test,expect,beforeAll,afterAll} from 'bun:test';
import {randomBytes,createHash,randomUUID} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {type CallToolResult,type TextContent} from '@modelcontextprotocol/sdk/types.js';
import {fixture} from './lifecycle-fixture.ts';
import {loadLocalEmbedder} from '../src/embedding.ts';
import {createCoreGateway} from '../src/core-api.ts';
import {submitProposal} from '../src/proposals.ts';
import {captureIndex} from '../src/indexing.ts';
let f:Awaited<ReturnType<typeof fixture>>,server:ReturnType<typeof Bun.serve>,token:string,client:Client,endpoint:URL;
const data=(result:unknown)=>JSON.parse(((result as CallToolResult).content[0] as TextContent).text) as Record<string,unknown>;
beforeAll(async()=>{
 f=await fixture('allura-consumer-http');token=randomBytes(32).toString('hex');const digest=createHash('sha256').update(token).digest('hex');
 await f.owner`INSERT INTO allura.machine_credentials(principal_id,digest,group_id,workspace_id,actions,expires_at) VALUES(${f.ids.machine}::uuid,decode(${digest},'hex'),${f.scope.groupId},${f.scope.workspaceId}::uuid,ARRAY['memory:read','memory:capture','proposal:write','review:read'],clock_timestamp()+interval '1 hour')`;
 server=Bun.serve({hostname:'127.0.0.1',port:0,fetch:createCoreGateway(f.app,f.humanConfig,'https://consumer.invalid',randomBytes(32),await loadLocalEmbedder())});
 endpoint=new URL(`http://127.0.0.1:${server.port}/mcp?group_id=${f.scope.groupId}&workspace_id=${f.scope.workspaceId}`);
 client=new Client({name:'real-consumer',version:'0.1.0'},{capabilities:{}});await client.connect(new StreamableHTTPClientTransport(endpoint,{requestInit:{headers:{Authorization:`Bearer ${token}`}},reconnectionOptions:{maxRetries:0,maxReconnectionDelay:1,initialReconnectionDelay:1,reconnectionDelayGrowFactor:1}}));
});
afterAll(async()=>{await client?.close();await server?.stop(true);await f?.close();});
test('real MCP initialization and five tools preserve capture replay independent approval and second session reuse',async()=>{
 expect((await client.listTools()).tools.map(t=>t.name).sort()).toEqual(['memory_add','memory_delete','memory_get','memory_list','memory_search']);
 const args={content:'Consumer violet propulsion calibration',idempotency_key:'consumer-key'},first=await client.callTool({name:'memory_add',arguments:args}),replay=await client.callTool({name:'memory_add',arguments:args});expect(first).toEqual(replay);
 const receipt=data(first);expect(receipt.promotion).toBe('not_requested');expect(receipt.proposal).toBe('not_generated');
 expect(data(await client.callTool({name:'memory_get',arguments:{kind:'receipt',id:receipt.receipt_id}}))).toEqual(receipt);
 expect(data(await client.callTool({name:'memory_search',arguments:{query:'violet'}})).results).toEqual([]);
 const proposal=await submitProposal(f.app,f.identities.machine,f.scope,{summary:args.content,assertionKind:'observation',evidenceIds:[String(receipt.event_id)]});
 const decision=await fetch(new URL(`/api/review/decision${endpoint.search}`,endpoint),{method:'POST',headers:{'content-type':'application/json',Origin:'https://consumer.invalid','Sec-Fetch-Site':'same-origin','Cf-Access-Jwt-Assertion':f.jwt('reviewer')},body:JSON.stringify({proposalId:proposal.id,reviewedProposalVersion:1,decision:'approve',rationale:'Independent signed fixture decision',evidenceIds:[receipt.event_id],operationKey:randomUUID()})});expect(decision.status).toBe(200);
 const approved=await decision.json() as {semantic_version_id:string};await captureIndex(f.app,f.identities.machine,f.scope,'semantic',approved.semantic_version_id,await loadLocalEmbedder());
 const second=new Client({name:'second-real-session',version:'0.1.0'});await second.connect(new StreamableHTTPClientTransport(endpoint,{requestInit:{headers:{Authorization:`Bearer ${token}`}}}));
 try{expect(data(await second.callTool({name:'memory_get',arguments:{id:approved.semantic_version_id}}))).toMatchObject({content:args.content,id:approved.semantic_version_id,lifecycle:'current'});expect((data(await second.callTool({name:'memory_list',arguments:{}})).items as unknown[]).length).toBe(1);}finally{await second.close();}
 await expect(client.callTool({name:'memory_delete',arguments:{memoryId:approved.semantic_version_id,expectedHeadRevision:1,reason:'Not authorized',operationKey:'deny-delete'}})).rejects.toMatchObject({code:403});
});
test('MCP boundary rejects authority overrides foreign scope and alternate REST capture',async()=>{
 for(const args of [{content:'denied',idempotency_key:'deny',user_id:'forged'},{content:'denied',idempotency_key:'deny',group_id:'allura-foreign'}]){const result=await client.callTool({name:'memory_add',arguments:args}) as CallToolResult;expect(result.isError).toBe(true);expect(data(result).outcome).toBe('invalid');}
 expect((await fetch(new URL(`/api/agent/memory/add${endpoint.search}`,endpoint),{method:'POST',headers:{Authorization:`Bearer ${token}`,'content-type':'application/json'},body:'{}'})).status).toBe(404);
 const foreign=new URL(endpoint);foreign.searchParams.set('workspace_id',f.foreignWorkspace);expect((await fetch(foreign,{method:'POST',headers:{Authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})})).status).toBe(403);
 const [rows]=await f.owner`SELECT count(*)::integer AS n FROM allura.events WHERE group_id=${f.scope.groupId} AND kind='capture'`;expect(rows.n).toBe(1);
});
test('MCP schemas reject null enum values and array coercion without invoking alternate semantics',async()=>{
 for(const [name,args] of [['memory_search',{query:'violet',status:null}],['memory_get',{id:randomUUID(),kind:['semantic']}]] as const){const result=await client.callTool({name,arguments:args}) as CallToolResult;expect(result.isError).toBe(true);expect(data(result).outcome).toBe('invalid');}
 const humanUrl=new URL('/mcp/human'+endpoint.search,endpoint);expect((await fetch(humanUrl,{method:'POST',headers:{'Cf-Access-Jwt-Assertion':f.jwt('author'),'content-type':'application/json',Origin:'https://evil.invalid','Sec-Fetch-Site':'cross-site'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})})).status).toBe(403);
});
test('composed gateway shares admission across MCP and API and cancels stalled bodies',async()=>{
 const handler=createCoreGateway(f.app,f.humanConfig,'https://consumer.invalid',randomBytes(32),await loadLocalEmbedder()),controllers=Array.from({length:16},()=>new AbortController());
 const pending=controllers.map(controller=>handler(new Request(new URL('/api/agent/memory/search'+endpoint.search,endpoint).href,{method:'POST',headers:{Authorization:`Bearer ${token}`,'content-type':'application/json'},body:new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('{'));}}),signal:controller.signal})));
 try{let status=0;for(let attempt=0;attempt<30&&status!==429;attempt++){await Bun.sleep(10);status=(await handler(new Request(endpoint.href,{headers:{Authorization:`Bearer ${token}`}}))).status;}expect(status).toBe(429);}
 finally{for(const controller of controllers){controller.abort();}await Promise.all(pending);}
 expect((await handler(new Request(endpoint.href,{headers:{Authorization:`Bearer ${token}`}}))).status).toBe(405);
});
