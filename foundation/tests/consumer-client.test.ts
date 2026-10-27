import {test,expect} from 'bun:test';
import {AlluraClient,ConsumerError} from '../src/consumer-client.ts';
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
