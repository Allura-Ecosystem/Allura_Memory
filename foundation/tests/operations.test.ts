import {test,expect,beforeAll,afterAll} from 'bun:test';
import {randomUUID} from 'node:crypto';
import {fixture} from './lifecycle-fixture.ts';
import {capture} from '../src/capture.ts';
import {submitProposal} from '../src/proposals.ts';
import {decideProposal} from '../src/decisions.ts';
import {captureIndex} from '../src/indexing.ts';
import {loadLocalEmbedder,boundedIndexWork,indexWorkStatus,type Embedder} from '../src/embedding.ts';
import {searchIndex} from '../src/retrieval-index.ts';
import {scopedTransaction} from '../src/persistence.ts';
import {scopedHealth,listOperations} from '../src/operations.ts';
import {createOperationsGateway} from '../src/operations-api.ts';
let f:Awaited<ReturnType<typeof fixture>>,model:Embedder,eventId:string;
beforeAll(async()=>{f=await fixture('allura-operations');model=await loadLocalEmbedder();eventId=JSON.parse(await capture(f.app,f.identities.machine,f.scope,{idempotency_key:'operations',content:'DO_NOT_REPORT_CONTENT secret sentinel'})).event_id;});
afterAll(async()=>{await f?.close();});
test('scoped health probes real providers and reports durable pending then indexed freshness',async()=>{
 const before=await scopedHealth(f.app,f.identities.author,f.scope,model);expect(before.components.postgres).toBe('succeeded');expect(before.components.embedding).toBe('succeeded');expect(before.components.ruvector).toBe('succeeded');expect(before.projection).toBe('not_configured');expect(before.durable.missingEventVectors).toBe(1);expect(before.outcome).toBe('partial');
 expect((await captureIndex(f.app,f.identities.machine,f.scope,'event',eventId,model)).state).toBe('succeeded');
 const after=await scopedHealth(f.app,f.identities.author,f.scope,model);expect(after.outcome).toBe('succeeded');expect(after.durable.missingEventVectors).toBe(0);expect(after.durable.jobs.succeeded).toBe(1);expect(JSON.stringify(after)).not.toContain('DO_NOT_REPORT_CONTENT');
});
test('health and observation reads deny org viewer foreign locked and revoked contexts before probes',async()=>{
 let calls=0;const provider:Embedder={identity:model.identity,embed:async()=>{calls++;throw new Error('must not probe');}};
 for(const identity of [f.identities.org,f.identities.viewer,f.identities.machine]){await expect(scopedHealth(f.app,identity,f.scope,provider)).rejects.toThrow('forbidden');await expect(listOperations(f.app,identity,f.scope,{})).rejects.toThrow('forbidden');}
 await expect(scopedHealth(f.app,f.identities.author,{...f.scope,workspaceId:f.foreignWorkspace},provider)).rejects.toThrow('forbidden');
 await f.owner`UPDATE allura.workspaces SET locked=true WHERE group_id=${f.scope.groupId} AND id=${f.scope.workspaceId}::uuid`;
 try{await expect(scopedHealth(f.app,f.identities.author,f.scope,provider)).rejects.toThrow('forbidden');}finally{await f.owner`UPDATE allura.workspaces SET locked=false WHERE group_id=${f.scope.groupId} AND id=${f.scope.workspaceId}::uuid`;}
 await f.owner`UPDATE allura.workspace_grants SET active=false WHERE group_id=${f.scope.groupId} AND principal_id=${f.ids.author}::uuid`;
 try{await expect(listOperations(f.app,f.identities.author,f.scope,{})).rejects.toThrow('forbidden');}finally{await f.owner`UPDATE allura.workspace_grants SET active=true WHERE group_id=${f.scope.groupId} AND principal_id=${f.ids.author}::uuid`;}
 expect(calls).toBe(0);
});
test('operational observations are append only scoped redacted and honestly label fallback',async()=>{
 await searchIndex(f.app,f.identities.viewer,f.scope,{query:'DO_NOT_REPORT_QUERY',mode:'hybrid',limit:2},{identity:model.identity,embed:async()=>{throw new Error('DO_NOT_REPORT_ERROR credential secret');}});
 const rows=await listOperations(f.app,f.identities.author,f.scope,{limit:100});expect(rows.some(r=>r.stage==='capture'&&r.correlationId===eventId&&r.outcome==='succeeded')).toBe(true);expect(rows.some(r=>r.stage==='indexing'&&r.correlationId===eventId&&r.outcome==='succeeded')).toBe(true);expect(rows.some(r=>r.stage==='retrieval'&&r.outcome==='partial'&&r.reason==='fallback')).toBe(true);
 const text=JSON.stringify(rows);for(const secret of ['DO_NOT_REPORT_CONTENT','DO_NOT_REPORT_QUERY','DO_NOT_REPORT_ERROR']){expect(text).not.toContain(secret);}
 expect(rows.every(r=>Object.keys(r).sort().join(',')==='correlationId,id,observedAt,outcome,reason,stage')).toBe(true);
 await expect(f.app`INSERT INTO allura.operation_observations(group_id,workspace_id,actor_id,correlation_id,stage,outcome) VALUES(${f.scope.groupId},${f.scope.workspaceId}::uuid,${f.ids.author}::uuid,${randomUUID()}::uuid,'promotion','succeeded')`.execute()).rejects.toThrow();
 await expect(f.owner`DELETE FROM allura.operation_observations WHERE group_id=${f.scope.groupId}`.execute()).rejects.toThrow('append-only');
 await f.owner`INSERT INTO allura.events(group_id,workspace_id,actor_id,kind,payload) VALUES(${f.scope.groupId},${f.foreignWorkspace}::uuid,${f.ids.author}::uuid,'capture','{"content":"DO_NOT_REPORT_FOREIGN"}')`;
 const foreign=await scopedTransaction(f.app,f.identities.author,f.scope,'audit:read',tx=>tx`SELECT id FROM allura.operation_observations WHERE workspace_id=${f.foreignWorkspace}::uuid`);expect(foreign).toHaveLength(0);
 const [ownedForeign]=await f.owner`SELECT count(*)::integer AS n FROM allura.operation_observations WHERE workspace_id=${f.foreignWorkspace}::uuid`;expect(ownedForeign.n).toBe(1);
 await expect(listOperations(f.app,f.identities.author,f.scope,{limit:101})).rejects.toThrow('invalid');await expect(listOperations(f.app,f.identities.author,f.scope,{query:'forbidden payload'} as never)).rejects.toThrow('invalid');
});
test('health HTTP reports provider failure and unknown timeout without exposing secrets',async()=>{
 const fail:Embedder={identity:model.identity,embed:async()=>{throw new Error('DO_NOT_REPORT_SECRET');}};
 const handler=createOperationsGateway(f.app,f.humanConfig,'https://operations.invalid',fail),server=Bun.serve({hostname:'127.0.0.1',port:0,fetch:handler});
 try{const url=`http://127.0.0.1:${server.port}/api/health?group_id=${f.scope.groupId}&workspace_id=${f.scope.workspaceId}`;
 expect((await fetch(url)).status).toBe(401);const response=await fetch(url,{headers:{'Cf-Access-Jwt-Assertion':f.jwt('author')}});expect(response.status).toBe(200);const body=await response.json() as Awaited<ReturnType<typeof scopedHealth>>;expect(body.outcome).toBe('partial');expect(body.components.embedding).toBe('failed');expect(body.components.ruvector).toBe('unknown');expect(JSON.stringify(body)).not.toContain('DO_NOT_REPORT_SECRET');
 }finally{await server.stop(true);}
 const controller=new AbortController();let observed=false,finish!:()=>void;const pending:Embedder={identity:model.identity,embed:async(_,signal)=>new Promise<number[]>((resolve)=>{finish=()=>resolve(Array.from({length:384},(_,i)=>i===0?1:0));signal?.addEventListener('abort',()=>{observed=true;});})};
 const result=scopedHealth(f.app,f.identities.author,f.scope,pending,controller.signal);await Bun.sleep(30);controller.abort();await expect(result).rejects.toThrow();expect(observed).toBe(true);finish();await Bun.sleep(1);
 const timed=await scopedHealth(f.app,f.identities.author,f.scope,{identity:model.identity,embed:async()=>new Promise<number[]>(resolve=>{setTimeout(()=>resolve(Array.from({length:384},(_,i)=>i===0?1:0)),2100);})});expect(timed.components.embedding).toBe('unknown');expect(timed.reason).toBe('timeout');await Bun.sleep(120);
},5000);
test('promotion observations require committed independent decisions and disappear on rollback',async()=>{
 const proposal=await submitProposal(f.app,f.identities.machine,f.scope,{summary:'DO_NOT_REPORT_PROMOTION',assertionKind:'observation',evidenceIds:[eventId]});
 const receipt=JSON.parse(await decideProposal(f.app,f.identities.reviewer,f.scope,{proposalId:proposal.id,reviewedProposalVersion:1,decision:'approve',rationale:'independent fixture decision',evidenceIds:[eventId],operationKey:randomUUID()}));
 const observations=await listOperations(f.app,f.identities.author,f.scope,{limit:100});expect(observations.some(r=>r.stage==='promotion'&&r.correlationId===receipt.semantic_version_id&&r.outcome==='succeeded')).toBe(true);expect(JSON.stringify(observations)).not.toContain('DO_NOT_REPORT_PROMOTION');
 const rollbackId=randomUUID();await expect(scopedTransaction(f.app,f.identities.machine,f.scope,'memory:capture',async tx=>{await tx`INSERT INTO allura.events(group_id,workspace_id,id,actor_id,kind,payload) VALUES(${f.scope.groupId},${f.scope.workspaceId}::uuid,${rollbackId}::uuid,${f.ids.machine}::uuid,'capture','{"content":"rollback"}')`;throw new Error('rollback');})).rejects.toThrow('rollback');
 const rows=await f.owner`SELECT id FROM allura.operation_observations WHERE correlation_id=${rollbackId}::uuid`;expect(rows).toHaveLength(0);
});
test('saturated provider admission reports unknown readiness without invoking a probe',async()=>{
 const release:(()=>void)[]=[],pending:Promise<void>[]=[];let calls=0;
 while(indexWorkStatus().accepting){pending.push(boundedIndexWork(async()=>new Promise<void>(resolve=>release.push(resolve))).catch(()=>{}));}
 try{const health=await scopedHealth(f.app,f.identities.author,f.scope,{identity:model.identity,embed:async()=>{calls++;throw new Error('must not run');}});expect(health.reason).toBe('busy');expect(health.components.embedding).toBe('unknown');expect(health.components.ruvector).toBe('unknown');expect(health.budgets.accepting).toBe(false);expect(calls).toBe(0);}
 finally{for(const finish of release){finish();}await Promise.all(pending);}
});
