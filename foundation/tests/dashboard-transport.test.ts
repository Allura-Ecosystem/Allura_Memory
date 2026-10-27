import {test,expect} from 'bun:test';
import {randomUUID} from 'node:crypto';
import {DashboardTransport} from '../src/dashboard-transport.ts';
const scope=()=>({groupId:'allura-ui-client',workspaceId:randomUUID()});
test('dashboard transport never redirects retries or accepts secret-bearing foreign targets',async()=>{
 let reads=0;const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch:req=>{reads++;const path=new URL(req.url).pathname;return path==='/api/dashboard/context'?new Response(null,{status:302,headers:{Location:'/secret-target'}}):Response.json({value:'unexpected'});}});
 try{const origin=`http://127.0.0.1:${server.port}`,client=new DashboardTransport(origin,scope(),()=>{});await expect(client.request('/api/dashboard/context')).rejects.toMatchObject({code:'unknown'});expect(reads).toBe(1);
 for(const route of ['/secret-target','https://evil.invalid/api/memory/list','//evil.invalid','/api/memory/list?group_id=allura-other','/api/access#fragment']){await expect(client.request(route,{})).rejects.toMatchObject({code:'invalid'});}expect(reads).toBe(1);
 for(const endpoint of ['https://name:secret@example.invalid','https://example.invalid?secret=x','http://remote.invalid','https://example.invalid/path']){expect(()=>new DashboardTransport(endpoint,scope(),()=>{})).toThrow('dashboard_invalid');}
 expect(()=>new DashboardTransport(origin,{...scope(),groupId:'foreign'},()=>{})).toThrow('dashboard_invalid');expect(()=>new DashboardTransport(origin,scope(),()=>{},{timeoutMs:0})).toThrow('dashboard_invalid');client.close();
 }finally{await server.stop(true);}
});
test('dashboard transport clears denied state aborts old scope and discards late replies',async()=>{
 const seen:string[]=[],resets:string[]=[];let denied=false,finish:(()=>void)|undefined;const wait=new Promise<void>(r=>{finish=r;});const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch:async req=>{const u=new URL(req.url);seen.push(u.searchParams.get('workspace_id')!);if(u.pathname==='/api/memory/list'){await wait;return Response.json({items:['old-private-data']});}return denied?Response.json({private:'must-not-leak'},{status:403}):Response.json({scope:u.searchParams.get('workspace_id')});}});
 try{const a=scope(),b=scope(),client=new DashboardTransport(`http://127.0.0.1:${server.port}`,a,reason=>resets.push(reason));
 const old=client.request('/api/memory/list',{}).catch(error=>error);while(seen.length===0){await Bun.sleep(5);}client.setScope(b);finish!();expect(await old).toMatchObject({code:'stale'});expect(resets).toEqual(['scope']);expect(await client.request('/api/dashboard/context')).toEqual({scope:b.workspaceId});
 denied=true;await expect(client.request('/api/dashboard/context')).rejects.toMatchObject({code:'denied'});expect(resets).toEqual(['scope','denied']);const count=seen.length;await expect(client.request('/api/dashboard/context')).rejects.toMatchObject({code:'denied'});expect(seen.length).toBe(count);expect(seen).toContain(a.workspaceId);expect(seen).toContain(b.workspaceId);client.close();
 }finally{finish?.();await server.stop(true);}
});
test('dashboard transport bounds content timeout and request cardinality without leaking response bodies',async()=>{
 const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch:async req=>{const path=new URL(req.url).pathname;if(path==='/api/memory/list'){return new Response('private-'+('x'.repeat(131073)),{headers:{'content-type':'application/json'}});}if(path==='/api/dashboard/proposals'){return new Response('<private>',{headers:{'content-type':'text/html'}});}await Bun.sleep(200);return Response.json({private:'late'});}});
 try{const client=new DashboardTransport(`http://127.0.0.1:${server.port}`,scope(),()=>{},{timeoutMs:50});for(const route of ['/api/memory/list','/api/dashboard/proposals']){await expect(client.request(route,{})).rejects.toMatchObject({code:'unknown',message:'dashboard_unknown'});}
 await expect(client.request('/api/memory/list',{text:'x'.repeat(65537)})).rejects.toMatchObject({code:'invalid'});const pending=Array.from({length:8},()=>client.request('/api/dashboard/context').catch(e=>e));await expect(client.request('/api/dashboard/context')).rejects.toMatchObject({code:'unavailable'});for(const result of await Promise.all(pending)){expect(result).toMatchObject({code:'unknown'});}client.close();await expect(client.request('/api/dashboard/context')).rejects.toMatchObject({code:'stale'});
 }finally{await server.stop(true);}
});
