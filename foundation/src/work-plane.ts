import { type SQL, type TransactionSQL } from 'bun';
import { isAuthenticated, type Identity } from './authentication.ts';
import { AuthorityError, type Scope } from './authority.ts';
import { scopedTransaction } from './persistence.ts';
import { parseWorkTransition, workText, WorkPlaneError, parseWorkList, workListBinding, readWorkListCursor, signWorkListCursor, parseWorkCreate } from './work-plane-contract.ts';

export async function authorizeWorkProject(sql:SQL,identity:Identity,scope:Scope,project:string,principalId:string):Promise<string>{
 human(identity);
 try{return await scopedTransaction(sql,identity,scope,'memory:read',async tx=>{
  await originalPrincipal(tx,principalId);
  return (await tx`SELECT allura.work_project_map(${scope.groupId},${scope.workspaceId}::uuid,${project}) AS mapping`)[0].mapping as string;
 });}catch(error){return listFailure(error);}
}
function listFailure(error:unknown):never {
 if(error instanceof AuthorityError||error instanceof WorkPlaneError){throw error;}
 const e=error as {errno?:string;message?:string};
 if(e.errno==='P0001'&&['invalid','forbidden','not_found'].includes(e.message??'')){throw new WorkPlaneError(e.message as 'invalid');}
 throw new WorkPlaneError('unknown');
}
export async function listWorkItems(sql:SQL,identity:Identity,scope:Scope,rawQuery:string,key:Uint8Array,principalId:string):Promise<string>{
 human(identity);
 try{
  const v=parseWorkList(rawQuery);
  if(v.group_id!==scope.groupId||v.workspace_id!==scope.workspaceId){throw new WorkPlaneError('invalid');}
  const result=await scopedTransaction(sql,identity,scope,'memory:read',async tx=>{
   await originalPrincipal(tx,principalId);
   const mapping=(await tx`SELECT allura.work_project_map(${scope.groupId},${scope.workspaceId}::uuid,${v.project_id}) AS mapping`)[0].mapping as string;
   if(v.lane_id!==null){throw new WorkPlaneError('not_found');}
   const binding=workListBinding(v,principalId,mapping),last=v.cursor===null?null:readWorkListCursor(v.cursor,key,binding);
   const items=(await tx`SELECT allura.list_work_items(${scope.groupId},${scope.workspaceId}::uuid,${v.project_id},${v.status},${v.limit},${last?.created_at??null},${last?.id??null}) AS items`)[0].items as {created_at:string;id:string}[];
   const has_more=items.length>v.limit,work_items=items.slice(0,v.limit);
   return {mapping,raw:JSON.stringify({work_items,has_more,next_cursor:has_more?signWorkListCursor(key,binding,work_items.at(-1)!):null})};
  });
  const current=await authorizeWorkProject(sql,identity,scope,v.project_id,principalId);
  if(current!==result.mapping){throw new WorkPlaneError('not_found');}
  return result.raw;
 }catch(error){return listFailure(error);}
}
function human(identity: Identity) {
  if(!isAuthenticated(identity) || identity.expiresAt<=Math.floor(Date.now()/1000)){throw new AuthorityError('unauthenticated');}
  if(identity.kind!=='human'){throw new WorkPlaneError('forbidden');}
}
function failure(error: unknown): never {
  if(error instanceof AuthorityError || error instanceof WorkPlaneError){throw error;}
  const e=error as {errno?:string;message?:string};
  if(e.errno==='P0001' && ['invalid','forbidden','not_found','conflict','capacity'].includes(e.message??'')){throw new WorkPlaneError(e.message as 'invalid');}
  // A server constraint/explicit exception confirms rollback. Transport errors
  // (including a missing commit acknowledgement) never claim no effect.
  if(e.errno?.startsWith('23') || e.errno==='P0001'){throw new WorkPlaneError('failed');}
  throw new WorkPlaneError('unknown');
}
async function originalPrincipal(tx:TransactionSQL,principalId:string|undefined) {
  if(principalId===undefined){return;}
  const [row]=await tx`SELECT current_setting('allura.principal') AS principal`;
  if(row.principal!==principalId){throw new WorkPlaneError('forbidden');}
}
// Admission/disclosure uses the same restricted transaction and SQL entitlement
// guard as the service, without adding work actions to role defaults.
export async function authorizeWorkScope(sql:SQL,identity:Identity,scope:Scope,write:boolean,principalId:string):Promise<void> {
  human(identity);
  try {
    await scopedTransaction(sql,identity,scope,'memory:read',async tx=>{
      await originalPrincipal(tx,principalId);
      await tx`SELECT allura.work_guard(${scope.groupId},${scope.workspaceId}::uuid,${write})`;
    });
  } catch(error){return failure(error);}
}
async function disclose(sql:SQL,identity:Identity,scope:Scope,id:string,write:boolean,principalId?:string) {
  await scopedTransaction(sql,identity,scope,'memory:read',async tx=>{
    await originalPrincipal(tx,principalId);
    await tx`SELECT allura.work_guard(${scope.groupId},${scope.workspaceId}::uuid,${write})`;
    await tx`SELECT allura.work_map(${scope.groupId},${scope.workspaceId}::uuid,${id})`;
  });
}
export async function createWorkItem(sql:SQL,identity:Identity,scope:Scope,value:unknown,principalId:string):Promise<Readonly<{status:201;body:string}>> {
 human(identity);
 try{
  // Own the complete bounded input before the first asynchronous boundary.
  const input=parseWorkCreate(value);
  if(input.group_id!==scope.groupId||input.workspace_id!==scope.workspaceId){throw new WorkPlaneError('invalid');}
  const result=await scopedTransaction(sql,identity,scope,'memory:read',async tx=>{
   await originalPrincipal(tx,principalId);
   const [row]=await tx`SELECT * FROM allura.create_work_item(${scope.groupId},${scope.workspaceId}::uuid,${input}::jsonb)`;
   await tx.unsafe('SET CONSTRAINTS ALL IMMEDIATE');
   await tx`SELECT allura.work_guard(${scope.groupId},${scope.workspaceId}::uuid,true)`;
   if(row.http_status!==201||typeof row.response_text!=='string'){throw new WorkPlaneError('failed');}
   return Object.freeze({status:201 as const,body:row.response_text as string});
  });
  const id=(JSON.parse(result.body) as {work_item:{id:string}}).work_item.id;
  await disclose(sql,identity,scope,id,true,principalId);
  return result;
 }catch(error){return failure(error);}
}
export async function transitionWorkItem(sql:SQL,identity:Identity,scope:Scope,id:string,value:unknown,principalId?:string):Promise<string> {
  human(identity);
  try {
    if(!workText(id,256)){throw new WorkPlaneError('invalid');}
    const input=parseWorkTransition(value);
    if(input.group_id!==scope.groupId || input.workspace_id!==scope.workspaceId){throw new WorkPlaneError('invalid');}
    const raw=await scopedTransaction(sql,identity,scope,'memory:read',async tx=>{
      await originalPrincipal(tx,principalId);
      const [row]=await tx`SELECT allura.transition_work_item(${scope.groupId},${scope.workspaceId}::uuid,${id},${input}::jsonb) AS response`;
      await tx.unsafe('SET CONSTRAINTS ALL IMMEDIATE');
      await tx`SELECT allura.work_guard(${scope.groupId},${scope.workspaceId}::uuid,true)`;
      return row.response as string;
    });
    await disclose(sql,identity,scope,id,true,principalId);
    return raw;
  } catch(error){return failure(error);}
}
export async function readWorkItem(sql:SQL,identity:Identity,scope:Scope,id:string,principalId?:string):Promise<string> {
  human(identity);
  try {
    if(!workText(id,256)){throw new WorkPlaneError('invalid');}
    const raw=await scopedTransaction(sql,identity,scope,'memory:read',async tx=>{
      await originalPrincipal(tx,principalId);
      const [row]=await tx`SELECT allura.read_work_item(${scope.groupId},${scope.workspaceId}::uuid,${id}) AS response`;
      return row.response as string;
    });
    await disclose(sql,identity,scope,id,false,principalId);
    return raw;
  } catch(error){return failure(error);}
}
