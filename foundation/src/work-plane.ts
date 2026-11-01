import { type SQL } from 'bun';
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
async function disclose(sql:SQL,identity:Identity,scope:Scope,id:string,write:boolean) {
  await scopedTransaction(sql,identity,scope,'memory:read',async tx=>{
    await tx`SELECT allura.work_guard(${scope.groupId},${scope.workspaceId}::uuid,${write})`;
    await tx`SELECT allura.work_map(${scope.groupId},${scope.workspaceId}::uuid,${id})`;
  });
}
export async function transitionWorkItem(sql:SQL,identity:Identity,scope:Scope,id:string,value:unknown):Promise<string> {
  human(identity);
  try {
    if(!workText(id,256)){throw new WorkPlaneError('invalid');}
    const input=parseWorkTransition(value);
    if(input.group_id!==scope.groupId || input.workspace_id!==scope.workspaceId){throw new WorkPlaneError('invalid');}
    const raw=await scopedTransaction(sql,identity,scope,'memory:read',async tx=>{
      const [row]=await tx`SELECT allura.transition_work_item(${scope.groupId},${scope.workspaceId}::uuid,${id},${input}::jsonb) AS response`;
      await tx.unsafe('SET CONSTRAINTS ALL IMMEDIATE');
      await tx`SELECT allura.work_guard(${scope.groupId},${scope.workspaceId}::uuid,true)`;
      return row.response as string;
    });
    await disclose(sql,identity,scope,id,true);
    return raw;
  } catch(error){return failure(error);}
}
export async function readWorkItem(sql:SQL,identity:Identity,scope:Scope,id:string):Promise<string> {
  human(identity);
  try {
    if(!workText(id,256)){throw new WorkPlaneError('invalid');}
    const raw=await scopedTransaction(sql,identity,scope,'memory:read',async tx=>{
      const [row]=await tx`SELECT allura.read_work_item(${scope.groupId},${scope.workspaceId}::uuid,${id}) AS response`;
      return row.response as string;
    });
    await disclose(sql,identity,scope,id,false);
    return raw;
  } catch(error){return failure(error);}
}
