import {type SQL} from 'bun';
import {isAuthenticated,type Identity} from './authentication.ts';
import {AuthorityError,validScope,type Scope} from './authority.ts';
export class SelectedClientError extends Error {constructor(readonly code:'invalid'|'forbidden'|'not_found'|'unavailable'){super(code);}}
export async function selectedGet(sql:SQL,identity:Identity,scope:Scope,id:string,history=false){
 if(!isAuthenticated(identity)||identity.kind==='human'||identity.selected!==true||identity.expiresAt<=Math.floor(Date.now()/1000)){throw new AuthorityError('forbidden');}
 if(!validScope(scope)||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)||typeof history!=='boolean'){throw new SelectedClientError('invalid');}
 if(identity.groupId!==scope.groupId||identity.workspaceId!==scope.workspaceId){throw new AuthorityError('forbidden');}
 try{return await sql.begin(async tx=>{
  await tx`SELECT set_config('statement_timeout','5000',true),set_config('lock_timeout','2000',true)`;
  const [row]=await tx`SELECT allura.selected_get(${identity.credentialDigest},${identity.principalId}::uuid,${identity.oauthClientId??''},${identity.oauthResource??''},${scope.groupId},${scope.workspaceId}::uuid,${id}::uuid,${history}) AS result`;
  if(identity.expiresAt<=Math.floor(Date.now()/1000)){throw new Error('forbidden');}return row.result;
 });}catch(error){const message=error instanceof Error?error.message:'';throw new SelectedClientError(message==='not_found'?'not_found':message==='forbidden'?'forbidden':'unavailable');}
}
export async function selectedRevoke(sql:SQL,identity:Identity,scope:Scope,id:string){
 if(!isAuthenticated(identity)||identity.kind!=='human'||identity.expiresAt<=Math.floor(Date.now()/1000)){throw new AuthorityError('unauthenticated');}
 if(!validScope(scope)){throw new AuthorityError('invalid');}
 try{await sql.begin(async tx=>{
  await tx`SELECT set_config('statement_timeout','5000',true),set_config('lock_timeout','2000',true)`;
  await tx`SELECT allura.selected_revoke(${identity.issuer},${identity.subject},${scope.groupId},${scope.workspaceId}::uuid,${id}::uuid)`;
  if(identity.expiresAt<=Math.floor(Date.now()/1000)){throw new Error('forbidden');}
 });}catch(error){const message=error instanceof Error?error.message:'';throw new SelectedClientError(message==='not_found'?'not_found':message==='forbidden'?'forbidden':'unavailable');}
}
export async function selectedConsent(sql:SQL,identity:Identity,scope:Scope,transaction:string,input:Record<string,unknown>){
 if(!isAuthenticated(identity)||identity.kind!=='human'||identity.expiresAt<=Math.floor(Date.now()/1000)){throw new AuthorityError('unauthenticated');}
 if(!validScope(scope)){throw new AuthorityError('invalid');}
 try{return await sql.begin(async tx=>{
  await tx`SELECT set_config('statement_timeout','5000',true),set_config('lock_timeout','2000',true)`;
  const [row]=await tx`SELECT allura.selected_consent(${identity.issuer},${identity.subject},${scope.groupId},${scope.workspaceId}::uuid,${transaction},${input}::jsonb) AS result`;
  if(identity.expiresAt<=Math.floor(Date.now()/1000)){throw new AuthorityError('unauthenticated');}
  return row.result as {clientId:string;redirectUri:string;actions:string[];state:string|null;mode:'selected';connectionId:string};
 });}catch{throw new AuthorityError('forbidden');}
}
