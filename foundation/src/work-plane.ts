import { type SQL, type TransactionSQL } from 'bun';
import { isAuthenticated, type Identity } from './authentication.ts';
import { AuthorityError, type Scope } from './authority.ts';
import { scopedTransaction } from './persistence.ts';
import { parseWorkTransition, workText, WorkPlaneError } from './work-plane-contract.ts';
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
