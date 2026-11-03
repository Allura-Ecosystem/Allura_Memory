import { type SQL, type TransactionSQL } from 'bun';
import { createHash } from 'node:crypto';
import { type Identity } from './authentication.ts';
import { AuthorityError,type Scope,validScope } from './authority.ts';
import { DecisionError } from './decisions.ts';
import { scopedTransaction } from './persistence.ts';
function normalizeCorrection(scope:Scope,request:Record<string,unknown>){
  const id=(v:unknown)=>typeof v==='string'&&validScope({...scope,workspaceId:v});
  const text=(v:unknown,max:number)=>typeof v==='string'&&v.trim().length>0&&Buffer.byteLength(v)<=max&&!/\u0000|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(v);
  if(!request||Array.isArray(request)||Object.keys(request).some(k=>!['baseMemoryId','expectedBaseVersion','content','rationale','evidenceIds','operationKey','proposalId','expectedProposalVersion'].includes(k))||
    !id(request.baseMemoryId)||typeof request.expectedBaseVersion!=='string'||!/^[1-9][0-9]{0,9}$/.test(request.expectedBaseVersion)||Number(request.expectedBaseVersion)>=2147483647||
    !text(request.content,12000)||!text(request.rationale,4000)||typeof request.operationKey!=='string'||!/^[A-Za-z0-9._:-]{1,128}$/.test(request.operationKey)||
    !Array.isArray(request.evidenceIds)||request.evidenceIds.length<1||request.evidenceIds.length>31||Array.from(request.evidenceIds).some(v=>!id(v))||new Set(request.evidenceIds).size!==request.evidenceIds.length||
    (request.proposalId!==undefined&&(!id(request.proposalId)||!Number.isSafeInteger(request.expectedProposalVersion)||Number(request.expectedProposalVersion)<1))||
    (request.proposalId===undefined&&request.expectedProposalVersion!==undefined)){throw new DecisionError('invalid');}
  const input={baseMemoryId:request.baseMemoryId,expectedBaseVersion:request.expectedBaseVersion,content:request.content,rationale:request.rationale,evidenceIds:[...request.evidenceIds].sort(),operationKey:request.operationKey,...(request.proposalId===undefined?{}:{proposalId:request.proposalId,expectedProposalVersion:request.expectedProposalVersion})};
  return input;
}
/** Trusted transaction composition; SQL still checks current actor, scope, head and evidence. */
export async function submitCorrectionInTransaction(tx:TransactionSQL,scope:Scope,request:Record<string,unknown>):Promise<string>{
      const input=normalizeCorrection(scope,request);
      const [actor]=await tx`SELECT current_setting('allura.principal') AS id`;
      const digest=createHash('sha256').update(JSON.stringify(['correction-v1',scope.groupId,scope.workspaceId,actor.id,input.baseMemoryId,input.expectedBaseVersion,input.content,input.rationale,input.evidenceIds,input.proposalId??null,input.expectedProposalVersion??null])).digest('hex');
      const [row]=await tx`SELECT allura.submit_correction(${scope.groupId},${scope.workspaceId}::uuid,${input}::jsonb,${digest}) AS receipt`;
      return row.receipt as string;
}
export async function submitCorrection(sql:SQL,identity:Identity,scope:Scope,request:Record<string,unknown>):Promise<string>{
  const input=normalizeCorrection(scope,request);
  try{
    return await scopedTransaction(sql,identity,scope,'proposal:write',tx=>submitCorrectionInTransaction(tx,scope,input));
  }catch(error){
    if(error instanceof AuthorityError||error instanceof DecisionError){throw error;}
    const message=error instanceof Error?error.message:'';
    if(message==='invalid'||message==='conflict'||message==='forbidden'||message==='not_found'){throw new DecisionError(message);}
    throw new DecisionError('unknown');
  }
}
