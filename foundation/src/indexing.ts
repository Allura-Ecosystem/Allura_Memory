import {type SQL} from 'bun';
import {type Identity} from './authentication.ts';
import {AuthorityError,type Scope,validScope} from './authority.ts';
import {scopedTransaction} from './persistence.ts';
import {DecisionError} from './decisions.ts';
import {EMBEDDING,type Embedder,validateVector,boundedIndexWork} from './embedding.ts';
export function validateModel(provider:Embedder):void{
  if(Object.entries(EMBEDDING).some(([key,value])=>provider.identity[key as keyof typeof EMBEDDING]!==value)){throw new Error('invalid_model');}
}
export async function drainIndexBatch(sql:SQL,identity:Identity,scope:Scope,provider:Embedder,limit=8):Promise<{kind:'event'|'semantic';id:string;state:string}[]>{
  if(!Number.isSafeInteger(limit)||limit<1||limit>8){throw new DecisionError('invalid');}validateModel(provider);
  const candidates=await scopedTransaction(sql,identity,scope,'proposal:write',async tx=>await tx`SELECT * FROM allura.index_candidates(${scope.groupId},${scope.workspaceId}::uuid,${limit})` as {kind:'event'|'semantic';id:string}[]);
  const results:{kind:'event'|'semantic';id:string;state:string}[]=[];
  for(const source of candidates){results.push({...source,...await captureIndex(sql,identity,scope,source.kind,source.id,provider)});}
  return results;
}
export async function captureIndex(sql:SQL,identity:Identity,scope:Scope,kind:'event'|'semantic',sourceId:string,provider:Embedder):Promise<{state:string}>{
  if(!['event','semantic'].includes(kind)||!validScope({...scope,workspaceId:sourceId})){throw new DecisionError('invalid');}validateModel(provider);
  try{
    const claim=await scopedTransaction(sql,identity,scope,'proposal:write',async tx=>{
      const [row]=await tx`SELECT allura.claim_index(${scope.groupId},${scope.workspaceId}::uuid,${kind},${sourceId}::uuid) AS claim`;return row.claim as {state:string;leaseId?:string;content?:string};
    });
    if(claim.state!=='claimed'){return {state:claim.state};}
    let vector:number[]=[];let success=false;
    try{vector=await boundedIndexWork(provider.embed(claim.content!));validateVector(vector);success=true;}catch{success=false;}
    return await scopedTransaction(sql,identity,scope,'proposal:write',async tx=>{
      const [row]=await tx`SELECT allura.finish_index(${scope.groupId},${scope.workspaceId}::uuid,${kind},${sourceId}::uuid,${claim.leaseId!}::uuid,${vector}::jsonb,${success}) AS state`;return {state:row.state as string};
    });
  }catch(error){
    if(error instanceof AuthorityError||error instanceof DecisionError){throw error;}
    const message=error instanceof Error?error.message:'';
    if(message==='invalid'||message==='conflict'||message==='forbidden'||message==='not_found'){throw new DecisionError(message);}
    const failure=new DecisionError('unknown');failure.cause=error;throw failure;
  }
}
