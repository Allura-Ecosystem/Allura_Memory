import { type SQL } from 'bun';
import { createHash } from 'node:crypto';
import { type Identity } from './authentication.ts';
import { AuthorityError,type Scope,validScope } from './authority.ts';
import { DecisionError } from './decisions.ts';
import { scopedTransaction } from './persistence.ts';
const validId=(scope:Scope,id:unknown):id is string=>typeof id==='string'&&validScope({...scope,workspaceId:id});
async function safe<T>(work:()=>Promise<T>):Promise<T>{
  try{return await work();}catch(error){
    if(error instanceof AuthorityError||error instanceof DecisionError){throw error;}
    const message=error instanceof Error?error.message:'';
    if(message==='invalid'||message==='conflict'||message==='forbidden'||message==='not_found'){throw new DecisionError(message);}
    throw new DecisionError('unknown');
  }
}
export async function deleteMemory(sql:SQL,identity:Identity,scope:Scope,request:Record<string,unknown>):Promise<string>{
  if(!request||Array.isArray(request)||Object.keys(request).some(k=>!['memoryId','expectedHeadRevision','reason','operationKey'].includes(k))||
    !validId(scope,request.memoryId)||!Number.isSafeInteger(request.expectedHeadRevision)||Number(request.expectedHeadRevision)<1||Number(request.expectedHeadRevision)>=2147483647||
    typeof request.reason!=='string'||!request.reason.trim()||Buffer.byteLength(request.reason)>4000||/\u0000|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(request.reason)||
    typeof request.operationKey!=='string'||!/^[A-Za-z0-9._:-]{1,128}$/.test(request.operationKey)){throw new DecisionError('invalid');}
  const input={memoryId:request.memoryId,expectedHeadRevision:request.expectedHeadRevision,reason:request.reason,operationKey:request.operationKey};
  return safe(()=>scopedTransaction(sql,identity,scope,'memory:delete',async tx=>{
    const [actor]=await tx`SELECT current_setting('allura.principal') AS id`;
    const digest=createHash('sha256').update(JSON.stringify(['delete-v1',scope.groupId,scope.workspaceId,actor.id,input.memoryId,input.expectedHeadRevision,input.reason])).digest('hex');
    const [row]=await tx`SELECT allura.delete_memory(${scope.groupId},${scope.workspaceId}::uuid,${input}::jsonb,${digest}) AS receipt`;
    return row.receipt as string;
  }));
}
export type HistoricalMemory={id:string;knowledgeId:string;version:number;content:string;lifecycle:'current'|'superseded'|'deprecated';headRevision:number;createdAt:Date;supersedes:string|null;equivalentTo:string|null};
export async function knowledgeHistory(sql:SQL,identity:Identity,scope:Scope,knowledgeId:string,limit=50):Promise<HistoricalMemory[]>{
  if(!validId(scope,knowledgeId)||!Number.isSafeInteger(limit)||limit<1||limit>50){throw new DecisionError('invalid');}
  return safe(()=>scopedTransaction(sql,identity,scope,'memory:read',async tx=>await tx`
    SELECT v.id,v.knowledge_id AS "knowledgeId",v.version,v.content,v.created_at AS "createdAt",h.revision AS "headRevision",
      CASE WHEN v.id=h.current_version_id THEN h.lifecycle ELSE 'superseded' END AS lifecycle,s.older_id AS supersedes,e.canonical_id AS "equivalentTo"
    FROM allura.semantic_versions v JOIN allura.semantic_heads h ON h.group_id=v.group_id AND h.workspace_id=v.workspace_id AND h.knowledge_id=v.knowledge_id
    LEFT JOIN allura.semantic_supersedes s ON s.group_id=v.group_id AND s.workspace_id=v.workspace_id AND s.newer_id=v.id
    LEFT JOIN allura.semantic_equivalences e ON e.group_id=v.group_id AND e.workspace_id=v.workspace_id AND e.memory_id=v.id
    WHERE v.group_id=${scope.groupId} AND v.workspace_id=${scope.workspaceId}::uuid AND v.knowledge_id=${knowledgeId}::uuid ORDER BY v.version DESC LIMIT ${limit}
  ` as HistoricalMemory[]));
}
