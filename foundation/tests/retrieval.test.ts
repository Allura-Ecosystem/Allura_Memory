import {test,expect,beforeAll,afterAll} from 'bun:test';
import {randomBytes,randomUUID,createHmac,createHash} from 'node:crypto';
import {fixture} from './lifecycle-fixture.ts';
import {capture} from '../src/capture.ts';
import {submitProposal} from '../src/proposals.ts';
import {decideProposal} from '../src/decisions.ts';
import {submitCorrection} from '../src/corrections.ts';
import {deleteMemory} from '../src/lifecycle.ts';
import {createRetrievalService} from '../src/retrieval.ts';
import {createRetrievalGateway} from '../src/retrieval-api.ts';
import {loadLocalEmbedder,type Embedder} from '../src/embedding.ts';
import {appendEvent} from '../src/persistence.ts';
import {searchIndex} from '../src/retrieval-index.ts';
let f:Awaited<ReturnType<typeof fixture>>,service:ReturnType<typeof createRetrievalService>,embedder:Embedder,event:string,old:string,current:string,deleted:string;
beforeAll(async()=>{
  f=await fixture('allura-retrieval');embedder=await loadLocalEmbedder();service=createRetrievalService(f.app,randomBytes(32));
  event=JSON.parse(await capture(f.app,f.identities.machine,f.scope,{idempotency_key:'retrieval',content:'Original source evidence private details'})).event_id;
  const approve=(id:string)=>decideProposal(f.app,f.identities.reviewer,f.scope,{proposalId:id,reviewedProposalVersion:1,decision:'approve',rationale:'Reviewed exact source',evidenceIds:[event],operationKey:randomUUID()});
  const p=await submitProposal(f.app,f.identities.machine,f.scope,{summary:'Obsolete policy permits red',assertionKind:'observation',evidenceIds:[event]});old=JSON.parse(await approve(p.id)).semantic_version_id;
  const c=JSON.parse(await submitCorrection(f.app,f.identities.curator,f.scope,{baseMemoryId:old,expectedBaseVersion:'1',content:'Current policy requires green',rationale:'Policy correction',evidenceIds:[event],operationKey:randomUUID()}));current=JSON.parse(await approve(c.proposal_id)).semantic_version_id;
  const d=await submitProposal(f.app,f.identities.machine,f.scope,{summary:'Withdrawn policy permits yellow',assertionKind:'observation',evidenceIds:[event]});deleted=JSON.parse(await approve(d.id)).semantic_version_id;
  await deleteMemory(f.app,f.identities.author,f.scope,{memoryId:deleted,expectedHeadRevision:1,reason:'Withdrawn',operationKey:randomUUID()});
});
afterAll(async()=>{if(f){await f.close();}});

test('semantic get and list distinguish current history and inaccessible identifiers',async()=>{
  expect(await service.get(f.identities.viewer,f.scope,current)).toMatchObject({id:current,content:'Current policy requires green',lifecycle:'current'});
  for(const id of [old,deleted,randomUUID()]){await expect(service.get(f.identities.viewer,f.scope,id)).rejects.toThrow('not_found');}
  expect(await service.get(f.identities.viewer,f.scope,old,true)).toMatchObject({lifecycle:'superseded'});expect(await service.get(f.identities.viewer,f.scope,deleted,true)).toMatchObject({lifecycle:'deprecated'});
  expect((await service.list(f.identities.viewer,f.scope,{limit:20})).items.map(x=>x.id)).toEqual([current]);
  expect((await service.list(f.identities.viewer,f.scope,{limit:20,history:true})).items).toHaveLength(3);
  await expect(service.get(f.identities.org,f.scope,current,true)).rejects.toThrow('forbidden');
});

test('signed pagination binds principal scope filters and rejects malformed cursors',async()=>{
  const first=await service.list(f.identities.viewer,f.scope,{limit:1,history:true});expect(first.items).toHaveLength(1);expect(first.nextCursor).not.toBeNull();
  const second=await service.list(f.identities.viewer,f.scope,{limit:1,history:true,cursor:first.nextCursor!});expect(second.items).toHaveLength(1);expect(second.items[0]!.id).not.toBe(first.items[0]!.id);
  await expect(service.list(f.identities.curator,f.scope,{limit:1,history:true,cursor:first.nextCursor!})).rejects.toThrow('invalid');
  await expect(service.list(f.identities.viewer,f.scope,{limit:1,history:false,cursor:first.nextCursor!})).rejects.toThrow('invalid');
  await expect(service.list(f.identities.viewer,f.scope,{limit:1,history:true,cursor:first.nextCursor!+'x'})).rejects.toThrow('invalid');
  await expect(service.list(f.identities.viewer,f.scope,{limit:1,history:true,cursor:'bad'})).rejects.toThrow('invalid');
  const differentKey=createRetrievalService(f.app,randomBytes(32));await expect(differentKey.list(f.identities.viewer,f.scope,{limit:1,history:true,cursor:first.nextCursor!})).rejects.toThrow('invalid');
  const key=randomBytes(32),expiring=createRetrievalService(f.app,key),page=await expiring.list(f.identities.viewer,f.scope,{limit:1,history:true});
  const value=JSON.parse(Buffer.from(page.nextCursor!.split('.')[0]!,'base64url').toString('utf8'));value.expires=Date.now()-1;
  const payload=Buffer.from(JSON.stringify(value)).toString('base64url'),expired=payload+'.'+createHmac('sha256',key).update(payload).digest('base64url');
  await expect(expiring.list(f.identities.viewer,f.scope,{limit:1,history:true,cursor:expired})).rejects.toThrow('invalid');
});

test('graph authorizes both endpoints and raw provenance independently',async()=>{
  const visible=await service.graph(f.identities.viewer,f.scope,{rootId:current,depth:2,limit:40});expect(visible.nodes.map(x=>x.id)).toEqual([current]);expect(visible.edges).toEqual([]);expect(JSON.stringify(visible)).not.toContain(event);
  const history=await service.graph(f.identities.viewer,f.scope,{rootId:current,history:true,depth:2,limit:40});expect(history.nodes.map(x=>x.id).sort()).toEqual([old,current].sort());expect(history.edges).toContainEqual({from:current,to:old,relation:'supersedes'});
  await expect(service.graph(f.identities.curator,f.scope,{rootId:current,history:true,includeEvidence:true})).rejects.toThrow('forbidden');
  const full=await service.graph(f.identities.author,f.scope,{rootId:current,history:true,includeEvidence:true});expect(full.nodes.some(x=>x.id===event&&x.kind==='evidence')).toBe(true);expect(full.edges.some(x=>x.to===event&&x.relation==='evidence')).toBe(true);
  const ids=new Set(full.nodes.map(x=>x.id));expect(full.edges.every(x=>ids.has(x.from)&&ids.has(x.to))).toBe(true);expect(full.counts).toEqual({nodes:full.nodes.length,edges:full.edges.length});
  await expect(service.graph(f.identities.viewer,f.scope,{rootId:randomUUID(),history:true})).rejects.toThrow('not_found');
});

test('real retrieval HTTP provides signed authorized reuse and no-store graph responses',async()=>{
  const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch:createRetrievalGateway(f.app,f.humanConfig,'https://allura.example',randomBytes(32),embedder)});
  const send=(path:string,body:Record<string,unknown>,who:'viewer'|'org'='viewer')=>fetch(`http://127.0.0.1:${server.port}/api/memory/${path}?group_id=${f.scope.groupId}&workspace_id=${f.scope.workspaceId}`,{method:'POST',headers:{'Cf-Access-Jwt-Assertion':f.jwt(who),'Content-Type':'application/json',Origin:'https://allura.example','Sec-Fetch-Site':'same-origin'},body:JSON.stringify(body)});
  try{
    const get=await send('get',{id:current});expect(get.status).toBe(200);expect(get.headers.get('Cache-Control')).toBe('no-store');expect(await get.json()).toMatchObject({content:'Current policy requires green'});
    expect((await send('get',{id:current},'org')).status).toBe(403);expect((await send('get',{id:old})).status).toBe(404);
    const list=await send('list',{history:true,limit:2});expect(list.status).toBe(200);expect((await list.json() as {items:unknown[]}).items).toHaveLength(2);
    const graph=await send('graph',{rootId:current,history:true});expect(graph.status).toBe(200);expect((await graph.json() as {edges:unknown[]}).edges).toHaveLength(1);
    const search=await send('search',{query:'green',mode:'text',limit:5});expect(search.status).toBe(200);expect((await search.json() as {results:{id:string}[]}).results[0]?.id).toBe(current);
    const secondAgent=randomUUID(),token=randomBytes(32).toString('base64url'),digest=createHash('sha256').update(token).digest('hex');
    await f.owner`INSERT INTO allura.principals(id,kind) VALUES(${secondAgent},'service')`;
    await f.owner`INSERT INTO allura.memberships(group_id,principal_id) VALUES(${f.scope.groupId},${secondAgent})`;
    await f.owner`INSERT INTO allura.workspace_grants(group_id,workspace_id,principal_id,role,issuer) VALUES(${f.scope.groupId},${f.scope.workspaceId},${secondAgent},'viewer',${f.ids.author})`;
    await f.owner`INSERT INTO allura.machine_credentials(principal_id,digest,group_id,workspace_id,actions,expires_at) VALUES(${secondAgent},decode(${digest},'hex'),${f.scope.groupId},${f.scope.workspaceId},ARRAY['memory:read'],clock_timestamp()+interval '1 hour')`;
    const other=Bun.serve({hostname:'127.0.0.1',port:0,fetch:createRetrievalGateway(f.app,f.humanConfig,'https://allura.example',randomBytes(32),embedder)});
    const agentSend=(path:string,body:Record<string,unknown>)=>fetch(`http://127.0.0.1:${other.port}/api/agent/memory/${path}?group_id=${f.scope.groupId}&workspace_id=${f.scope.workspaceId}`,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)});
    try{
      const discovery=await agentSend('search',{query:'green',mode:'text',limit:5});expect(discovery.status).toBe(200);expect((await discovery.json() as {results:{id:string}[]}).results[0]?.id).toBe(current);
      const reused=await agentSend('get',{id:current});expect(reused.status).toBe(200);expect(await reused.json()).toMatchObject({id:current,content:'Current policy requires green',version:2});
      expect((await agentSend('graph',{rootId:current,includeEvidence:true})).status).toBe(403);
      await f.owner`UPDATE allura.machine_credentials SET actions=ARRAY[]::text[] WHERE principal_id=${secondAgent}`;
      const denied=await agentSend('get',{id:current});expect(denied.status).toBe(403);expect(await denied.text()).not.toContain('green');
    }finally{await other.stop(true);}
  }finally{await server.stop(true);}
});

test('history search labels stale knowledge while read audits never store content',async()=>{
  expect((await searchIndex(f.app,f.identities.viewer,f.scope,{query:'red',mode:'text',limit:5},embedder)).results).toEqual([]);
  const history=await searchIndex(f.app,f.identities.viewer,f.scope,{query:'red',mode:'text',limit:5,history:true},embedder);expect(history.results[0]).toMatchObject({id:old,lifecycle:'superseded',version:1});
  const audits=await f.owner`SELECT * FROM allura.read_audit WHERE group_id=${f.scope.groupId}`;expect(audits.length).toBeGreaterThan(0);expect(JSON.stringify(audits)).not.toContain('policy');expect(JSON.stringify(audits)).not.toContain('private details');
  await expect(f.owner`DELETE FROM allura.read_audit WHERE group_id=${f.scope.groupId}`.execute()).rejects.toThrow('append-only');
  const cursor=(await service.list(f.identities.viewer,f.scope,{history:true,limit:1})).nextCursor!;
  await f.owner`UPDATE allura.workspace_grants SET active=false WHERE group_id=${f.scope.groupId} AND principal_id=${f.ids.viewer}`;
  try{await expect(service.list(f.identities.viewer,f.scope,{history:true,limit:1,cursor})).rejects.toThrow('forbidden');await expect(service.graph(f.identities.viewer,f.scope,{history:true,rootId:current})).rejects.toThrow('forbidden');}
  finally{await f.owner`UPDATE allura.workspace_grants SET active=true WHERE group_id=${f.scope.groupId} AND principal_id=${f.ids.viewer}`;}
});

test('foreign tenant and workspace graph metadata and cursors remain isolated',async()=>{
  const first=await service.list(f.identities.viewer,f.scope,{history:true,limit:1});
  for(const target of [{...f.scope,workspaceId:f.foreignWorkspace},{groupId:'allura-retrieval-other',workspaceId:f.scope.workspaceId}]){
    if(target.groupId!==f.scope.groupId){
      await f.owner`INSERT INTO allura.tenants(group_id) VALUES(${target.groupId})`;
      for(const who of ['author','reviewer','viewer'] as const){await f.owner`INSERT INTO allura.memberships(group_id,principal_id) VALUES(${target.groupId},${f.ids[who]})`;}
      await f.owner`INSERT INTO allura.workspaces(group_id,id,display_name,created_by) VALUES(${target.groupId},${target.workspaceId},'Foreign private sentinel',${f.ids.author})`;
    }
    for(const who of ['author','reviewer','viewer'] as const){await f.owner`INSERT INTO allura.workspace_grants(group_id,workspace_id,principal_id,role,review_approve,issuer) VALUES(${target.groupId},${target.workspaceId},${f.ids[who]},${who==='author'?'workspace_admin':who==='viewer'?'viewer':'curator'},${who==='reviewer'},${f.ids.author})`;}
    const e=await appendEvent(f.app,f.identities.author,target,{content:'Foreign private graph sentinel'}),p=await submitProposal(f.app,f.identities.author,target,{summary:'Foreign private graph sentinel',assertionKind:'observation',evidenceIds:[e]});
    const foreign=JSON.parse(await decideProposal(f.app,f.identities.reviewer,target,{proposalId:p.id,reviewedProposalVersion:1,decision:'approve',rationale:'Foreign approval',evidenceIds:[e],operationKey:randomUUID()})).semantic_version_id;
    expect((await service.graph(f.identities.viewer,target,{rootId:foreign})).nodes[0]?.id).toBe(foreign);
    await expect(service.get(f.identities.viewer,f.scope,foreign,true)).rejects.toThrow('not_found');await expect(service.graph(f.identities.viewer,f.scope,{rootId:foreign,history:true})).rejects.toThrow('not_found');
    const home=await service.graph(f.identities.viewer,f.scope,{history:true});expect(JSON.stringify(home)).not.toContain(foreign);expect(JSON.stringify(home)).not.toContain('Foreign private');
    await expect(service.list(f.identities.viewer,target,{history:true,limit:1,cursor:first.nextCursor!})).rejects.toThrow('invalid');
    await expect(f.owner`INSERT INTO allura.semantic_equivalences(group_id,workspace_id,memory_id,canonical_id,relation) VALUES(${f.scope.groupId},${f.scope.workspaceId},${current},${foreign},'exact_text')`.execute()).rejects.toThrow();
  }
});
