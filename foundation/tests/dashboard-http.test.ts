import {test,expect} from 'bun:test';
import {randomBytes,randomUUID} from 'node:crypto';
import {fixture} from './lifecycle-fixture.ts';
import {createCoreGateway} from '../src/core-api.ts';
import {loadLocalEmbedder} from '../src/embedding.ts';
import {submitProposal} from '../src/proposals.ts';
import {capture} from '../src/capture.ts';
test('dashboard HTTP derives current presentation scope without granting organization content access',async()=>{
 const f=await fixture(`allura-dashboard-${randomUUID()}`),provider=await loadLocalEmbedder(),origin='https://dashboard.invalid';const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch:createCoreGateway(f.app,f.humanConfig,origin,randomBytes(32),provider)});
 const url=(path:string,workspace=f.scope.workspaceId)=>`http://127.0.0.1:${server.port}/api/dashboard/${path}?group_id=${f.scope.groupId}&workspace_id=${workspace}`;
 const headers=(who:keyof typeof f.identities)=>({'Cf-Access-Jwt-Assertion':f.jwt(who),Origin:origin,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json'});
 try{
  expect((await fetch(url('context'))).status).toBe(401);expect((await fetch(url('context'),{headers:headers('org')})).status).toBe(403);expect((await fetch(url('context',f.foreignWorkspace),{headers:headers('author')})).status).toBe(403);
  const response=await fetch(url('context'),{headers:headers('viewer')});expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('no-store');const context=await response.json() as Record<string,unknown>;expect(context.scope).toEqual(f.scope);expect(context.role).toBe('viewer');expect(context.actions).toEqual(['memory:read']);expect(JSON.stringify(context)).not.toContain(f.jwt('viewer'));expect(context.principalId).toBe(f.ids.viewer);
  const review=await(await fetch(url('context'),{headers:headers('reviewer')})).json() as {actions:string[]};expect(review.actions).toContain('review:approve');expect(review.actions).not.toContain('workspace:grants:manage');
  await f.owner`UPDATE allura.workspace_grants SET role='viewer',review_approve=false WHERE group_id=${f.scope.groupId} AND principal_id=${f.ids.reviewer}::uuid`;
  expect((await(await fetch(url('context'),{headers:headers('reviewer')})).json() as {actions:string[]}).actions).toEqual(['memory:read']);
  await f.owner`UPDATE allura.memberships SET active=false WHERE group_id=${f.scope.groupId} AND principal_id=${f.ids.viewer}::uuid`;expect((await fetch(url('context'),{headers:headers('viewer')})).status).toBe(403);
 }finally{await server.stop(true);await f.close();}
},30000);
test('dashboard queue uses actual RLS current proposals without weakening machine capture',async()=>{
 const f=await fixture(`allura-dashboard-${randomUUID()}`),provider=await loadLocalEmbedder(),origin='https://dashboard.invalid';const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch:createCoreGateway(f.app,f.humanConfig,origin,randomBytes(32),provider)});
 const url=(path:string,workspace=f.scope.workspaceId)=>`http://127.0.0.1:${server.port}/api/dashboard/${path}?group_id=${f.scope.groupId}&workspace_id=${workspace}`;
 const headers=(who:keyof typeof f.identities)=>({'Cf-Access-Jwt-Assertion':f.jwt(who),Origin:origin,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json'});
 const post=(path:string,body:unknown,who:keyof typeof f.identities='curator')=>fetch(url(path),{method:'POST',headers:headers(who),body:JSON.stringify(body)});
 try{
  expect((await post('proposals',{},'viewer')).status).toBe(403);expect((await post('proposals',{limit:21})).status).toBe(400);expect((await post('proposals',{role:'workspace_admin'})).status).toBe(400);expect((await post('proposals',{limit:1.5})).status).toBe(400);
  const empty=await post('proposals',{});expect(empty.status).toBe(200);expect(await empty.json()).toEqual({items:[],hasMore:false});
  const request={content:'Real operator evidence <script>untrusted</script>',idempotency_key:randomUUID()};expect((await fetch(url('proposals'),{method:'POST',headers:{...headers('curator'),Origin:'https://foreign.invalid'},body:'{}'})).status).toBe(403);
  await expect(capture(f.app,f.identities.curator,f.scope,request)).rejects.toMatchObject({code:'forbidden'});const receipt=JSON.parse(await capture(f.app,f.identities.machine,f.scope,request)) as {event_id:string;promotion:string};expect(receipt.promotion).toBe('not_requested');
  const a=await submitProposal(f.app,f.identities.machine,f.scope,{summary:'x'.repeat(500),assertionKind:'observation',evidenceIds:[receipt.event_id]});await submitProposal(f.app,f.identities.machine,f.scope,{summary:'Second real proposal',assertionKind:'observation',evidenceIds:[receipt.event_id]});
  const queue=await(await post('proposals',{limit:1})).json() as {items:Record<string,unknown>[];hasMore:boolean};expect(queue.items).toHaveLength(1);expect(queue.hasMore).toBe(true);
  const all=await(await post('proposals',{})).json() as {items:Record<string,unknown>[]};const item=all.items.find(v=>v.id===a.id)!;expect(item.version).toBe(a.version);expect(item.summaryTruncated).toBe(true);expect((item.summary as string).length).toBe(256);expect(item.state).toBe('pending');expect(item).not.toHaveProperty('evidenceIds');
  expect((await fetch(url('proposals',f.foreignWorkspace),{method:'POST',headers:headers('curator'),body:'{}'})).status).toBe(403);
  await f.owner`UPDATE allura.workspaces SET locked=true WHERE group_id=${f.scope.groupId} AND id=${f.scope.workspaceId}::uuid`;expect((await post('proposals',{})).status).toBe(403);
 }finally{await server.stop(true);await f.close();}
},30000);
