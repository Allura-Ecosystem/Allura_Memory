import {type SQL} from 'bun';
import {createHash,createHmac,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {type Identity} from './authentication.ts';
import {AuthorityError,type Scope} from './authority.ts';
import {scopedTransaction} from './persistence.ts';
import {BumblebeeConfigurationError} from './bumblebee-configuration.ts';
import {parseLeaseRequest,populationDigest,type BumblebeeSource} from './bumblebee-contract.ts';
const hash=(v:string)=>createHash('sha256').update(v).digest('hex');
function requireValue(v:unknown):asserts v{if(!v){throw new BumblebeeConfigurationError('invalid');}}
function object(v:unknown,keys:readonly string[]):Record<string,unknown>{requireValue(v!==null&&typeof v==='object'&&!Array.isArray(v));const r=v as Record<string,unknown>;requireValue(Object.keys(r).length===keys.length&&Object.keys(r).every(k=>keys.includes(k)));return r;}
function uuid(v:unknown):string{requireValue(typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v));return v;}
function command(value:unknown,kind:'issue'|'revoke'){
 const v=object(value,['sourceId',kind==='issue'?'sourceRevision':'credentialId','operationKey','rationale','evidenceIds']);
 requireValue(typeof v.operationKey==='string'&&/^[A-Za-z0-9._:-]{1,128}$/.test(v.operationKey));requireValue(typeof v.rationale==='string'&&v.rationale.trim().length>0&&Buffer.byteLength(v.rationale)<=4000&&!v.rationale.includes('\0')&&Buffer.from(v.rationale).toString()===v.rationale);
 requireValue(Array.isArray(v.evidenceIds)&&v.evidenceIds.length>0&&v.evidenceIds.length<=32);const evidenceIds:string[]=[];for(let i=0;i<v.evidenceIds.length;i++){requireValue(Object.hasOwn(v.evidenceIds,i));evidenceIds.push(uuid(v.evidenceIds[i]));}requireValue(new Set(evidenceIds).size===evidenceIds.length);evidenceIds.sort();
 const binding=kind==='issue'?{sourceRevision:v.sourceRevision}:{credentialId:uuid(v.credentialId)};
 if(kind==='issue'){requireValue(typeof v.sourceRevision==='number'&&Number.isSafeInteger(v.sourceRevision)&&v.sourceRevision>0&&v.sourceRevision<=2147483647);}
 return {sourceId:uuid(v.sourceId),...binding,operationKey:v.operationKey,rationale:v.rationale,evidenceIds};
}
async function safe<T>(work:()=>Promise<T>):Promise<T>{try{return await work();}catch(e){if(e instanceof AuthorityError||e instanceof BumblebeeConfigurationError){throw e;}const message=e instanceof Error?e.message:'';if(message==='invalid'||message==='forbidden'||message==='not_found'||message==='conflict'){throw new BumblebeeConfigurationError(message);}throw new BumblebeeConfigurationError('unknown');}}
export type RunnerReceipt=Readonly<{version:'bumblebee-runner-v1';sourceId:string;credentialId:string;sourceRevision?:number;expiresAt?:number;eventId:string;state:'issued'|'revoked'}>;
export async function issueBumblebeeRunner(sql:SQL,identity:Identity,scope:Scope,value:unknown):Promise<{receipt:RunnerReceipt;token:string|null}>{
 const input=command(value,'issue'),id=randomUUID(),token=`bbr1.${randomBytes(32).toString('base64url')}`;
 return safe(()=>scopedTransaction(sql,identity,scope,'workspace:grants:manage',async tx=>{
  const [r]=await tx`SELECT allura.bumblebee_runner_command(${scope.groupId},${scope.workspaceId}::uuid,${input}::jsonb,${hash(JSON.stringify(['runner-issue-v1',scope,input]))},'issue',${id}::uuid,${hash(token)}) AS receipt`;
  const receipt=r.receipt as RunnerReceipt;return {receipt,token:receipt.credentialId===id?token:null};
 }));
}
export async function revokeBumblebeeRunner(sql:SQL,identity:Identity,scope:Scope,value:unknown):Promise<RunnerReceipt>{
 const input=command(value,'revoke');return safe(()=>scopedTransaction(sql,identity,scope,'workspace:grants:manage',async tx=>{
  const [r]=await tx`SELECT allura.bumblebee_runner_command(${scope.groupId},${scope.workspaceId}::uuid,${input}::jsonb,${hash(JSON.stringify(['runner-revoke-v1',scope,input]))},'revoke',NULL,NULL) AS receipt`;return r.receipt as RunnerReceipt;
 }));
}
export type BumblebeeLease=Readonly<{groupId:string;workspaceId:string;sourceId:string;source:BumblebeeSource;sourceRevision:number;leaseId:string;generation:number;populationDigest:string;catalogDigest:string|null;issuedAt:number;expiresAt:number;ingestToken:string;keyRevision:string;artifactSha256:string}>;
type LeaseRow=Omit<BumblebeeLease,'ingestToken'>&{ingestDigest:string;ownerId:string;credentialId:string;credentialExpiresAt:number};
function credentialDigest(token:string):string{if(typeof token!=='string'||!/^bbr1\.[A-Za-z0-9_-]{43}$/.test(token)||Buffer.from(token.slice(5),'base64url').toString('base64url')!==token.slice(5)){throw new BumblebeeConfigurationError('forbidden');}return hash(token);}
/** Server-only authority boundary. Callers cannot supply source, population or an identity DTO. */
export function createBumblebeeLeases(sql:SQL,options:{leaseKey:Uint8Array;keyRevision:string}){
 requireValue(options.leaseKey instanceof Uint8Array&&options.leaseKey.byteLength===32&&/^[A-Za-z0-9._:-]{1,128}$/.test(options.keyRevision));const key=Buffer.from(options.leaseKey),keyRevision=options.keyRevision;
 const secret=(groupId:string,workspaceId:string,sourceId:string,leaseId:string)=>`bbi1.${createHmac('sha256',key).update(JSON.stringify(['bumblebee-ingest-v1',groupId,workspaceId,sourceId,leaseId])).digest('base64url')}`;
 const acquireFrom=async(token:string,read:()=>Promise<unknown>,signal?:AbortSignal):Promise<BumblebeeLease>=>{
   signal?.throwIfAborted();
   const digest=credentialDigest(token);return safe(()=>sql.begin(async tx=>{
    await tx`SELECT set_config('statement_timeout','5000',true),set_config('lock_timeout','2000',true),set_config('idle_in_transaction_session_timeout','5000',true)`;
    const [context]=await tx`SELECT allura.bumblebee_runner_context(${digest}) AS live`;const live=context.live as {groupId:string;workspaceId:string;sourceId:string;source:BumblebeeSource};
    signal?.throwIfAborted();const value=await read();signal?.throwIfAborted();
    let input:ReturnType<typeof parseLeaseRequest>;try{input=parseLeaseRequest(value);}catch{throw new BumblebeeConfigurationError('invalid');}
    const id=randomUUID(),ingest=secret(live.groupId,live.workspaceId,live.sourceId,id);
    const [row]=await tx`SELECT allura.bumblebee_acquire_lease(${digest},${input}::jsonb,${id}::uuid,${populationDigest(live.source)},${hash(ingest)},${keyRevision}) AS lease`;
    const l=row.lease as LeaseRow,ingestToken=secret(l.groupId,l.workspaceId,l.sourceId,l.leaseId);
    if(l.keyRevision!==keyRevision||!timingSafeEqual(Buffer.from(l.ingestDigest,'hex'),Buffer.from(hash(ingestToken),'hex'))){throw new BumblebeeConfigurationError('unknown');}
    // Current authority and expiry are checked again before any credential disclosure.
    await tx`SELECT allura.bumblebee_runner_context(${digest})`;
    signal?.throwIfAborted();if(l.expiresAt<=Date.now()){throw new BumblebeeConfigurationError('forbidden');}
    return {groupId:l.groupId,workspaceId:l.workspaceId,sourceId:l.sourceId,source:l.source,sourceRevision:l.sourceRevision,leaseId:l.leaseId,generation:l.generation,populationDigest:l.populationDigest,catalogDigest:l.catalogDigest,issuedAt:l.issuedAt,expiresAt:l.expiresAt,ingestToken,keyRevision,artifactSha256:l.artifactSha256};
   }));
 };
 return Object.freeze({acquire:(token:string,value:unknown,signal?:AbortSignal)=>acquireFrom(token,async()=>value,signal),acquireFrom});
}
