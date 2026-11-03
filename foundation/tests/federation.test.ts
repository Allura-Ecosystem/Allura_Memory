import {test,expect,beforeAll,afterAll} from 'bun:test';
import {randomUUID,randomBytes} from 'node:crypto';
import {fixture} from './lifecycle-fixture.ts';
import {capture} from '../src/capture.ts';
import {submitProposal} from '../src/proposals.ts';
import {decideProposal} from '../src/decisions.ts';
import {captureIndex} from '../src/indexing.ts';
import {EMBEDDING,loadLocalEmbedder,type Embedder} from '../src/embedding.ts';
import {searchFederated} from '../src/retrieval-federation.ts';
import {createRetrievalGateway} from '../src/retrieval-api.ts';
import {deleteMemory} from '../src/lifecycle.ts';
import {appendEvent} from '../src/persistence.ts';
let f:Awaited<ReturnType<typeof fixture>>,provider:Embedder,event:string,memory:string;
beforeAll(async()=>{
 f=await fixture('allura-federation');provider=await loadLocalEmbedder();
 event=JSON.parse(await capture(f.app,f.identities.machine,f.scope,{idempotency_key:'fresh',content:'fresh needle',metadata:{source:'real captured event',tags:['unapproved']}})).event_id;
 for(let i=0;i<3;i++){
  const p=await submitProposal(f.app,f.identities.machine,f.scope,{summary:`Related fresh needle policy ${i}`,assertionKind:'observation',evidenceIds:[event]});
  const receipt=JSON.parse(await decideProposal(f.app,f.identities.reviewer,f.scope,{proposalId:p.id,reviewedProposalVersion:1,decision:'approve',rationale:'Reviewed source',evidenceIds:[event],operationKey:randomUUID()}));memory=receipt.semantic_version_id;
  expect((await captureIndex(f.app,f.identities.machine,f.scope,'semantic',memory,provider)).state).toBe('succeeded');
 }
});
afterAll(async()=>{if(f){await f.close();}});
test('real full semantic and native batches retain unindexed exact fresh evidence',async()=>{
 const result=await searchFederated(f.app,f.identities.machine,f.scope,{query:'fresh needle',status:'all',limit:1},provider);
 expect(result.results).toHaveLength(1);expect(result.results[0]).toMatchObject({id:event,kind:'evidence',approval:'unapproved',score:0,scoreKind:'unscored'});
 expect(result.paths.map(p=>p.path)).toEqual(['semantic','vector','events']);expect(result.paths.every(p=>p.state==='succeeded')).toBe(true);expect(result.storesUsed).toEqual(['postgres','ruvector']);
 expect(await f.owner`SELECT * FROM allura.source_vectors WHERE group_id=${f.scope.groupId} AND source_id=${event}`).toHaveLength(0);
 const approved=await searchFederated(f.app,f.identities.machine,f.scope,{query:'fresh needle',status:'approved',limit:2},provider);
 expect(approved.results.every(r=>r.kind==='semantic')).toBe(true);expect(approved.paths.some(p=>p.path==='events')).toBe(false);
 expect((await searchFederated(f.app,f.identities.viewer,f.scope,{query:'fresh needle',status:'all',limit:5},provider)).results.some(r=>r.id===event)).toBe(false);
});
test('live indexed evidence preserves cosine score and explicit unknown confidence semantics',async()=>{
 expect((await captureIndex(f.app,f.identities.machine,f.scope,'event',event,provider)).state).toBe('succeeded');
 const result=await searchFederated(f.app,f.identities.machine,f.scope,{query:'fresh needle',status:'all',limit:2.9},provider);
 expect(result.results.length).toBeLessThanOrEqual(2);expect(result.results[0]).toMatchObject({id:event,kind:'evidence',scoreKind:'cosine_similarity',confidence:null});expect(result.results[0]!.score).toBeGreaterThan(0.9);
 expect((await searchFederated(f.app,f.identities.machine,f.scope,{query:'fresh needle',status:'all',min_score:0},provider)).results).toEqual([]);
 let calls=0;const counted:Embedder={identity:EMBEDDING,embed:async text=>{calls++;return provider.embed(text);}};
 for(const limit of [0,101,NaN,Infinity,null]){await expect(searchFederated(f.app,f.identities.machine,f.scope,{query:'fresh needle',status:'all',limit} as never,counted)).rejects.toThrow('invalid');}expect(calls).toBe(0);
});
test('federation reports real path failures without presenting raw fallback as native readiness',async()=>{
 const broken:Embedder={identity:EMBEDDING,embed:async()=>{throw new Error('private model failure');}};
 const partial=await searchFederated(f.app,f.identities.machine,f.scope,{query:'fresh needle',status:'all',limit:2},broken);
 expect(partial.outcome).toBe('partial');expect(partial.degraded).toBe(true);expect(partial.storesUsed).toEqual(['postgres']);expect(partial.results[0]?.id).toBe(event);expect(JSON.stringify(partial)).not.toContain('private model failure');
 await f.owner.unsafe('REVOKE SELECT ON allura.memory_projection,allura.source_vectors FROM allura_app; REVOKE EXECUTE ON FUNCTION allura.retrieval_events(text,uuid,text,integer) FROM allura_app');
 try{
  const failed=await searchFederated(f.app,f.identities.machine,f.scope,{query:'fresh needle',status:'all'},provider);
  expect(failed.outcome).toBe('failed');expect(failed.results).toEqual([]);expect(failed.paths.every(p=>p.state==='failed')).toBe(true);expect(failed.storesUsed).toEqual([]);
 }finally{await f.owner.unsafe('GRANT SELECT ON allura.memory_projection,allura.source_vectors TO allura_app; GRANT EXECUTE ON FUNCTION allura.retrieval_events(text,uuid,text,integer) TO allura_app');}
});
test('federation rechecks current lifecycle and denies authority before fallback',async()=>{
 let calls=0;const counted:Embedder={identity:EMBEDDING,embed:async text=>{calls++;return provider.embed(text);}};
 await expect(searchFederated(f.app,f.identities.org,f.scope,{query:'fresh needle',status:'all'},counted)).rejects.toThrow('forbidden');
 await expect(searchFederated(f.app,f.identities.machine,{...f.scope,workspaceId:f.foreignWorkspace},{query:'fresh needle',status:'all'},counted)).rejects.toThrow('forbidden');expect(calls).toBe(0);
 const deleting:Embedder={identity:EMBEDDING,embed:async text=>{await deleteMemory(f.app,f.identities.author,f.scope,{memoryId:memory,expectedHeadRevision:1,reason:'Withdraw during retrieval',operationKey:randomUUID()});return provider.embed(text);}};
 expect((await searchFederated(f.app,f.identities.viewer,f.scope,{query:'fresh needle',status:'approved'},deleting)).results.some(r=>r.id===memory)).toBe(false);
 expect((await searchFederated(f.app,f.identities.viewer,f.scope,{query:'fresh needle',status:'approved',history:true},provider)).results.find(r=>r.id===memory)?.lifecycle).toBe('deprecated');
});
test('real federation HTTP labels fresh evidence and rejects selector overrides',async()=>{
 const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch:createRetrievalGateway(f.app,f.humanConfig,'https://allura.example',randomBytes(32),provider)});
 const send=(body:unknown)=>fetch(`http://127.0.0.1:${server.port}/api/memory/search?group_id=${f.scope.groupId}&workspace_id=${f.scope.workspaceId}`,{method:'POST',headers:{'Cf-Access-Jwt-Assertion':f.jwt('author'),'Content-Type':'application/json',Origin:'https://allura.example','Sec-Fetch-Site':'same-origin'},body:JSON.stringify(body)});
 try{const response=await send({query:'fresh needle',status:'all',limit:1});expect(response.status).toBe(200);expect(response.headers.get('Cache-Control')).toBe('no-store');expect((await response.json() as {results:{id:string;approval:string}[]}).results[0]).toMatchObject({id:event,approval:'unapproved'});expect((await send({query:'fresh needle',status:'all',principal_id:f.ids.author})).status).toBe(400);}
 finally{await server.stop(true);}
});

test('fresh evidence native and fallback paths isolate actual foreign indexed scopes',async()=>{
 for(const scope of [{...f.scope,workspaceId:f.foreignWorkspace},{groupId:'allura-federation-other',workspaceId:f.scope.workspaceId}]){
  if(scope.groupId!==f.scope.groupId){await f.owner`INSERT INTO allura.tenants(group_id) VALUES(${scope.groupId})`;for(const who of ['author','reviewer'] as const){await f.owner`INSERT INTO allura.memberships(group_id,principal_id) VALUES(${scope.groupId},${f.ids[who]})`;}await f.owner`INSERT INTO allura.workspaces(group_id,id,display_name,created_by) VALUES(${scope.groupId},${scope.workspaceId},'Foreign',${f.ids.author})`;}
  for(const who of ['author','reviewer'] as const){await f.owner`INSERT INTO allura.workspace_grants(group_id,workspace_id,principal_id,role,review_approve,issuer) VALUES(${scope.groupId},${scope.workspaceId},${f.ids[who]},${who==='author'?'workspace_admin':'curator'},${who==='reviewer'},${f.ids.author})`;}
  const e=await appendEvent(f.app,f.identities.author,scope,{content:'Classified quokka evidence sentinel'}),p=await submitProposal(f.app,f.identities.author,scope,{summary:'Classified quokka evidence sentinel',assertionKind:'observation',evidenceIds:[e]});
  const m=JSON.parse(await decideProposal(f.app,f.identities.reviewer,scope,{proposalId:p.id,reviewedProposalVersion:1,decision:'approve',rationale:'Verified foreign',evidenceIds:[e],operationKey:randomUUID()})).semantic_version_id;
  for(const [kind,id] of [['event',e],['semantic',m]] as const){expect((await captureIndex(f.app,f.identities.author,scope,kind,id,provider)).state).toBe('succeeded');}
  expect((await searchFederated(f.app,f.identities.author,scope,{query:'Classified quokka evidence sentinel',status:'all'},provider)).results.some(r=>r.id===e)).toBe(true);
  for(const model of [provider,{identity:EMBEDDING,embed:async()=>{throw new Error('Unavailable');}}]){const home=await searchFederated(f.app,f.identities.author,f.scope,{query:'Classified quokka evidence sentinel',status:'all'},model);expect(JSON.stringify(home)).not.toContain(e);expect(JSON.stringify(home)).not.toContain(m);expect(JSON.stringify(home)).not.toContain('Classified');}
 }
});

test('federation timeouts preserve fallback and grant changes serialize with retrieval',async()=>{
 const hung:Embedder={identity:EMBEDDING,embed:async()=>new Promise<number[]>(()=>{})};const start=performance.now();
 const result=await searchFederated(f.app,f.identities.machine,f.scope,{query:'fresh needle',status:'all',limit:1},hung);expect(performance.now()-start).toBeLessThan(4000);expect(result.outcome).toBe('partial');expect(result.results[0]?.id).toBe(event);expect(result.paths.find(p=>p.path==='vector')?.state).toBe('failed');
 let committed=false,change:Promise<unknown>|undefined;
 const revoking:Embedder={identity:EMBEDDING,embed:async text=>{change=f.owner`UPDATE allura.workspace_grants SET role='viewer' WHERE group_id=${f.scope.groupId} AND workspace_id=${f.scope.workspaceId} AND principal_id=${f.ids.author}`.then(rows=>{committed=true;return rows;});await Bun.sleep(30);expect(committed).toBe(false);return provider.embed(text);}};
 try{const before=await searchFederated(f.app,f.identities.author,f.scope,{query:'fresh needle',status:'all'},revoking);expect(before.results.some(r=>r.id===event)).toBe(true);await change;expect(committed).toBe(true);const after=await searchFederated(f.app,f.identities.author,f.scope,{query:'fresh needle',status:'all'},provider);expect(after.results.some(r=>r.id===event)).toBe(false);}
 finally{await f.owner`UPDATE allura.workspace_grants SET role='workspace_admin' WHERE group_id=${f.scope.groupId} AND workspace_id=${f.scope.workspaceId} AND principal_id=${f.ids.author}`;}
});

test('bounded source selection preserves trimmed Unicode exact evidence priority',async()=>{
 const exact=JSON.parse(await capture(f.app,f.identities.machine,f.scope,{idempotency_key:'unicode-exact',content:'\u00a0Unicode bounded match\ufeff'})).event_id;
 await capture(f.app,f.identities.machine,f.scope,{idempotency_key:'unicode-substring',content:'Newer prefix Unicode bounded match suffix'});
 const result=await searchFederated(f.app,f.identities.machine,f.scope,{query:'Unicode bounded match',status:'all',limit:1},provider);expect(result.results[0]?.id).toBe(exact);expect(result.results[0]?.score).toBe(0);
});
