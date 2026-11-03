import {type SQL} from 'bun';
import {createHash} from 'node:crypto';
import {isAuthenticated,type Identity} from './authentication.ts';
import {AuthorityError,type Scope} from './authority.ts';
import {deviceChallenge,parseDeviceCommand} from './device-contract.ts';
import {scopedTransaction} from './persistence.ts';
export class DeviceError extends Error{constructor(public readonly code:'invalid'|'forbidden'|'not_found'|'conflict'|'unknown'){super(code);this.name='DeviceError';}}
const hash=(text:string)=>createHash('sha256').update(text,'utf8').digest('hex');
export async function deviceCommand(sql:SQL,identity:Identity,scope:Scope,input:unknown,signal?:AbortSignal):Promise<Record<string,unknown>>{
 if(!isAuthenticated(identity)){throw new AuthorityError('unauthenticated');}if(identity.kind!=='human'){throw new AuthorityError('forbidden');}
 let command;try{command=parseDeviceCommand(input);}catch{throw new DeviceError('invalid');}
 // Secrets never enter SQL, receipts, log records or error messages.
 let safe:Record<string,unknown>;
 if(command.kind==='complete'){safe={kind:command.kind,enrollmentId:command.enrollmentId,proofChallenge:deviceChallenge(command.verifier),tokenDigest:hash(command.token)};}
 else if(command.kind==='rotate'){safe={kind:command.kind,deviceId:command.deviceId,expectedGeneration:command.expectedGeneration,tokenDigest:hash(command.token),operationKey:command.operationKey};}
 else {safe={...command,...('actions' in command?{actions:[...command.actions].sort()}: {})};}
 const digest=hash(JSON.stringify(['device-command-v1',scope.groupId,scope.workspaceId,safe]));
 try{
  if(signal?.aborted){throw new DeviceError('unknown');}
  return await scopedTransaction(sql,identity,scope,command.kind==='approve'?'workspace:grants:manage':'memory:read',async tx=>{
   if(signal?.aborted){throw new DeviceError('unknown');}
   const query=tx`SELECT allura.device_command(${scope.groupId},${scope.workspaceId}::uuid,${safe}::jsonb,${digest}) AS result`;
   const abort=()=>{query.cancel();};signal?.addEventListener('abort',abort,{once:true});
   try{const [row]=await query;if(signal?.aborted){throw new DeviceError('unknown');}return row.result as Record<string,unknown>;}
   finally{signal?.removeEventListener('abort',abort);}
  });
 }catch(error){
  if(error instanceof AuthorityError||error instanceof DeviceError){throw error;}
  const message=error instanceof Error?error.message:'';
  if(message==='invalid'||message==='forbidden'||message==='not_found'||message==='conflict'){throw new DeviceError(message);}
  const code=error&&typeof error==='object'?String('errno' in error?error.errno:'code' in error?error.code:''):'';
  if(code==='23505'){throw new DeviceError('conflict');}if(code.startsWith('22')||code.startsWith('23')){throw new DeviceError('invalid');}
  throw new DeviceError('unknown');
 }
}
