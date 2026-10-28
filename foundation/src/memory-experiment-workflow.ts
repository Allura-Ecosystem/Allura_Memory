import {type SQL} from 'bun';
import {createHash} from 'node:crypto';
import {isAuthenticated,type Identity} from './authentication.ts';
import {AuthorityError,resolveAuthority,type Scope} from './authority.ts';
import {DatabaseStore,scopedTransaction} from './persistence.ts';
import {captureInTransaction,CaptureError} from './capture.ts';
import {submitCorrectionInTransaction} from './corrections.ts';
import {DecisionError} from './decisions.ts';
import {MemoryExperimentEngine} from './memory-experiment.ts';
import {createWorkBudget,WorkBudgetError} from './work-budget.ts';
import {boundedArray,experimentId,experimentLimits,memoryId,parseScope,parseSnapshot,snapshotDigest,sameScope,ExperimentError} from './memory-experiment-contract.ts';
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const submissionKey=(key:unknown)=>`experiment:${hash(experimentId(key))}`;
function failure(error:unknown):never{
 if(error instanceof AuthorityError||error instanceof ExperimentError||error instanceof CaptureError||error instanceof DecisionError||error instanceof WorkBudgetError){throw error;}
 const text=error instanceof Error?error.message:'';
 if(text==='invalid'||text==='conflict'||text==='forbidden'||text==='not_found'){throw new DecisionError(text);}
 throw new DecisionError('unknown');
}
function worker(identity:Identity){if(!isAuthenticated(identity)){throw new AuthorityError('unauthenticated');}if(identity.kind==='human'){throw new AuthorityError('forbidden');}}
/** One host instance per admission domain. Work is trusted code, never request payloads.
 * Deadlines retain occupied slots until underlying work settles; unknown writes reconcile by receipt. */
export function createMemoryExperimentHost(sql:SQL,limits={capacity:2,timeoutMs:2000}){
 const budget=createWorkBudget(limits);
 return Object.freeze({snapshot:budget.snapshot,run:<T>(identity:Identity,scope:Scope,ids:unknown,work:(workflow:Awaited<ReturnType<typeof openMemoryExperiment>>)=>Promise<T>,external?:AbortSignal)=>budget.run(async signal=>{
  const workflow=await openMemoryExperiment(sql,identity,scope,ids,experimentLimits.defaultTtlMs,signal),dispose=()=>workflow.engine.destroy();
  signal.addEventListener('abort',dispose,{once:true});
  try{if(signal.aborted){throw new WorkBudgetError('cancelled',true);}return await work(workflow);}finally{signal.removeEventListener('abort',dispose);dispose();}
 },external)});
}
/** Low-level trusted constructor; host owns lifetime. Use createMemoryExperimentHost for bounded crew work. */
export async function openMemoryExperiment(sql:SQL,identity:Identity,requestedScope:Scope,selection:unknown,ttlMs:number,signal?:AbortSignal){
 const active=()=>{if(signal?.aborted){throw signal.reason instanceof WorkBudgetError?signal.reason:new WorkBudgetError('cancelled',true);}};active();
 worker(identity);const scope=parseScope(requestedScope),ids=Object.freeze(boundedArray(selection,1,experimentLimits.records).map(memoryId).sort());
 if(new Set(ids).size!==ids.length||!Number.isSafeInteger(ttlMs)||ttlMs<1||ttlMs>experimentLimits.maxTtlMs){throw new ExperimentError('invalid');}
 const snapshotId=`selection:${hash([scope,ids])}`;
 const readSnapshot=async(initial=false)=>{
  active();
  try{return await scopedTransaction(sql,identity,scope,'memory:read',async tx=>{
   const records:{id:string;knowledge_id:string;version:string;content:string;current_version_id:string}[]=await tx`SELECT v.id,v.knowledge_id,v.version::text,v.content,h.current_version_id FROM allura.semantic_versions v JOIN allura.semantic_heads h ON h.group_id=v.group_id AND h.workspace_id=v.workspace_id AND h.knowledge_id=v.knowledge_id WHERE v.group_id=${scope.groupId} AND v.workspace_id=${scope.workspaceId}::uuid AND v.id=ANY(${tx.array([...ids],'TEXT')}::uuid[]) AND h.lifecycle='current' ORDER BY v.id LIMIT 129`;
   if(records.length!==ids.length){throw new ExperimentError('not_found');}
   if(initial&&records.some(r=>r.id!==r.current_version_id)){throw new ExperimentError('conflict');}
   await resolveAuthority(identity,scope,'review:read',new DatabaseStore(tx));
   await tx`SELECT set_config('allura.action','review:read',true)`;
   const provenance:{semantic_version_id:string;event_id:string}[]=await tx`SELECT semantic_version_id,event_id FROM allura.semantic_provenance WHERE group_id=${scope.groupId} AND workspace_id=${scope.workspaceId}::uuid AND semantic_version_id=ANY(${tx.array([...ids],'TEXT')}::uuid[]) ORDER BY semantic_version_id,event_id LIMIT 4097`;
   active();return parseSnapshot({schema:'memory-experiment-base-v1',snapshotId,scope,records:records.map(row=>({scope,memoryId:row.id,knowledgeId:row.knowledge_id,version:row.version,content:row.content,evidenceIds:provenance.filter(p=>p.semantic_version_id===row.id).map(p=>p.event_id)}))},scope);
  });}catch(error){failure(error);}
 };
 const base=await readSnapshot(true);
 const store=new DatabaseStore(sql);
 const bound=(who:Identity,target:Scope)=>{active();if(who!==identity||!sameScope(target,scope)){throw new AuthorityError('forbidden');}};
 const engine=new MemoryExperimentEngine({authority:{resolve:async(who,target)=>{
  bound(who,target);await resolveAuthority(who,target,'review:read',store);return store.resolve(who,target);
 }},readSnapshot:async(who,target,id)=>{bound(who,target);if(id!==snapshotId){throw new ExperimentError('not_found');}return readSnapshot();}});
 let branch;
 try{branch=await engine.create(identity,scope,{snapshotId,expectedBaseDigest:snapshotDigest(base),operationKey:'open',ttlMs});active();}catch(error){engine.destroy();throw error;}
 let busy=false;
 return Object.freeze({engine,branch,submit:async(input:unknown,selectedMemoryId:string,key:string):Promise<string>=>{
  active();if(busy){throw new ExperimentError('busy');}busy=true;
  try{
   const selected=memoryId(selectedMemoryId),operationKey=submissionKey(key);
   // Use retained, deeply frozen issued data rather than mutable caller references after await.
   const candidate=await engine.verifiedCandidate(identity,scope,input),change=candidate.changes.find(c=>c.memoryId===selected);
   if(!change){throw new ExperimentError('not_found');}
   if(change.kind!=='replace'||change.after===null||change.evidenceIds.length>30){throw new ExperimentError('invalid');}
   return await scopedTransaction(sql,identity,scope,'memory:capture',async tx=>{
    active();const store=new DatabaseStore(tx);
    await resolveAuthority(identity,scope,'proposal:write',store);await resolveAuthority(identity,scope,'memory:read',store);await resolveAuthority(identity,scope,'review:read',store);
    const [clock]=await tx`SELECT floor(extract(epoch FROM clock_timestamp())*1000)::double precision AS now`;
    if(clock.now>=candidate.expiresAt){throw new ExperimentError('expired');}
    const witness={schema:'memory-experiment-evidence-v1',candidateDigest:candidate.candidateDigest,baseDigest:candidate.baseDigest,snapshotId:candidate.snapshotId,branchId:candidate.branchId,revision:candidate.revision,producerId:candidate.producerId,scope,change,rationale:candidate.rationale,canonicalMutation:false};
    const captured=JSON.parse(await captureInTransaction(tx,identity,scope,{idempotency_key:`experiment:${hash([operationKey,candidate.candidateDigest,selected])}`,content:JSON.stringify(witness),trace_type:'run',threshold:null,metadata:{source:'memory-experiment-v1',source_id:candidate.candidateDigest,tags:['hypothesis','requires-human-review']}})) as {event_id:string};
    await tx`SELECT set_config('allura.action','proposal:write',true)`;
    const receipt=await submitCorrectionInTransaction(tx,scope,{baseMemoryId:change.memoryId,expectedBaseVersion:change.expectedBaseVersion,content:change.after,rationale:candidate.rationale,evidenceIds:[...change.evidenceIds,captured.event_id],operationKey});
    await engine.verifiedCandidate(identity,scope,candidate);
    const [end]=await tx`SELECT floor(extract(epoch FROM clock_timestamp())*1000)::double precision AS now`;
    active();if(end.now>=candidate.expiresAt){throw new ExperimentError('expired');}
    return receipt;
   });
  }catch(error){failure(error);}finally{busy=false;}
 }});
}
/** Reconcile only a durable actor-scoped receipt; never restore/import an expired engine. */
export async function readExperimentSubmission(sql:SQL,identity:Identity,requestedScope:Scope,key:string):Promise<string>{
 worker(identity);const scope=parseScope(requestedScope),operationKey=submissionKey(key);
 try{return await scopedTransaction(sql,identity,scope,'proposal:write',async tx=>{
  await resolveAuthority(identity,scope,'memory:read',new DatabaseStore(tx));
  const [row]=await tx`SELECT receipt_text FROM allura.correction_receipts WHERE group_id=${scope.groupId} AND workspace_id=${scope.workspaceId}::uuid AND actor_id=current_setting('allura.principal')::uuid AND operation_key=${operationKey}`;
  if(!row){throw new ExperimentError('not_found');}return row.receipt_text as string;
 });}catch(error){failure(error);}
}
