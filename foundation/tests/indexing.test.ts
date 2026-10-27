import {test,expect,beforeAll,afterAll} from 'bun:test';
import {randomUUID,createHash} from 'node:crypto';
import {fixture} from './lifecycle-fixture.ts';
import {capture} from '../src/capture.ts';
import {submitProposal} from '../src/proposals.ts';
import {decideProposal} from '../src/decisions.ts';
import {EMBEDDING,loadLocalEmbedder,validateVector,type Embedder} from '../src/embedding.ts';
import {captureIndex,drainIndexBatch} from '../src/indexing.ts';
import {searchIndex} from '../src/retrieval-index.ts';
import {scopedTransaction,appendEvent} from '../src/persistence.ts';
import {deleteMemory} from '../src/lifecycle.ts';
let f:Awaited<ReturnType<typeof fixture>>,embedder:Embedder,event:string,memory:string;
beforeAll(async()=>{
  f=await fixture('allura-index');embedder=await loadLocalEmbedder();
  event=JSON.parse(await capture(f.app,f.identities.machine,f.scope,{idempotency_key:'index',content:'Cats are domesticated feline mammals'})).event_id;
  const p=await submitProposal(f.app,f.identities.machine,f.scope,{summary:'Cats are domesticated feline mammals',assertionKind:'observation',evidenceIds:[event]});
  memory=JSON.parse(await decideProposal(f.app,f.identities.reviewer,f.scope,{proposalId:p.id,reviewedProposalVersion:1,decision:'approve',rationale:'Verified source',evidenceIds:[event],operationKey:randomUUID()})).semantic_version_id;
});
afterAll(async()=>{if(f){await f.close();}});

test('real pinned offline model produces normalized vectors and native semantic retrieval',async()=>{
  const v=await embedder.embed('A domestic cat');expect(v).toHaveLength(384);expect(()=>validateVector(v)).not.toThrow();
  expect((await captureIndex(f.app,f.identities.machine,f.scope,'semantic',memory,embedder)).state).toBe('succeeded');
  const results=await searchIndex(f.app,f.identities.viewer,f.scope,{query:'pet feline',mode:'vector',limit:5},embedder);
  expect(results.used).toEqual(['vector']);expect(results.results[0]?.id).toBe(memory);expect(results.results[0]!.score).toBeGreaterThan(0);expect(results.degraded).toBe(false);
});

test('index current scope and raw source entitlement deny before provider work',async()=>{
  let calls=0;const provider:Embedder={identity:EMBEDDING,embed:async text=>{calls++;return embedder.embed(text);}};
  await expect(captureIndex(f.app,f.identities.viewer,f.scope,'event',event,provider)).rejects.toThrow('forbidden');
  await expect(captureIndex(f.app,f.identities.curator,f.scope,'event',event,provider)).rejects.toThrow('not_found');
  await expect(captureIndex(f.app,f.identities.machine,{...f.scope,workspaceId:f.foreignWorkspace},'event',event,provider)).rejects.toThrow('forbidden');
  await expect(searchIndex(f.app,f.identities.org,f.scope,{query:'cat',mode:'hybrid',limit:5},provider)).rejects.toThrow('forbidden');expect(calls).toBe(0);
  expect((await captureIndex(f.app,f.identities.machine,f.scope,'event',event,provider)).state).toBe('succeeded');
});

test('index replay validates model identity and vector failure never reports ready',async()=>{
  let calls=0;const provider:Embedder={identity:EMBEDDING,embed:async()=>{calls++;throw new Error('provider unavailable');}};
  expect((await captureIndex(f.app,f.identities.machine,f.scope,'event',event,provider)).state).toBe('succeeded');expect(calls).toBe(0);
  const source=JSON.parse(await capture(f.app,f.identities.machine,f.scope,{idempotency_key:'failure',content:'Unindexed provider failure'})).event_id;
  const failed=await captureIndex(f.app,f.identities.machine,f.scope,'event',source,provider);expect(failed.state).toBe('retry_wait');
  expect(await f.owner`SELECT * FROM allura.source_vectors WHERE group_id=${f.scope.groupId} AND source_id=${source}`).toHaveLength(0);
  await expect(captureIndex(f.app,f.identities.machine,f.scope,'event',source,{...embedder,identity:{...EMBEDDING,dimensions:3} as unknown as typeof EMBEDDING})).rejects.toThrow('invalid_model');
  expect(()=>validateVector([1,2])).toThrow('invalid_vector');expect(()=>validateVector(Array.from({length:384},()=>NaN))).toThrow('invalid_vector');
  const sparse:number[]=new Array(384);sparse[0]=1;expect(()=>validateVector(sparse)).toThrow('invalid_vector');
});

test('embedding failure uses equivalent scoped lexical fallback with truthful stores',async()=>{
  const failing:Embedder={identity:EMBEDDING,embed:async()=>{throw new Error('offline model unavailable');}};
  const result=await searchIndex(f.app,f.identities.viewer,f.scope,{query:'feline',mode:'hybrid',limit:5},failing);
  expect(result.degraded).toBe(true);expect(result.attempted).toEqual(['vector','text']);expect(result.used).toEqual(['text']);expect(result.results[0]?.id).toBe(memory);
  expect(JSON.stringify(result)).not.toContain('offline model unavailable');
});

test('index lease fencing concurrency retries and batch drain persist actual vectors',async()=>{
  const source=JSON.parse(await capture(f.app,f.identities.machine,f.scope,{idempotency_key:'lease',content:'Lease fencing source'})).event_id;
  const claim=()=>scopedTransaction(f.app,f.identities.machine,f.scope,'proposal:write',async tx=>(await tx`SELECT allura.claim_index(${f.scope.groupId},${f.scope.workspaceId}::uuid,'event',${source}::uuid) AS claim`)[0].claim as {leaseId:string});
  const first=await claim();await f.owner`UPDATE allura.index_jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE group_id=${f.scope.groupId} AND source_id=${source}`;const second=await claim();expect(second.leaseId).not.toBe(first.leaseId);
  const vector=await embedder.embed('Lease fencing source');
  await expect(scopedTransaction(f.app,f.identities.machine,f.scope,'proposal:write',async tx=>await tx`SELECT allura.finish_index(${f.scope.groupId},${f.scope.workspaceId}::uuid,'event',${source}::uuid,${first.leaseId}::uuid,${vector}::jsonb,true)`)).rejects.toThrow('conflict');
  await scopedTransaction(f.app,f.identities.machine,f.scope,'proposal:write',async tx=>await tx`SELECT allura.finish_index(${f.scope.groupId},${f.scope.workspaceId}::uuid,'event',${source}::uuid,${second.leaseId}::uuid,${vector}::jsonb,true)`);
  expect((await f.owner`SELECT digest FROM allura.source_vectors WHERE group_id=${f.scope.groupId} AND source_id=${source}`)[0].digest).toBe(createHash('sha256').update('Lease fencing source').digest('hex'));
  const parallel=JSON.parse(await capture(f.app,f.identities.machine,f.scope,{idempotency_key:'parallel-index',content:'Parallel indexing source'})).event_id;
  let calls=0;const counted:Embedder={identity:EMBEDDING,embed:async text=>{calls++;await Bun.sleep(40);return embedder.embed(text);}};
  const outcomes=await Promise.all([captureIndex(f.app,f.identities.machine,f.scope,'event',parallel,counted),captureIndex(f.app,f.identities.machine,f.scope,'event',parallel,counted)]);expect(calls).toBe(1);expect(outcomes.some(x=>x.state==='succeeded')).toBe(true);
  await capture(f.app,f.identities.machine,f.scope,{idempotency_key:'batch-index',content:'Batch candidate source'});
  const batch=await drainIndexBatch(f.app,f.identities.machine,f.scope,embedder,8);expect(batch.some(x=>x.state==='succeeded')).toBe(true);expect(batch.length).toBeLessThanOrEqual(8);
  expect(await scopedTransaction(f.app,f.identities.viewer,f.scope,'memory:read',async tx=>await tx`SELECT source_id FROM allura.source_vectors WHERE source_kind='event'`)).toHaveLength(0);
  const failed=JSON.parse(await capture(f.app,f.identities.machine,f.scope,{idempotency_key:'max-retries',content:'Never claim ready'})).event_id;
  const unavailable:Embedder={identity:EMBEDDING,embed:async()=>{throw new Error('unavailable');}};
  for(let attempt=1;attempt<=3;attempt++){
    const state=await captureIndex(f.app,f.identities.machine,f.scope,'event',failed,unavailable);expect(state.state).toBe(attempt===3?'failed':'retry_wait');
    await f.owner`UPDATE allura.index_jobs SET next_attempt_at=clock_timestamp()-interval '1 second' WHERE group_id=${f.scope.groupId} AND source_id=${failed}`;
  }
  expect((await captureIndex(f.app,f.identities.machine,f.scope,'event',failed,embedder)).state).toBe('failed');
  expect(await f.owner`SELECT * FROM allura.source_vectors WHERE group_id=${f.scope.groupId} AND source_id=${failed}`).toHaveLength(0);
});

test('index revocation after embedding cannot publish and search rechecks lifecycle',async()=>{
  const source=JSON.parse(await capture(f.app,f.identities.machine,f.scope,{idempotency_key:'revoke-index',content:'Revoked indexing source'})).event_id;
  const revoking:Embedder={identity:EMBEDDING,embed:async text=>{const v=await embedder.embed(text);await f.owner`UPDATE allura.workspace_grants SET active=false WHERE group_id=${f.scope.groupId} AND principal_id=${f.ids.machine}`;return v;}};
  try{await expect(captureIndex(f.app,f.identities.machine,f.scope,'event',source,revoking)).rejects.toThrow('forbidden');}
  finally{await f.owner`UPDATE allura.workspace_grants SET active=true WHERE group_id=${f.scope.groupId} AND principal_id=${f.ids.machine}`;}
  expect(await f.owner`SELECT * FROM allura.source_vectors WHERE group_id=${f.scope.groupId} AND source_id=${source}`).toHaveLength(0);
  const deleting:Embedder={identity:EMBEDDING,embed:async text=>{await deleteMemory(f.app,f.identities.author,f.scope,{memoryId:memory,expectedHeadRevision:1,reason:'Withdraw during retrieval',operationKey:randomUUID()});return embedder.embed(text);}};
  const result=await searchIndex(f.app,f.identities.viewer,f.scope,{query:'feline',mode:'vector',limit:5},deleting);expect(result.results).toEqual([]);
});

test('indexed foreign workspace sentinel is excluded from native and fallback paths',async()=>{
  const foreign={...f.scope,workspaceId:f.foreignWorkspace};
  for(const name of ['author','reviewer'] as const){await f.owner`INSERT INTO allura.workspace_grants(group_id,workspace_id,principal_id,role,review_approve,issuer) VALUES(${f.scope.groupId},${foreign.workspaceId},${f.ids[name]},${name==='author'?'workspace_admin':'curator'},${name==='reviewer'},${f.ids.author})`;}
  const e=await appendEvent(f.app,f.identities.author,foreign,{content:'Private indexed sentinel quokka'});
  const p=await submitProposal(f.app,f.identities.author,foreign,{summary:'Private indexed sentinel quokka',assertionKind:'observation',evidenceIds:[e]});
  const foreignMemory=JSON.parse(await decideProposal(f.app,f.identities.reviewer,foreign,{proposalId:p.id,reviewedProposalVersion:1,decision:'approve',rationale:'Foreign source',evidenceIds:[e],operationKey:randomUUID()})).semantic_version_id;
  expect((await captureIndex(f.app,f.identities.author,foreign,'semantic',foreignMemory,embedder)).state).toBe('succeeded');
  expect((await searchIndex(f.app,f.identities.author,foreign,{query:'quokka',mode:'vector',limit:5},embedder)).results[0]?.id).toBe(foreignMemory);
  for(const mode of ['vector','text','hybrid'] as const){expect(JSON.stringify(await searchIndex(f.app,f.identities.viewer,f.scope,{query:'quokka',mode,limit:5},embedder))).not.toContain(foreignMemory);}
  const broken:Embedder={identity:EMBEDDING,embed:async()=>{throw new Error('unavailable');}};
  expect((await searchIndex(f.app,f.identities.viewer,f.scope,{query:'quokka',mode:'hybrid',limit:5},broken)).results).toEqual([]);
  await expect(searchIndex(f.app,f.identities.viewer,foreign,{query:'quokka',mode:'hybrid',limit:5},broken)).rejects.toThrow('forbidden');
});
