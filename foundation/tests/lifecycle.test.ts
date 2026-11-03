import {test,expect,beforeAll,afterAll} from 'bun:test';
import {randomUUID} from 'node:crypto';
import {fixture} from './lifecycle-fixture.ts';
import {capture} from '../src/capture.ts';
import {submitProposal} from '../src/proposals.ts';
import {decideProposal} from '../src/decisions.ts';
import {deleteMemory,knowledgeHistory} from '../src/lifecycle.ts';
import {submitRestoration} from '../src/restoration.ts';
import {appendEvent} from '../src/persistence.ts';
let f:Awaited<ReturnType<typeof fixture>>,event:string;
beforeAll(async()=>{f=await fixture('allura-lifecycle');event=JSON.parse(await capture(f.app,f.identities.machine,f.scope,{idempotency_key:'lifecycle',content:'Lifecycle evidence'})).event_id;});
afterAll(async()=>{if(f){await f.close();}});
async function initial(content:string){const p=await submitProposal(f.app,f.identities.machine,f.scope,{summary:content,evidenceIds:[event],assertionKind:'observation'});return JSON.parse(await decideProposal(f.app,f.identities.reviewer,f.scope,{proposalId:p.id,reviewedProposalVersion:1,operationKey:randomUUID(),decision:'approve',rationale:'Reviewed original evidence',evidenceIds:[event]})) as {semantic_version_id:string;knowledge_id:string};}
const deletion=(id:string)=>({memoryId:id,expectedHeadRevision:1,reason:'Information is obsolete',operationKey:randomUUID()});

test('governed deletion is replay safe while immutable history remains visible',async()=>{
  const base=await initial('Lifecycle content'),request=deletion(base.semantic_version_id),receipt=await deleteMemory(f.app,f.identities.author,f.scope,request);
  expect(JSON.parse(receipt).outcome).toBe('deprecated');expect(await deleteMemory(f.app,f.identities.author,f.scope,request)).toBe(receipt);
  const history=await knowledgeHistory(f.app,f.identities.viewer,f.scope,base.knowledge_id);
  expect(history).toHaveLength(1);expect(history[0]).toMatchObject({id:base.semantic_version_id,content:'Lifecycle content',lifecycle:'deprecated'});
  await expect(deleteMemory(f.app,f.identities.author,f.scope,{...request,reason:'changed replay'})).rejects.toThrow('conflict');
  await expect(deleteMemory(f.app,f.identities.author,f.scope,deletion(base.semantic_version_id))).rejects.toThrow('conflict');
  expect(await f.owner`SELECT * FROM allura.events WHERE group_id=${f.scope.groupId} AND kind='deletion' AND payload->>'memoryId'=${base.semantic_version_id}`).toHaveLength(1);
  await expect(f.owner`DELETE FROM allura.lifecycle_receipts WHERE group_id=${f.scope.groupId}`.execute()).rejects.toThrow('append-only');
});

test('lifecycle authority foreign identifiers and stale heads fail without mutation',async()=>{
  const base=await initial('Authority content');
  await expect(deleteMemory(f.app,f.identities.curator,f.scope,deletion(base.semantic_version_id))).rejects.toThrow('forbidden');
  await expect(deleteMemory(f.app,f.identities.org,f.scope,deletion(base.semantic_version_id))).rejects.toThrow('forbidden');
  await expect(deleteMemory(f.app,f.identities.author,f.scope,deletion(randomUUID()))).rejects.toThrow('not_found');
  await expect(deleteMemory(f.app,f.identities.author,f.scope,{...deletion(base.semantic_version_id),expectedHeadRevision:2})).rejects.toThrow('conflict');
  await expect(knowledgeHistory(f.app,f.identities.org,f.scope,base.knowledge_id)).rejects.toThrow('forbidden');
  expect((await knowledgeHistory(f.app,f.identities.viewer,f.scope,base.knowledge_id))[0]?.lifecycle).toBe('current');
  expect(await knowledgeHistory(f.app,f.identities.viewer,f.scope,randomUUID())).toEqual([]);
});

test('lifecycle receipt failure rolls back tombstone event and head state',async()=>{
  const base=await initial('Rollback content');
  await f.owner.unsafe("CREATE FUNCTION allura.lifecycle_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected'; END $$; CREATE TRIGGER lifecycle_fail BEFORE INSERT ON allura.lifecycle_receipts FOR EACH ROW EXECUTE FUNCTION allura.lifecycle_fail()");
  try{await expect(deleteMemory(f.app,f.identities.author,f.scope,deletion(base.semantic_version_id))).rejects.toThrow('unknown');}
  finally{await f.owner.unsafe('DROP TRIGGER lifecycle_fail ON allura.lifecycle_receipts; DROP FUNCTION allura.lifecycle_fail()');}
  expect((await knowledgeHistory(f.app,f.identities.viewer,f.scope,base.knowledge_id))[0]?.lifecycle).toBe('current');
  expect(await f.owner`SELECT * FROM allura.events WHERE group_id=${f.scope.groupId} AND kind='deletion' AND payload->>'memoryId'=${base.semantic_version_id}`).toHaveLength(0);
});

test('exact text duplicate approvals preserve provenance and append scoped equivalence',async()=>{
  const a=await initial('Same exact independent content');
  const [b,c]=await Promise.all([initial('Same exact independent content'),initial('Same exact independent content')]);
  expect(b.knowledge_id).not.toBe(a.knowledge_id);expect(c.knowledge_id).not.toBe(a.knowledge_id);
  const links=await f.owner`SELECT * FROM allura.semantic_equivalences WHERE group_id=${f.scope.groupId} AND canonical_id=${a.semantic_version_id}`;
  expect(links).toHaveLength(2);expect(links.every((x:{relation:string})=>x.relation==='exact_text')).toBe(true);
  await expect(f.owner`DELETE FROM allura.semantic_equivalences WHERE group_id=${f.scope.groupId}`.execute()).rejects.toThrow('append-only');
});

test('concurrent first duplicate roots and delete retries serialize without double effects',async()=>{
  const roots=await Promise.all([initial('First parallel exact text'),initial('First parallel exact text')]);
  expect(await f.owner`SELECT * FROM allura.semantic_equivalences WHERE group_id=${f.scope.groupId} AND memory_id IN (${roots[0]!.semantic_version_id}::uuid,${roots[1]!.semantic_version_id}::uuid)`).toHaveLength(1);
  const request=deletion(roots[0]!.semantic_version_id),receipts=await Promise.all(Array.from({length:4},()=>deleteMemory(f.app,f.identities.author,f.scope,request)));
  expect(new Set(receipts).size).toBe(1);expect((await knowledgeHistory(f.app,f.identities.viewer,f.scope,roots[0]!.knowledge_id))[0]?.headRevision).toBe(2);
});

test('real foreign semantic ids never leak through delete restore history or equivalence',async()=>{
  const foreign={...f.scope,workspaceId:f.foreignWorkspace};
  for(const name of ['author','reviewer'] as const){await f.owner`INSERT INTO allura.workspace_grants(group_id,workspace_id,principal_id,role,review_approve,issuer) VALUES(${f.scope.groupId},${foreign.workspaceId},${f.ids[name]},${name==='author'?'workspace_admin':'curator'},${name==='reviewer'},${f.ids.author})`;}
  const foreignEvent=await appendEvent(f.app,f.identities.author,foreign,{content:'Private other workspace'});
  const p=await submitProposal(f.app,f.identities.author,foreign,{summary:'Same exact independent content',assertionKind:'observation',evidenceIds:[foreignEvent]});
  const base=JSON.parse(await decideProposal(f.app,f.identities.reviewer,foreign,{proposalId:p.id,reviewedProposalVersion:1,decision:'approve',rationale:'Foreign approval',evidenceIds:[foreignEvent],operationKey:randomUUID()}));
  expect(await knowledgeHistory(f.app,f.identities.viewer,f.scope,base.knowledge_id)).toEqual([]);
  await expect(deleteMemory(f.app,f.identities.author,f.scope,deletion(base.semantic_version_id))).rejects.toThrow('not_found');
  await expect(submitRestoration(f.app,f.identities.curator,f.scope,{sourceMemoryId:base.semantic_version_id,expectedHeadId:base.semantic_version_id,expectedHeadRevision:1,rationale:'Foreign attempt',evidenceIds:[event],operationKey:randomUUID()})).rejects.toThrow('not_found');
  expect(await f.owner`SELECT * FROM allura.semantic_equivalences WHERE group_id=${f.scope.groupId} AND workspace_id=${foreign.workspaceId}`).toHaveLength(0);
  await expect(knowledgeHistory(f.app,f.identities.viewer,foreign,base.knowledge_id)).rejects.toThrow('forbidden');
});
