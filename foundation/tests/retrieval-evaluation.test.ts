import {test,expect,beforeAll,afterAll} from 'bun:test';
import {createHash,randomUUID} from 'node:crypto';
import {fixture} from './lifecycle-fixture.ts';
import {capture} from '../src/capture.ts';
import {appendEvent} from '../src/persistence.ts';
import {submitProposal} from '../src/proposals.ts';
import {submitCorrection} from '../src/corrections.ts';
import {decideProposal} from '../src/decisions.ts';
import {deleteMemory} from '../src/lifecycle.ts';
import {captureIndex} from '../src/indexing.ts';
import {loadLocalEmbedder,EMBEDDING,type Embedder} from '../src/embedding.ts';
import {searchIndex} from '../src/retrieval-index.ts';
import {searchFederated} from '../src/retrieval-federation.ts';
import {summarizeEvaluation,type EvaluationSample} from '../src/retrieval-evaluation.ts';
import fixtureData from '../fixtures/retrieval-evaluation-v1.json';
import holdout from '../fixtures/retrieval-holdout-v1.json';
let f:Awaited<ReturnType<typeof fixture>>,model:Embedder,modelLoadMs:number;
const ids:Record<string,string>={};
beforeAll(async()=>{
 f=await fixture('allura-evaluation');const start=performance.now();model=await loadLocalEmbedder();modelLoadMs=performance.now()-start;
 const source=JSON.parse(await capture(f.app,f.identities.machine,f.scope,{idempotency_key:'evaluation',content:'Synthetic source for versioned evaluation'})).event_id;
 const approve=(proposalId:string)=>decideProposal(f.app,f.identities.reviewer,f.scope,{proposalId,reviewedProposalVersion:1,decision:'approve',rationale:'Signed synthetic human decision for deterministic fixture',evidenceIds:[source],operationKey:randomUUID()});
 for(const key of ['old','deprecated','cat'] as const){const p=await submitProposal(f.app,f.identities.machine,f.scope,{summary:fixtureData.documents[key],assertionKind:'observation',evidenceIds:[source]});ids[key]=JSON.parse(await approve(p.id)).semantic_version_id;}
 const correction=JSON.parse(await submitCorrection(f.app,f.identities.curator,f.scope,{baseMemoryId:ids.old!,expectedBaseVersion:'1',content:fixtureData.documents.current,rationale:'Explicit contradictory version fixture',evidenceIds:[source],operationKey:randomUUID()}));ids.current=JSON.parse(await approve(correction.proposal_id)).semantic_version_id;
 await deleteMemory(f.app,f.identities.author,f.scope,{memoryId:ids.deprecated!,expectedHeadRevision:1,reason:'Explicit withdrawn fixture',operationKey:randomUUID()});
 for(const key of ['old','current','deprecated','cat']){expect((await captureIndex(f.app,f.identities.machine,f.scope,'semantic',ids[key]!,model)).state).toBe('succeeded');}
 ids.fresh=JSON.parse(await capture(f.app,f.identities.machine,f.scope,{idempotency_key:'fresh-evaluation',content:fixtureData.documents.fresh})).event_id;
 const foreign={...f.scope,workspaceId:f.foreignWorkspace};for(const who of ['author','reviewer'] as const){await f.owner`INSERT INTO allura.workspace_grants(group_id,workspace_id,principal_id,role,review_approve,issuer) VALUES(${foreign.groupId},${foreign.workspaceId},${f.ids[who]},${who==='author'?'workspace_admin':'curator'},${who==='reviewer'},${f.ids.author})`;}
 const evidence=await appendEvent(f.app,f.identities.author,foreign,{content:fixtureData.documents.foreign}),p=await submitProposal(f.app,f.identities.author,foreign,{summary:fixtureData.documents.foreign,assertionKind:'observation',evidenceIds:[evidence]});
 ids.foreign=JSON.parse(await decideProposal(f.app,f.identities.reviewer,foreign,{proposalId:p.id,reviewedProposalVersion:1,decision:'approve',rationale:'Foreign evaluation fixture',evidenceIds:[evidence],operationKey:randomUUID()})).semantic_version_id;expect((await captureIndex(f.app,f.identities.author,foreign,'semantic',ids.foreign!,model)).state).toBe('succeeded');
});
afterAll(async()=>{if(f){await f.close();}});
test('versioned live retrieval evaluation reports mode labeled quality latency freshness and isolation',async()=>{
 const samples:EvaluationSample[]=[];
 for(let repeat=0;repeat<3;repeat++){for(const c of fixtureData.cases){
  const start=performance.now();const common={query:c.query,limit:3,history:c.history};
  const result=c.mode==='all'||c.mode==='approved'?await searchFederated(f.app,f.identities.machine,f.scope,{...common,status:c.mode},model):await searchIndex(f.app,f.identities.viewer,f.scope,{...common,mode:c.mode as 'text'|'vector'|'hybrid'},model);
  const hits='results' in result?result.results:[];const returned=hits.map(hit=>hit.id);
  samples.push({caseId:c.id,mode:c.mode,category:c.category,expected:c.expected.map(k=>ids[k]!),returned,unauthorized:[ids.foreign!],stale:c.history?[]:[ids.old!,ids.deprecated!],durationMs:performance.now()-start,degraded:result.degraded,timeout:false,failed:false});
  if(repeat===0){console.log(JSON.stringify({evaluationCase:c.id,mode:c.mode,expected:c.expected,observed:hits.map(hit=>({key:Object.keys(ids).find(key=>ids[key]===hit.id),score:hit.score,scoreKind:hit.scoreKind}))}));}
 }}
 const summary=summarizeEvaluation(samples),source=Bun.spawnSync(['git','rev-parse','HEAD'],{stdout:'pipe',stderr:'pipe'}).stdout.toString().trim();
 const sourceHashes=Object.fromEntries(await Promise.all(['src/retrieval-index.ts','src/retrieval-federation.ts','src/retrieval-evaluation.ts','tests/retrieval-evaluation.test.ts','bun.lock'].map(async path=>[path,createHash('sha256').update(new Uint8Array(await Bun.file(new URL('../'+path,import.meta.url)).arrayBuffer())).digest('hex')])));
 console.log(JSON.stringify({retrievalEvaluation:{fixture:fixtureData.version,fixtureSha256:createHash('sha256').update(await Bun.file(new URL('../fixtures/retrieval-evaluation-v1.json',import.meta.url)).text()).digest('hex'),labelStatus:fixtureData.labelStatus,source,sourceHashes,model:EMBEDDING,modelLoadMs,modelLoadClass:'process-cache-load-not-cold-install',corpus:{localSemanticVersions:4,foreignSemanticVersions:1,freshEvents:1},repetitions:3,summary}}));
 expect(summary.samples).toBe(fixtureData.cases.length*3);expect(summary.unauthorizedResults).toBe(0);expect(summary.staleResults).toBe(0);expect(summary.freshTop1).toBe(1);expect(summary.p95Ms).toBeGreaterThan(0);expect(summary.timeouts).toBe(0);expect(summary.failures).toBe(0);expect(summary.noAnswerAccuracy).toBe(1);expect(summary.mrr).toBe(1);expect(summary.recall).toBe(1);
});
test('evaluation metrics distinguish ranking from no answer and reject empty telemetry',()=>{
 const samples:EvaluationSample[]=[{caseId:'rank',mode:'vector',category:'current',expected:['a'],returned:['b','a'],unauthorized:[],stale:[],durationMs:20,degraded:false,timeout:false,failed:false},{caseId:'empty',mode:'text',category:'no-answer',expected:[],returned:[],unauthorized:[],stale:[],durationMs:10,degraded:true,timeout:false,failed:false}];
 expect(summarizeEvaluation(samples)).toMatchObject({samples:2,answerable:1,mrr:1/2,precision:1/2,recall:1,noAnswerAccuracy:1,p50Ms:10,p95Ms:20,fallbacks:1});expect(()=>summarizeEvaluation([])).toThrow('empty');
});

test('fixed additional paraphrases and no answer probes exercise measured vector policy',async()=>{
 const samples:EvaluationSample[]=[];
 for(let repeat=0;repeat<3;repeat++){for(const c of holdout.cases){const start=performance.now(),result=await searchIndex(f.app,f.identities.viewer,f.scope,{query:c.query,mode:'vector',limit:3},model);
  samples.push({caseId:c.id,mode:'vector',category:c.expected.length?'current':'no-answer',expected:c.expected.map(key=>ids[key]!),returned:result.results.map(row=>row.id),unauthorized:[ids.foreign!],stale:[ids.old!,ids.deprecated!],durationMs:performance.now()-start,degraded:result.degraded,timeout:false,failed:false});
  if(repeat===0){console.log(JSON.stringify({holdoutCase:c.id,results:result.results.map(row=>({key:Object.keys(ids).find(key=>ids[key]===row.id),score:row.score}))}));}
 }}
 const summary=summarizeEvaluation(samples);console.log(JSON.stringify({retrievalHoldout:{fixture:holdout.version,fixtureSha256:createHash('sha256').update(await Bun.file(new URL('../fixtures/retrieval-holdout-v1.json',import.meta.url)).text()).digest('hex'),labelStatus:holdout.labelStatus,summary}}));
 expect(summary.samples).toBe(holdout.cases.length*3);expect(summary.mrr).toBe(1);expect(summary.recall).toBe(1);expect(summary.noAnswerAccuracy).toBe(1);expect(summary.unauthorizedResults).toBe(0);expect(summary.staleResults).toBe(0);
});

test('evaluation reports injected provider timeout and fallback separately from healthy latency',async()=>{
 const samples:EvaluationSample[]=[];
 for(const kind of ['failure','timeout'] as const){const injected:Embedder={identity:EMBEDDING,embed:async()=>{if(kind==='failure'){throw new Error('Explicit evaluation injection');}return new Promise<number[]>(()=>{});}};
  const start=performance.now(),result=await searchIndex(f.app,f.identities.viewer,f.scope,{query:fixtureData.documents.cat,mode:'hybrid',limit:3},injected),durationMs=performance.now()-start;
  expect(result.degraded).toBe(true);expect(result.used).toEqual(['text']);expect(result.results[0]?.id).toBe(ids.cat);if(kind==='timeout'){expect(durationMs).toBeGreaterThan(1800);expect(durationMs).toBeLessThan(4000);}
  samples.push({caseId:kind,mode:'hybrid',category:'injected-fault',expected:[ids.cat!],returned:result.results.map(row=>row.id),unauthorized:[ids.foreign!],stale:[ids.old!,ids.deprecated!],durationMs,degraded:result.degraded,timeout:kind==='timeout',failed:false});
 }
 const summary=summarizeEvaluation(samples);console.log(JSON.stringify({retrievalFaultEvaluation:{injected:true,healthyLatencyExcluded:true,providerFailures:1,summary}}));expect(summary.samples).toBe(2);expect(summary.timeouts).toBe(1);expect(summary.fallbacks).toBe(2);expect(summary.mrr).toBe(1);expect(summary.unauthorizedResults).toBe(0);
});
