import { type SQL } from 'bun';
import { createHash } from 'node:crypto';
import { type Identity,isAuthenticated } from './authentication.ts';
import { AuthorityError,type Scope,validScope } from './authority.ts';
import { scopedTransaction } from './persistence.ts';
export class DecisionError extends Error {
  constructor(public readonly code:'invalid'|'forbidden'|'not_found'|'conflict'|'unknown'){super(code);this.name='DecisionError';}
}
function normalize(scope:Scope,input:Record<string,unknown>):Record<string,unknown>{
  const id=(v:unknown)=>typeof v==='string'&&validScope({...scope,workspaceId:v});
  if(!input||Array.isArray(input)||Object.keys(input).some(k=>!['proposalId','reviewedProposalVersion','operationKey','decision','rationale','evidenceIds'].includes(k))||
    !id(input.proposalId)||!Number.isSafeInteger(input.reviewedProposalVersion)||Number(input.reviewedProposalVersion)<1||
    typeof input.operationKey!=='string'||!/^[A-Za-z0-9._:-]{1,128}$/.test(input.operationKey)||
    !['approve','reject','request_evidence'].includes(input.decision as string)||typeof input.rationale!=='string'||!input.rationale.trim()||Buffer.byteLength(input.rationale)>4000||input.rationale.includes('\u0000')||
    !Array.isArray(input.evidenceIds)||input.evidenceIds.length<1||input.evidenceIds.length>32||Array.from(input.evidenceIds).some(v=>!id(v))||new Set(input.evidenceIds).size!==input.evidenceIds.length){throw new DecisionError('invalid');}
  return {proposalId:input.proposalId,reviewedProposalVersion:input.reviewedProposalVersion,operationKey:input.operationKey,decision:input.decision,rationale:input.rationale,evidenceIds:[...input.evidenceIds].sort()};
}
export async function decideProposal(sql:SQL,identity:Identity,scope:Scope,request:Record<string,unknown>):Promise<string>{
  if(!isAuthenticated(identity)){throw new AuthorityError('unauthenticated');}
  if(identity.kind!=='human'){throw new AuthorityError('forbidden');}
  const input=normalize(scope,request);
  try{
    return await scopedTransaction(sql,identity,scope,'review:approve',async tx=>{
      const [row]=await tx`SELECT current_setting('allura.principal') AS principal`;
      const digest=createHash('sha256').update(JSON.stringify(['decision-v1',scope.groupId,scope.workspaceId,row.principal,input.proposalId,input.reviewedProposalVersion,input.decision,input.rationale,input.evidenceIds])).digest('hex');
      const [result]=await tx`SELECT allura.decide_proposal(${scope.groupId},${scope.workspaceId}::uuid,${input}::jsonb,${digest}) AS receipt`;
      return result.receipt as string;
    });
  }catch(error){
    if(error instanceof AuthorityError||error instanceof DecisionError){throw error;}
    const message=error instanceof Error?error.message:'';
    if(message==='forbidden'||message==='invalid'||message==='conflict'||message==='not_found'){throw new DecisionError(message);}
    throw new DecisionError('unknown');
  }
}
