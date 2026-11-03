import {type SQL,type TransactionSQL} from 'bun';
import {createHash} from 'node:crypto';
import {type Identity} from './authentication.ts';
import {AuthorityError,type Scope} from './authority.ts';
import {scopedTransaction} from './persistence.ts';
import {ProjectionError,parseDestination,projectionEnvelope,compareReadBack,type ProjectionEnvelope} from './projection-contract.ts';
const id=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
function check(value:unknown):asserts value{if(!value){throw new ProjectionError('invalid');}}
async function safe<T>(work:()=>Promise<T>):Promise<T>{try{return await work();}catch(error){if(error instanceof AuthorityError||error instanceof ProjectionError){throw error;}const message=error instanceof Error?error.message:'';if(message==='invalid'||message==='conflict'||message==='forbidden'||message==='not_found'){throw new ProjectionError(message);}throw new ProjectionError('unknown');}}
export type TransferRequest={semanticVersionId:string;destinationId:string;destinationRevision:number;rationale:string;evidenceIds:string[];operationKey:string};
function request(value:TransferRequest):TransferRequest{
 check(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===6&&['semanticVersionId','destinationId','destinationRevision','rationale','evidenceIds','operationKey'].every(k=>Object.hasOwn(value,k)));
 check(id(value.semanticVersionId)&&id(value.destinationId)&&Number.isSafeInteger(value.destinationRevision)&&value.destinationRevision>0&&value.destinationRevision<=2147483647);
 check(typeof value.rationale==='string'&&value.rationale.trim()&&Buffer.byteLength(value.rationale)<=4000&&!value.rationale.includes('\u0000')&&Buffer.from(value.rationale).toString()===value.rationale);
 check(Array.isArray(value.evidenceIds)&&value.evidenceIds.length>=1&&value.evidenceIds.length<=32&&Array.from(value.evidenceIds).every(id)&&new Set(value.evidenceIds).size===value.evidenceIds.length);
 check(typeof value.operationKey==='string'&&/^[A-Za-z0-9._:-]{1,128}$/.test(value.operationKey));
 return {...value,evidenceIds:[...value.evidenceIds].sort()};
}
function envelope(scope:Scope,e:ProjectionEnvelope):ProjectionEnvelope{
 const result=projectionEnvelope(scope,parseDestination(e.destination,true),{semanticVersionId:e.semanticVersionId,decisionId:e.decisionId,version:e.version,content:e.content});
 if(result.digest!==e.digest||result.binding!==e.binding){throw new ProjectionError('conflict');}return result;
}
export async function authorizeProjection(sql:SQL,identity:Identity,scope:Scope,value:TransferRequest):Promise<string>{
 const input=request(value);return safe(()=>scopedTransaction(sql,identity,scope,'workspace:grants:manage',async tx=>{
  const [row]=await tx`SELECT allura.prepare_projection(${scope.groupId},${scope.workspaceId}::uuid,${input.semanticVersionId}::uuid,${input.destinationId}::uuid,${input.destinationRevision}) AS prepared`;
  const p=row.prepared as {source:{semanticVersionId:string;decisionId:string;version:number;content:string};destination:unknown;actor:string};
  const e=projectionEnvelope(scope,parseDestination(p.destination,true),{semanticVersionId:p.source.semanticVersionId,decisionId:p.source.decisionId,version:p.source.version,content:p.source.content});
  const digest=createHash('sha256').update(JSON.stringify(['projection-transfer-v1',scope.groupId,scope.workspaceId,p.actor,input.semanticVersionId,input.destinationId,input.destinationRevision,e.digest,input.rationale,input.evidenceIds])).digest('hex');
  const [result]=await tx`SELECT allura.authorize_projection(${scope.groupId},${scope.workspaceId}::uuid,${input}::jsonb,${e}::jsonb,${digest}) AS receipt`;return result.receipt as string;
 }));
}
export type ClaimRef={leaseId:string;fence:number};
export type ProjectionClaim=({state:'claimed';mode:'read_then_write'|'reconcile';envelope:ProjectionEnvelope}&ClaimRef)|{state:'idle'};
function reference(transferId:string,ref:ClaimRef){check(id(transferId)&&ref&&id(ref.leaseId)&&Number.isSafeInteger(ref.fence)&&ref.fence>=1&&ref.fence<=5);}
export async function claimProjection(sql:SQL,identity:Identity,scope:Scope,transferId:string):Promise<ProjectionClaim>{
 check(id(transferId));return safe(()=>scopedTransaction(sql,identity,scope,'workspace:grants:manage',async tx=>{const [row]=await tx`SELECT allura.claim_projection(${scope.groupId},${scope.workspaceId}::uuid,${transferId}::uuid) AS claim`;const c=row.claim as ProjectionClaim;return c.state==='claimed'?{...c,envelope:envelope(scope,c.envelope)}:c;}));
}
// Trusted server callback only. Holding these current authority/source/transfer/lease
// locks over a bounded request serializes revocation; no arbitrary SQL/network public API.
export async function withProjectionWork<T>(sql:SQL,identity:Identity,scope:Scope,transferId:string,ref:ClaimRef,work:(e:ProjectionEnvelope,tx:TransactionSQL)=>Promise<T>):Promise<T>{
 reference(transferId,ref);return safe(()=>scopedTransaction(sql,identity,scope,'workspace:grants:manage',async tx=>{const [row]=await tx`SELECT allura.projection_work(${scope.groupId},${scope.workspaceId}::uuid,${transferId}::uuid,${ref.leaseId}::uuid,${ref.fence}) AS envelope`;return work(envelope(scope,row.envelope as ProjectionEnvelope),tx);}));
}
export async function markProjectionWrite(sql:SQL,identity:Identity,scope:Scope,transferId:string,ref:ClaimRef):Promise<void>{
 reference(transferId,ref);return safe(()=>scopedTransaction(sql,identity,scope,'workspace:grants:manage',async tx=>{await tx`SELECT allura.mark_projection_write(${scope.groupId},${scope.workspaceId}::uuid,${transferId}::uuid,${ref.leaseId}::uuid,${ref.fence})`;}));
}
export type ProjectionObservation={page:unknown}|{reason:'timeout'|'unavailable'|'rate_limited';retryAfterMs?:number};
export async function finishProjection(sql:SQL,identity:Identity,scope:Scope,transferId:string,ref:ClaimRef,observation:ProjectionObservation):Promise<void>{
 check(observation&&typeof observation==='object'&&!Array.isArray(observation));
 if('page' in observation){check(Object.keys(observation).length===1);}else{check(Object.keys(observation).every(k=>['reason','retryAfterMs'].includes(k))&&['timeout','unavailable','rate_limited'].includes(observation.reason));check(observation.retryAfterMs===undefined||(Number.isSafeInteger(observation.retryAfterMs)&&observation.retryAfterMs>=0&&observation.retryAfterMs<=86400000));}
 return withProjectionWork(sql,identity,scope,transferId,ref,async(e,tx)=>{
  const comparison='page' in observation?compareReadBack(e,observation.page):undefined;
  const status=comparison==='match'?'synced':comparison==='conflict'?'failed':'unknown';
  const reason=comparison==='match'?'matched':comparison==='conflict'?'conflict':comparison==='empty'?'empty':('reason' in observation?observation.reason:'unavailable');
  const retry='retryAfterMs' in observation?observation.retryAfterMs??0:0;
  await tx`SELECT allura.finish_projection(${scope.groupId},${scope.workspaceId}::uuid,${transferId}::uuid,${ref.leaseId}::uuid,${ref.fence},${status},${reason},${retry})`;
 });
}
export type ProjectionStatus={transferId:string;sourceVersionId:string;decisionId:string;destinationId:string;destinationRevision:number;pageId:string;intendedDigest:string;status:'queued'|'unknown'|'synced'|'failed';attempts:number;exhausted:boolean;availableAt:string;observationId:string;observedAt:string;observer:string;reason:string;verifiedDigest:string|null;active:boolean;sourceCurrent:boolean};
export async function projectionStatus(sql:SQL,identity:Identity,scope:Scope,transferId:string):Promise<ProjectionStatus>{
 check(id(transferId));return safe(()=>scopedTransaction(sql,identity,scope,'audit:read',async tx=>{const [row]=await tx`SELECT allura.projection_status(${scope.groupId},${scope.workspaceId}::uuid,${transferId}::uuid) AS status`;return row.status as ProjectionStatus;}));
}
export async function revokeProjection(sql:SQL,identity:Identity,scope:Scope,transferId:string):Promise<void>{
 check(id(transferId));return safe(()=>scopedTransaction(sql,identity,scope,'workspace:grants:manage',async tx=>{await tx`SELECT allura.revoke_projection(${scope.groupId},${scope.workspaceId}::uuid,${transferId}::uuid)`;}));
}
