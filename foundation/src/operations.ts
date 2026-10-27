import {type SQL} from 'bun';
import {randomUUID} from 'node:crypto';
import {type Identity} from './authentication.ts';
import {type Scope} from './authority.ts';
import {scopedTransaction} from './persistence.ts';
import {DecisionError} from './decisions.ts';
import {boundedIndexWork,indexWorkStatus,validateVector,EMBEDDING,type Embedder} from './embedding.ts';
import {validateModel} from './indexing.ts';
import {WorkBudgetError} from './work-budget.ts';
import {nativeSearch} from './retrieval-index.ts';
export type Observation={id:string;correlationId:string;stage:'capture'|'indexing'|'retrieval'|'promotion';outcome:'succeeded'|'failed'|'partial'|'unknown';reason:string|null;observedAt:Date};
export type DurableHealth={currentSemantic:number;missingSemanticVectors:number;capturedEvents:number;missingEventVectors:number;jobs:Record<string,number>};
export type Health={outcome:'succeeded'|'partial';observedAt:string;components:Record<'postgres'|'embedding'|'ruvector','succeeded'|'failed'|'unknown'>;durable:DurableHealth;projection:'not_configured';reason:'index_pending'|'unavailable'|'timeout'|'busy'|null;model:typeof EMBEDDING;budgets:{providerCapacity:8;providerDeadlineMs:2000;accepting:boolean};retention:'append_only_no_automatic_deletion'};
export async function listOperations(sql:SQL,identity:Identity,scope:Scope,input:{limit?:number}):Promise<Observation[]>{
 if(!input||Array.isArray(input)||Object.keys(input).some(k=>k!=='limit')||(input.limit!==undefined&&(!Number.isSafeInteger(input.limit)||input.limit<1||input.limit>100))){throw new DecisionError('invalid');}
 return scopedTransaction(sql,identity,scope,'audit:read',tx=>tx`SELECT id,correlation_id AS "correlationId",stage,outcome,reason,observed_at AS "observedAt" FROM allura.operation_observations WHERE group_id=${scope.groupId} AND workspace_id=${scope.workspaceId}::uuid ORDER BY observed_at DESC,id DESC LIMIT ${input.limit??20}` as Promise<Observation[]>);
}
export async function scopedHealth(sql:SQL,identity:Identity,scope:Scope,provider:Embedder,signal?:AbortSignal):Promise<Health>{
 signal?.throwIfAborted();
 return scopedTransaction(sql,identity,scope,'health:read',async tx=>{
  const [row]=await tx`SELECT allura.scoped_operational_health(${scope.groupId},${scope.workspaceId}::uuid) AS durable`;
  const result:Health={outcome:'succeeded',observedAt:new Date().toISOString(),components:{postgres:'succeeded',embedding:'unknown',ruvector:'unknown'},durable:row.durable as DurableHealth,projection:'not_configured',reason:null,model:EMBEDDING,budgets:{providerCapacity:8,providerDeadlineMs:2000,accepting:indexWorkStatus().accepting},retention:'append_only_no_automatic_deletion'};
  const progress:{stage:'embedding'|'ruvector'}={stage:'embedding'};
  try{
   const probe=await boundedIndexWork(async workSignal=>{validateModel(provider);const vector=await provider.embed('Allura local operational readiness probe',workSignal);workSignal.throwIfAborted();validateVector(vector);progress.stage='ruvector';const id=randomUUID();const hits=await nativeSearch([{id,embedding:vector}],vector,1,'',workSignal);workSignal.throwIfAborted();if(hits[0]?.id!==id){throw new Error('native_unavailable');}return true;},signal);
   if(probe){result.components.embedding='succeeded';result.components.ruvector='succeeded';}
  }catch(error){
   signal?.throwIfAborted();result.outcome='partial';result.reason=error instanceof WorkBudgetError&&error.code!=='cancelled'?error.code:'unavailable';
   if(progress.stage==='ruvector'){result.components.embedding='succeeded';}
   result.components[progress.stage]=error instanceof WorkBudgetError?'unknown':'failed';
  }
  if(result.durable.missingSemanticVectors||result.durable.missingEventVectors||Object.entries(result.durable.jobs).some(([state,count])=>state!=='succeeded'&&count>0)){result.outcome='partial';result.reason??='index_pending';}
  result.budgets.accepting=indexWorkStatus().accepting;result.observedAt=new Date().toISOString();return result;
 });
}
