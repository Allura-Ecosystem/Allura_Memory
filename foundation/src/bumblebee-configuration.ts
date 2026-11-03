import {type SQL} from 'bun';
import {createHash,createHmac} from 'node:crypto';
import {posix} from 'node:path';
import {type Identity} from './authentication.ts';
import {AuthorityError,type Scope} from './authority.ts';
import {scopedTransaction} from './persistence.ts';
import {parseBumblebeeSource,type BumblebeeSource,BUMBLEBEE} from './bumblebee-contract.ts';
export class BumblebeeConfigurationError extends Error {constructor(readonly code:'invalid'|'forbidden'|'not_found'|'conflict'|'unknown'){super(`bumblebee_${code}`);}}
function check(v:unknown):asserts v{if(!v){throw new BumblebeeConfigurationError('invalid');}}
function object(v:unknown,keys:readonly string[]):Record<string,unknown>{check(v!==null&&typeof v==='object'&&!Array.isArray(v));const r=v as Record<string,unknown>;check(Object.keys(r).length===keys.length&&Object.keys(r).every(k=>keys.includes(k)));return r;}
function uuid(v:unknown):string{check(typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v));return v;}
function text(v:unknown,max:number):string{check(typeof v==='string'&&v.trim().length>0&&Buffer.byteLength(v)<=max&&!v.includes('\0')&&Buffer.from(v).toString()===v);return v;}
function integer(v:unknown):number{check(typeof v==='number'&&Number.isSafeInteger(v)&&v>=0);return v;}
function array(v:unknown,max:number):unknown[]{check(Array.isArray(v)&&v.length>0&&v.length<=max);for(let i=0;i<v.length;i++){check(Object.hasOwn(v,i));}return v;}
function audit(v:Record<string,unknown>){const rationale=text(v.rationale,4000),operationKey=text(v.operationKey,128),evidenceIds=array(v.evidenceIds,32).map(uuid).sort();check(/^[A-Za-z0-9._:-]{1,128}$/.test(operationKey)&&new Set(evidenceIds).size===evidenceIds.length);return {rationale,operationKey,evidenceIds};}
function source(v:unknown):BumblebeeSource{try{return parseBumblebeeSource(v);}catch{throw new BumblebeeConfigurationError('invalid');}}
const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
async function safe<T>(work:()=>Promise<T>):Promise<T>{try{return await work();}catch(e){if(e instanceof AuthorityError||e instanceof BumblebeeConfigurationError){throw e;}const message=e instanceof Error?e.message:'';if(message==='invalid'||message==='forbidden'||message==='not_found'||message==='conflict'){throw new BumblebeeConfigurationError(message);}throw new BumblebeeConfigurationError('unknown');}}
export function parseBumblebeeCatalog(value:unknown,now:number){
 integer(now);const v=object(value,['sourceId','revisionId','publisher','sourceUrl','publishedAt','fetchedAt','expiresAt','entries','rationale','evidenceIds','operationKey']);
 const publisher=text(v.publisher,128);check(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(publisher));
 const sourceUrl=text(v.sourceUrl,2048);let u:URL;try{u=new URL(sourceUrl);}catch{throw new BumblebeeConfigurationError('invalid');}check(u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash&&u.href===sourceUrl);
 const publishedAt=integer(v.publishedAt),fetchedAt=integer(v.fetchedAt),expiresAt=integer(v.expiresAt);check(publishedAt<=fetchedAt&&fetchedAt<=now&&expiresAt>now&&expiresAt-now<=7*86400000);
 const entries=array(v.entries,BUMBLEBEE.maxCatalogEntries).map(item=>{const e=object(item,['id','ecosystem','name','version','severity']);check(e.ecosystem==='npm'||e.ecosystem==='pypi');const name=text(e.name,214),version=text(e.version,128);check((e.ecosystem==='npm'?/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/:/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/).test(name)&&/^[A-Za-z0-9][A-Za-z0-9.+!_-]{0,127}$/.test(version));check(['low','medium','high','critical'].includes(e.severity as string));return {id:uuid(e.id),ecosystem:e.ecosystem,name,version,severity:e.severity as 'low'|'medium'|'high'|'critical'};}).sort((a,b)=>a.id.localeCompare(b.id));check(new Set(entries.map(e=>e.id)).size===entries.length);
 return {catalog:{sourceId:uuid(v.sourceId),revisionId:uuid(v.revisionId),publisher,sourceUrl,publishedAt,fetchedAt,expiresAt,verificationRule:'human-reviewed-sha256',classification:'internal',redaction:'allowlist-v1',retention:'append-only',entries},...audit(v)};
}
export async function configureBumblebeeSource(sql:SQL,identity:Identity,scope:Scope,value:unknown):Promise<string>{
 const v=object(value,['source','expectedRevision','enabled','rationale','evidenceIds','operationKey']);const input={source:source(v.source),expectedRevision:integer(v.expectedRevision),enabled:v.enabled,...audit(v)};check(typeof input.enabled==='boolean'&&input.expectedRevision<2147483647);
 return safe(()=>scopedTransaction(sql,identity,scope,'workspace:grants:manage',async tx=>{const [r]=await tx`SELECT allura.configure_bumblebee_source(${scope.groupId},${scope.workspaceId}::uuid,${input}::jsonb,${digest(['source-v1',scope,input])}) AS receipt`;return r.receipt as string;}));
}
export async function approveBumblebeeCatalog(sql:SQL,identity:Identity,scope:Scope,value:unknown):Promise<string>{
 const input=parseBumblebeeCatalog(value,Date.now());
 return safe(()=>scopedTransaction(sql,identity,scope,'workspace:grants:manage',async tx=>{const [r]=await tx`SELECT allura.approve_bumblebee_catalog(${scope.groupId},${scope.workspaceId}::uuid,${input}::jsonb,${digest(input.catalog)},${digest(['catalog-v1',scope,input])}) AS receipt`;return r.receipt as string;}));
}
export async function invalidateBumblebeeCatalog(sql:SQL,identity:Identity,scope:Scope,value:unknown):Promise<string>{
 const v=object(value,['sourceId','revisionId','rationale','evidenceIds','operationKey']),input={sourceId:uuid(v.sourceId),revisionId:uuid(v.revisionId),...audit(v)};
 return safe(()=>scopedTransaction(sql,identity,scope,'workspace:grants:manage',async tx=>{const [r]=await tx`SELECT allura.invalidate_bumblebee_catalog(${scope.groupId},${scope.workspaceId}::uuid,${input}::jsonb,${digest(['invalidate-v1',scope,input])}) AS receipt`;return r.receipt as string;}));
}
// Preview only: endpoint paths are transient HTTPS inputs, never database rows,
// events or receipts. Separate audited configuration still requires human approval.
export async function fingerprintBumblebeeRoots(sql:SQL,identity:Identity,scope:Scope,value:unknown,redaction:{key:Uint8Array;revision:string}){
 check(identity.kind==='human'&&redaction.key.byteLength>=32&&/^[A-Za-z0-9._:-]{1,128}$/.test(redaction.revision));
 return safe(()=>scopedTransaction(sql,identity,scope,'workspace:grants:manage',async()=>{
  const v=object(value,['profile','roots']);check(v.profile==='project'||v.profile==='baseline');
  const paths=new Set<string>(),roots=array(v.roots,BUMBLEBEE.maxRoots).map(item=>{const r=object(item,['path','kind']),path=text(r.path,4096);check(posix.isAbsolute(path)&&posix.normalize(path)===path&&!/[\x00-\x1f\x7f,\\]/.test(path)&&!/^\/(?:home|Users)(?:\/[^/]+)?$/.test(path)&&path!=='/'&&!paths.has(path));check(v.profile==='project'?r.kind==='project_root':r.kind==='user_package_root');paths.add(path);return {digest:createHmac('sha256',redaction.key).update(JSON.stringify(['bumblebee-redaction-v1',scope.groupId,scope.workspaceId,'root',path])).digest('hex'),kind:r.kind};});
  return {keyRevision:redaction.revision,roots};
 }));
}
export type BumblebeeSourceView={source:BumblebeeSource;revision:number;enabled:boolean;ownerId:string;catalogState:'none'|'approved'|'rejected'|'expired'};
export async function readBumblebeeSource(sql:SQL,identity:Identity,scope:Scope,sourceId:string):Promise<BumblebeeSourceView>{
 uuid(sourceId);return safe(()=>scopedTransaction(sql,identity,scope,'evidence:read',async tx=>{const [r]=await tx`SELECT allura.read_bumblebee_source(${scope.groupId},${scope.workspaceId}::uuid,${sourceId}::uuid) AS source`;return r.source as BumblebeeSourceView;}));
}
