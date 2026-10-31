import {test,expect} from 'bun:test';
import {AlluraClient,ConsumerError} from '../src/consumer-client.ts';
import {MEMORY_TOOLS,DISCLOSURE,CONSUMER_CONTRACT} from '../src/consumer-contract.ts';
import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {WebStandardStreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import {CallToolRequestSchema} from '@modelcontextprotocol/sdk/types.js';
// Controlled MCP peer: this proves SDK classification, not server authorization.
test('consumer keeps empty success structured errors and unknown tool transport distinct',async()=>{
 let mode='empty',calls=0;
 const host=Bun.serve({hostname:'127.0.0.1',port:0,fetch:async request=>{
  if(request.method!=='POST'){return new Response(null,{status:405});}
  const peer=new Server({name:'controlled-outcome-peer',version:'1'},{capabilities:{tools:{}}});
  peer.setRequestHandler(CallToolRequestSchema,async()=>{
   calls++;
   if(mode==='empty'){return {content:[{type:'text',text:'empty fixture'}],structuredContent:{contract:CONSUMER_CONTRACT,data:{results:[],outcome:'succeeded',degraded:false}}};}
   if(mode==='malformed'){return {isError:true,content:[{type:'text',text:'PRIVATE_PEER_DETAIL'}]};}
   return {isError:true,content:[{type:'text',text:JSON.stringify({outcome:mode,detail:'PRIVATE_PEER_DETAIL'})}]};
  });
  const transport=new WebStandardStreamableHTTPServerTransport({enableJsonResponse:true});
  try{await peer.connect(transport);const response=await transport.handleRequest(request);return new Response(response.status===202?null:await response.text(),{status:response.status,headers:response.headers});}
  finally{await peer.close();}
 }});
 const client=new AlluraClient({endpoint:`http://127.0.0.1:${host.port}/mcp`,groupId:'allura-fixture',workspaceId:'11111111-1111-4111-8111-111111111111',token:async()=> 'x'.repeat(64),allowLoopback:true});
 try{
  await client.connect();expect(await client.search({query:'fixture'})).toEqual({results:[],outcome:'succeeded',degraded:false});
  for(mode of ['not_found','invalid','conflict','unavailable','forbidden','unauthenticated','unknown','malformed']){
   const outcome=mode==='malformed'?'unknown':mode;
   await expect(client.search({query:'fixture'})).rejects.toMatchObject({name:'ConsumerError',outcome,message:outcome});
  }
  expect(calls).toBe(9);
  await host.stop(true);
  await expect(client.search({query:'fixture'})).rejects.toMatchObject({outcome:'unknown',message:'unknown'});
  expect(calls).toBe(9);
 }finally{await client.close();await host.stop(true);}
});
test('consumer advertised guidance identifies preview limits and exact typed readback without new tools',()=>{
 expect(MEMORY_TOOLS.map(tool=>tool.name).sort()).toEqual(['memory_add','memory_delete','memory_get','memory_list','memory_search']);
 const search=MEMORY_TOOLS.find(tool=>tool.name==='memory_search')!,get=MEMORY_TOOLS.find(tool=>tool.name==='memory_get')!;
 expect(search.description).toContain('contentTruncated');expect(search.description).toContain('kind');
 expect(search.description).toContain('no full evidence');expect(get.description).toContain('receipt_id as id');expect(get.description).toContain('event_id');
 expect(get.inputSchema.properties?.kind).toEqual({type:'string',enum:['semantic','receipt','selected']});
 expect(DISCLOSURE).toContain('not live indexing status');
});
const scope={groupId:'allura-fixture',workspaceId:'11111111-1111-4111-8111-111111111111'},token=async()=> 'x'.repeat(64);
test('consumer rejects insecure redirected credential-bearing and malformed endpoint configuration',()=>{
 for(const endpoint of ['http://example.com/mcp','https://user:pass@example.com/mcp','https://example.com/mcp?user_id=bad','https://example.com/mcp#secret','https://example.com/wrong']){expect(()=>new AlluraClient({endpoint,...scope,token})).toThrow('invalid');}
 expect(()=>new AlluraClient({endpoint:'https://example.com/mcp',...scope,workspaceId:'bad',token})).toThrow('invalid');expect(()=>new AlluraClient({endpoint:'http://127.0.0.1:1/mcp',...scope,token})).toThrow('invalid');
 expect(new ConsumerError('unknown').message).toBe('unknown');
 expect(()=>new AlluraClient({endpoint:'https://example.com/mcp',...scope,token,timeoutMs:Infinity})).toThrow('invalid');
});
test('consumer bounds stalled credentials and oversized replies with redacted errors',async()=>{
 let requests=0;const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch:()=>{requests++;return new Response('PRIVATE_RESPONSE_SECRET'.repeat(10000),{headers:{'content-type':'application/json'}});}});
 const options={endpoint:`http://127.0.0.1:${server.port}/mcp`,...scope,allowLoopback:true,timeoutMs:30};
 try{const stalled=new AlluraClient({...options,token:async()=>new Promise<string>(()=>{})});await expect(stalled.connect()).rejects.toMatchObject({outcome:'unknown'});expect(requests).toBe(0);await stalled.close();
 const oversized=new AlluraClient({...options,token});await expect(oversized.connect()).rejects.toThrow('unknown');expect(requests).toBe(1);await oversized.close();
 const broken=new AlluraClient({...options,token:async()=>{throw new Error('PRIVATE_CREDENTIAL_SECRET');}});await expect(broken.connect()).rejects.toThrow('unknown');await broken.close();
 }finally{await server.stop(true);}
});
test('consumer never follows redirects or retries an ambiguous request',async()=>{
 let visits=0,leaks=0;const destination=Bun.serve({hostname:'127.0.0.1',port:0,fetch:()=>{leaks++;return new Response('leaked');}});
 const source=Bun.serve({hostname:'127.0.0.1',port:0,fetch:()=>{visits++;return Response.redirect(`http://127.0.0.1:${destination.port}/mcp`,307);}});
 const client=new AlluraClient({endpoint:`http://127.0.0.1:${source.port}/mcp`,...scope,token,allowLoopback:true});
 try{await expect(client.connect()).rejects.toThrow('unknown');expect(visits).toBe(1);expect(leaks).toBe(0);}finally{await client.close();await source.stop(true);await destination.stop(true);}
});
test('consumer abort cancels actual stalled HTTP response without retry or credential output',async()=>{
 let requests=0;const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch:()=>{requests++;return new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('{'));}}),{headers:{'content-type':'application/json'}});}});
 const client=new AlluraClient({endpoint:`http://127.0.0.1:${server.port}/mcp`,...scope,token,allowLoopback:true,timeoutMs:1000}),abort=new AbortController();
 try{const started=performance.now(),pending=client.connect(abort.signal);await Bun.sleep(30);abort.abort('PRIVATE_ABORT_SECRET');await expect(pending).rejects.toMatchObject({outcome:'unknown',message:'unknown'});expect(performance.now()-started).toBeLessThan(500);expect(requests).toBe(1);}finally{await client.close();await server.stop(true);}
});
