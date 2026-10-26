import { type SQL } from 'bun';
import { type Identity } from './authentication.ts';
import { AuthorityError, validScope, type Scope } from './authority.ts';
import { scopedTransaction } from './persistence.ts';
export class ProposalError extends Error {
  constructor(public readonly code:'invalid'|'forbidden'|'not_found'|'conflict'|'unknown'){super(code);this.name='ProposalError';}
}
export type Proposal={id:string;version:number;currentVersion?:number;state:'pending'|'needs_evidence'|'approved'|'rejected';requesterId:string;producerId:string;summary:string;confidence:number;confidenceOrigin:'submitter'|'unscored';assertionKind:'observation'|'inference';evidenceIds:string[];correction?:{baseMemoryId:string;expectedBaseVersion:string;knowledgeId:string;baseContent:string;rationale:string;currentHeadId:string;headLifecycle:'current'|'deprecated';headRevision:number;restoration:{sourceMemoryId:string;expectedHeadRevision:number}|null}|null};
const validId=(scope:Scope,id:unknown):id is string=>typeof id==='string'&&validScope({...scope,workspaceId:id});
function validate(scope:Scope,input:Record<string,unknown>):void {
  if(!input||Array.isArray(input)||Object.keys(input).some(k=>!['summary','confidence','assertionKind','evidenceIds','proposalId','expectedVersion'].includes(k))||
    typeof input.summary!=='string'||!input.summary.trim()||Buffer.byteLength(input.summary)>12000||input.summary.includes('\u0000')||
    !['observation','inference'].includes(input.assertionKind as string)||
    (Object.hasOwn(input,'confidence')&&(typeof input.confidence!=='number'||!Number.isFinite(input.confidence)||input.confidence<0||input.confidence>1))||
    !Array.isArray(input.evidenceIds)||input.evidenceIds.length<1||input.evidenceIds.length>32||input.evidenceIds.some(id=>!validId(scope,id))||new Set(input.evidenceIds).size!==input.evidenceIds.length||
    (input.proposalId!==undefined&&(!validId(scope,input.proposalId)||!Number.isSafeInteger(input.expectedVersion)||Number(input.expectedVersion)<1))||
    (input.proposalId===undefined&&input.expectedVersion!==undefined)){throw new ProposalError('invalid');}
}
async function safe<T>(work:()=>Promise<T>):Promise<T>{
  try{return await work();}catch(error){
    if(error instanceof AuthorityError||error instanceof ProposalError){throw error;}
    const message=error instanceof Error?error.message:'';
    if(message==='forbidden'||message==='not_found'||message==='conflict'||message==='invalid'){throw new ProposalError(message);}
    throw new ProposalError('unknown');
  }
}
export async function submitProposal(sql:SQL,identity:Identity,scope:Scope,input:Record<string,unknown>):Promise<Proposal>{
  validate(scope,input);
  return safe(()=>scopedTransaction(sql,identity,scope,'proposal:write',async tx=>{
    const [row]=await tx`SELECT allura.submit_proposal(${scope.groupId},${scope.workspaceId}::uuid,${input}::jsonb) AS proposal`;
    return row.proposal as Proposal;
  }));
}
export async function proposeCapture(sql:SQL,identity:Identity,scope:Scope,eventId:string):Promise<Proposal>{
  if(!validId(scope,eventId)){throw new ProposalError('invalid');}
  return safe(()=>scopedTransaction(sql,identity,scope,'proposal:write',async tx=>{
    const [row]=await tx`SELECT allura.proposal_source(${scope.groupId},${scope.workspaceId}::uuid,${eventId}::uuid) AS evidence`;
    if(!row.evidence||typeof row.evidence.payload.content!=='string'){throw new ProposalError('not_found');}
    // Verbatim bounded observation, not an invented model summary/confidence.
    const text=row.evidence.payload.content as string;
    let summary=text.slice(0,3000);if(summary.length&&/[\uD800-\uDBFF]$/.test(summary)){summary=summary.slice(0,-1);}
    const input={summary,evidenceIds:[eventId],assertionKind:'observation'};validate(scope,input);
    const [result]=await tx`SELECT allura.submit_proposal(${scope.groupId},${scope.workspaceId}::uuid,${input}::jsonb) AS proposal`;
    return result.proposal as Proposal;
  }));
}
export async function getProposal(sql:SQL,identity:Identity,scope:Scope,id:string,version?:number):Promise<Proposal>{
  if(!validId(scope,id)||(version!==undefined&&(!Number.isSafeInteger(version)||version<1))){throw new ProposalError('invalid');}
  return safe(()=>scopedTransaction(sql,identity,scope,'review:read',async tx=>{
    const [row]=await tx`SELECT v.*,s.state,s.current_version FROM allura.proposal_versions v JOIN allura.proposal_state s ON s.group_id=v.group_id AND s.workspace_id=v.workspace_id AND s.id=v.proposal_id WHERE v.group_id=${scope.groupId} AND v.workspace_id=${scope.workspaceId}::uuid AND v.proposal_id=${id}::uuid AND v.version=coalesce(${version??null}::integer,s.current_version)`;
    if(!row){throw new ProposalError('not_found');}
    const links=await tx`SELECT event_id FROM allura.proposal_evidence WHERE group_id=${scope.groupId} AND workspace_id=${scope.workspaceId}::uuid AND proposal_id=${id}::uuid AND version=${row.version} ORDER BY event_id`;
    const [context]=await tx`SELECT allura.correction_context(${scope.groupId},${scope.workspaceId}::uuid,${id}::uuid,${row.version}) AS correction`;
    return {id,version:row.version,currentVersion:row.current_version,state:row.state,requesterId:row.requester_id,producerId:row.producer_id,summary:row.summary,confidence:row.confidence,confidenceOrigin:row.confidence_origin,assertionKind:row.assertion_kind,evidenceIds:links.map((x:{event_id:string})=>x.event_id),correction:context.correction} as Proposal;
  }));
}
export async function getProposalEvidence(sql:SQL,identity:Identity,scope:Scope,id:string,version:number,eventId:string):Promise<{id:string;actorId:string;payload:Record<string,unknown>;createdAt:string}>{
  if(!validId(scope,id)||!validId(scope,eventId)||!Number.isSafeInteger(version)||version<1){throw new ProposalError('invalid');}
  return safe(()=>scopedTransaction(sql,identity,scope,'review:read',async tx=>{
    const [row]=await tx`SELECT allura.linked_proposal_evidence(${scope.groupId},${scope.workspaceId}::uuid,${id}::uuid,${version},${eventId}::uuid) AS evidence`;
    if(!row.evidence){throw new ProposalError('not_found');}return row.evidence;
  }));
}
