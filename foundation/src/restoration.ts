import { type SQL } from 'bun';
import { createHash } from 'node:crypto';
import { type Identity } from './authentication.ts';
import { AuthorityError,type Scope,validScope } from './authority.ts';
import { DecisionError } from './decisions.ts';
import { scopedTransaction } from './persistence.ts';
export async function submitRestoration(sql:SQL,identity:Identity,scope:Scope,request:Record<string,unknown>):Promise<string>{
  const id=(v:unknown)=>typeof v==='string'&&validScope({...scope,workspaceId:v});
  if(!request||Array.isArray(request)||Object.keys(request).some(k=>!['sourceMemoryId','expectedHeadId','expectedHeadRevision','rationale','evidenceIds','operationKey'].includes(k))||
    !id(request.sourceMemoryId)||!id(request.expectedHeadId)||!Number.isSafeInteger(request.expectedHeadRevision)||Number(request.expectedHeadRevision)<1||Number(request.expectedHeadRevision)>=2147483647||
    typeof request.rationale!=='string'||!request.rationale.trim()||Buffer.byteLength(request.rationale)>4000||/\u0000|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(request.rationale)||
    typeof request.operationKey!=='string'||!/^[A-Za-z0-9._:-]{1,128}$/.test(request.operationKey)||
    !Array.isArray(request.evidenceIds)||request.evidenceIds.length<1||request.evidenceIds.length>31||Array.from(request.evidenceIds).some(v=>!id(v))||new Set(request.evidenceIds).size!==request.evidenceIds.length){throw new DecisionError('invalid');}
  const input={sourceMemoryId:request.sourceMemoryId,expectedHeadId:request.expectedHeadId,expectedHeadRevision:request.expectedHeadRevision,rationale:request.rationale,evidenceIds:[...request.evidenceIds].sort(),operationKey:request.operationKey};
  try{return await scopedTransaction(sql,identity,scope,'proposal:write',async tx=>{
    const [actor]=await tx`SELECT current_setting('allura.principal') AS id`;
    const digest=createHash('sha256').update(JSON.stringify(['restoration-v1',scope.groupId,scope.workspaceId,actor.id,input.sourceMemoryId,input.expectedHeadId,input.expectedHeadRevision,input.rationale,input.evidenceIds])).digest('hex');
    const [row]=await tx`SELECT allura.submit_restoration(${scope.groupId},${scope.workspaceId}::uuid,${input}::jsonb,${digest}) AS receipt`;
    return row.receipt as string;
  });}catch(error){
    if(error instanceof AuthorityError||error instanceof DecisionError){throw error;}
    const message=error instanceof Error?error.message:'';
    if(message==='invalid'||message==='conflict'||message==='forbidden'||message==='not_found'){throw new DecisionError(message);}
    throw new DecisionError('unknown');
  }
}
