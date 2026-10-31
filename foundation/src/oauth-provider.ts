import {type SQL} from 'bun';
import {createHash,randomBytes} from 'node:crypto';
import {type Response} from 'express';
import {type OAuthServerProvider,type AuthorizationParams} from '@modelcontextprotocol/sdk/server/auth/provider.js';
import {InvalidGrantError,InvalidRequestError,UnsupportedGrantTypeError} from '@modelcontextprotocol/sdk/server/auth/errors.js';
import {type OAuthClientInformationFull,type OAuthTokenRevocationRequest} from '@modelcontextprotocol/sdk/shared/auth.js';
import {type OAuthConfig} from './core-config.ts';
import {authenticateMachine,type MachineCredential} from './authentication.ts';
export const oauthDigest=(text:string)=>createHash('sha256').update(text).digest('hex');
export const oauthSecret=()=>randomBytes(32).toString('base64url');
export class LocalOAuthProvider implements OAuthServerProvider{
 readonly clientsStore;
 constructor(readonly sql:SQL,readonly config:OAuthConfig){
  const client:OAuthClientInformationFull={client_id:config.client.clientId,client_name:config.client.name,redirect_uris:[...config.client.redirectUris],token_endpoint_auth_method:'none',grant_types:['authorization_code'],response_types:['code'],scope:config.client.actions.join(' ')};
  this.clientsStore={getClient:async(id:string)=>id===client.client_id?structuredClone(client):undefined};
 }
 async authorize(client:OAuthClientInformationFull,params:AuthorizationParams,response:Response):Promise<void>{
  if(client.client_id!==this.config.client.clientId||!this.config.client.redirectUris.includes(params.redirectUri)||params.resource?.href!==this.config.resource||!/^[A-Za-z0-9_-]{43}$/.test(params.codeChallenge)||!params.scopes?.length||new Set(params.scopes).size!==params.scopes.length||params.scopes.some(s=>!this.config.client.actions.includes(s))||(params.state!==undefined&&!/^[\x21-\x7e]{1,512}$/.test(params.state))){throw new InvalidRequestError('invalid_request');}
  const transaction=oauthSecret(),input={clientId:client.client_id,redirectUri:params.redirectUri,resource:this.config.resource,actions:params.scopes,challenge:params.codeChallenge,state:params.state??null};
  try{await this.sql`SELECT allura.oauth_begin(${oauthDigest(transaction)},${input}::jsonb)`;}catch{throw new InvalidRequestError('invalid_request');}
  const target=new URL('/api/oauth/consent',this.config.consentOrigin);target.searchParams.set('transaction',transaction);response.redirect(302,target.href);
 }
 async challengeForAuthorizationCode(client:OAuthClientInformationFull,code:string):Promise<string>{
  if(!/^[A-Za-z0-9_-]{43}$/.test(code)){throw new InvalidGrantError('invalid_grant');}
  try{const [row]=await this.sql`SELECT allura.oauth_challenge(${client.client_id},${oauthDigest(code)}) AS challenge`;if(typeof row?.challenge!=='string'){throw new Error();}return row.challenge;}catch{throw new InvalidGrantError('invalid_grant');}
 }
 async exchangeAuthorizationCode(client:OAuthClientInformationFull,code:string,_verifier?:string,redirectUri?:string,resource?:URL){
  if(client.client_id!==this.config.client.clientId||!redirectUri||!this.config.client.redirectUris.includes(redirectUri)||resource?.href!==this.config.resource){throw new InvalidGrantError('invalid_grant');}
  const token=oauthSecret();
  try{const result=await this.sql.begin(async tx=>{await tx`SELECT set_config('statement_timeout','5000',true),set_config('lock_timeout','2000',true)`;const [row]=await tx`SELECT allura.oauth_exchange(${client.client_id},${oauthDigest(code)},${redirectUri},${this.config.resource},${oauthDigest(token)}) AS result`;return row.result as {scope:string};});return {access_token:token,token_type:'Bearer',expires_in:900,scope:result.scope};}catch{throw new InvalidGrantError('invalid_grant');}
 }
 async exchangeRefreshToken():Promise<never>{throw new UnsupportedGrantTypeError('unsupported_grant_type');}
 async isOAuthToken(token:string):Promise<boolean>{const [row]=await this.sql`SELECT allura.oauth_lookup(${oauthDigest(token)},${this.config.resource}) IS NOT NULL AS bound`;return row.bound===true;}
 async revokeToken(client:OAuthClientInformationFull,request:OAuthTokenRevocationRequest):Promise<void>{
  if(!/^[A-Za-z0-9_-]{43,128}$/.test(request.token)){return;}
  await this.sql`SELECT allura.oauth_revoke(${client.client_id},${oauthDigest(request.token)})`;
 }
 async verifyAccessToken(token:string){
  let clientId:string|undefined;
  const identity=await authenticateMachine(token,async digest=>{const [row]=await this.sql`SELECT allura.oauth_lookup(${digest},${this.config.resource}) AS credential`;const credential=row?.credential as (MachineCredential&{oauthClientId:string})|null;clientId=credential?.oauthClientId;return credential;});
  if(!clientId||identity.kind==='human'){throw new InvalidGrantError('invalid_grant');}
  return {token,clientId,scopes:[...identity.actions],expiresAt:identity.expiresAt,resource:new URL(this.config.resource),extra:{groupId:identity.groupId,workspaceId:identity.workspaceId}};
 }
}
