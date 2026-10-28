import {createHmac} from 'node:crypto';
import {type BumblebeeSource,populationDigest,parseBumblebeeSource,routineEligible,BUMBLEBEE} from './bumblebee-contract.ts';
import {parseBumblebeeWire,type WireRecord} from './bumblebee-wire.ts';

export type BumblebeeScope=Readonly<{groupId:string;workspaceId:string}>;
export type GatewayCatalog=Readonly<{
 scope:BumblebeeScope;sourceId:string;revisionId:string;digest:string;
 trust:'approved'|'rejected'|'degraded';approvedAt:number;expiresAt:number;
 entries:readonly Readonly<{id:string;ecosystem:'npm'|'pypi';name:string;version:string;severity:'low'|'medium'|'high'|'critical'}>[];
}>;
/** SERVER-ONLY snapshot obtained under current authority/source/lease/catalog/head locks.
 * This DTO is not proof. NEVER deserialize it from an upload, header or module.
 * The gateway must verify authentication and approval independently of this core.
 * Catalog approval includes full normalized metadata digest, human approval receipt,
 * provenance/allowlist, retention and current invalidation check (10.1 contract).
 * currentGeneration/lastCompleteReceivedAt must belong to THIS source/population;
 * priorWireDigest must come from THIS scoped lease's committed accepted batch. */
export type GatewaySession=Readonly<{
 scope:BumblebeeScope;sourceScope:BumblebeeScope;source:BumblebeeSource;
 sourceRevision:number;currentSourceRevision:number;sourceEnabled:boolean;ownerAuthorized:boolean;
 credentialAudience:string;credentialExpiresAt:number;credentialRevoked:boolean;
 lease:Readonly<{scope:BumblebeeScope;id:string;sourceId:string;sourceRevision:number;endpointId:string;
 populationDigest:string;catalogRevisionId:string|null;catalogDigest:string|null;generation:number;
 issuedAt:number;expiresAt:number;revoked:boolean;artifactSha256:string}>;
 catalog:GatewayCatalog|null;currentGeneration:number;lastCompleteReceivedAt:number|null;
 priorWireDigest:string|null;keyRevision:string;
}>;
export interface BumblebeeGateway {
 /** Authenticate exclusive ingest credential BEFORE calling use; null means denied.
  * Hold the scoped locks through use. recheck must revalidate current credential,
  * owner/source/catalog authority, not echo a client-supplied boolean. No adapter is
  * supplied here: fixture adapters are not production authentication. Gateway owns
  * bounded admission/cancellation, rejects content-encoding, and never logs bodies. */
 withVerifiedLease<T>(use:(session:GatewaySession,recheck:()=>Promise<boolean>)=>Promise<T>):Promise<T|null>;
}
export type SanitizedPackage=Readonly<{
 id:string;ecosystem:'npm'|'pypi';name:string;version:string;confidence:'high'|'medium'|'low';
 sourceFileDigest:string;projectPathDigest:string|null;rootDigest:string;endpointDigest:string;
 hasLifecycleScripts:boolean;
}>;
export type VerifiedExposure=Readonly<{
 alertKey:string;catalogEntryId:string;ecosystem:'npm'|'pypi';name:string;version:string;
 severity:'low'|'medium'|'high'|'critical';packageIds:readonly string[];
}>;
export type SafeScanSummary=Readonly<{
 status:'complete'|'partial'|'error';packageCount:number;findingCount:number;
 suppressed:number;diagnostics:number;duplicates:number;timedOut:boolean;durationMs:number;
}>;
export type IngestionPlan=Readonly<{
 scope:BumblebeeScope;sourceId:string;leaseId:string;generation:number;populationDigest:string;
 sourceRevision:number;catalogRevisionId:string|null;catalogDigest:string|null;
 wireDigest:string;runDigest:string;summaryDigest:string;keyRevision:string;redaction:'allowlist-v1';
 trust:'gateway-verified';catalogTrust:'approved'|'none';catalogFreshness:'current'|'none';
 freshness:'fresh'|'stale'|'unknown';evidenceState:'complete'|'partial'|'late';clockSkew:boolean;
 receivedAt:number;summary:SafeScanSummary;replaceCurrent:boolean;packages:readonly SanitizedPackage[];exposures:readonly VerifiedExposure[];
 findingIds:readonly string[];simulations:readonly Readonly<{alertKey:string;mode:'simulation';text:string}>[];
}>;
type RejectCode='authority'|'wire'|'population'|'replay_conflict'|'catalog';
export type IngestionResult=Readonly<{status:'candidate';plan:IngestionPlan}>|Readonly<{status:'rejected';code:RejectCode}>|Readonly<{status:'unknown';code:'unavailable'}>|Readonly<{status:'exact-replay';wireDigest:string}>;
class Rejected extends Error {constructor(readonly code:RejectCode){super('bumblebee_rejected');}}
function must(v:unknown,code:RejectCode='authority'):asserts v {if(!v){throw new Rejected(code);}}
function frozen<T>(v:T):T{if(v!==null&&typeof v==='object'){for(const x of Object.values(v)){frozen(x);}Object.freeze(v);}return v;}
const safeInt=(n:number,min=0)=>Number.isSafeInteger(n)&&n>=min;
const hex=(s:unknown)=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const uuid=(s:unknown)=>typeof s==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(s);
const sameScope=(a:BumblebeeScope,b:BumblebeeScope)=>a.groupId===b.groupId&&a.workspaceId===b.workspaceId;
const ARTIFACT='3b46f98ab8fa6345a5d39c7483ff37c51b2ee7699aabe51f2a54133f357f6c7a';
type Fingerprint=(domain:string,value:unknown)=>string;

function checkSession(s:GatewaySession,now:number,keyRevision:string):BumblebeeSource {
 must(safeInt(now));
 for(const id of [s.scope.groupId,s.scope.workspaceId]){must(typeof id==='string'&&/^[A-Za-z0-9._:-]{1,128}$/.test(id));}
 must(sameScope(s.scope,s.sourceScope)&&sameScope(s.scope,s.lease.scope));
 let source:BumblebeeSource;try{source=parseBumblebeeSource(s.source);}catch{throw new Rejected('authority');}
 const l=s.lease;
 must(s.sourceEnabled===true&&s.ownerAuthorized===true&&s.credentialRevoked===false&&s.credentialAudience==='bumblebee_ingest');
 must(safeInt(s.credentialExpiresAt)&&s.credentialExpiresAt>now&&s.keyRevision===keyRevision);
 must(safeInt(s.sourceRevision,1)&&s.sourceRevision===s.currentSourceRevision&&l.sourceRevision===s.sourceRevision);
 must(uuid(l.id)&&l.sourceId===source.sourceId&&l.endpointId===source.endpointId&&l.populationDigest===populationDigest(source));
 must(l.revoked===false&&safeInt(l.generation,1)&&safeInt(l.issuedAt)&&safeInt(l.expiresAt)&&l.issuedAt<=now&&l.expiresAt>now&&l.expiresAt-l.issuedAt<=BUMBLEBEE.leaseSeconds*1000);
 must(l.artifactSha256===ARTIFACT&&l.catalogRevisionId===source.catalogRevisionId);
 must(safeInt(s.currentGeneration)&&(s.lastCompleteReceivedAt===null||(safeInt(s.lastCompleteReceivedAt)&&s.lastCompleteReceivedAt<=now)));
 must(s.priorWireDigest===null||hex(s.priorWireDigest));
 const c=s.catalog;
 if(source.catalogRevisionId===null){must(c===null&&l.catalogDigest===null,'catalog');}
 else{
  must(c!==null&&sameScope(c.scope,s.scope)&&c.sourceId===source.sourceId&&c.revisionId===source.catalogRevisionId&&hex(c.digest)&&c.digest===l.catalogDigest,'catalog');
  must(c.trust==='approved'&&safeInt(c.approvedAt)&&safeInt(c.expiresAt)&&c.approvedAt<=now&&c.expiresAt>now&&c.expiresAt-c.approvedAt<=7*86400000,'catalog');
  must(Array.isArray(c.entries)&&c.entries.length<=BUMBLEBEE.maxCatalogEntries,'catalog');
  const seen=new Set<string>();
  for(const e of c.entries){
   must(e&&uuid(e.id)&&!seen.has(e.id)&&['npm','pypi'].includes(e.ecosystem)&&source.ecosystems.includes(e.ecosystem),'catalog');seen.add(e.id);
   const grammar=e.ecosystem==='npm'?/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/:/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
   must(typeof e.name==='string'&&e.name.length<=214&&grammar.test(e.name)&&typeof e.version==='string'&&/^[A-Za-z0-9][A-Za-z0-9.+!_-]{0,127}$/.test(e.version)&&['low','medium','high','critical'].includes(e.severity),'catalog');
  }
 }
 return source;
}

// Lexical containment is only a receiver check. Runner MUST independently verify
// realpaths/no symlinks against authorized roots before scan; this proves no host facts.
function canonicalPath(v:unknown):v is string {
 return typeof v==='string'&&v.startsWith('/')&&v.length>1&&v.length<=4096&&!v.includes('\\')&&v.split('/').slice(1).every(p=>p!==''&&p!=='.'&&p!=='..');
}
const within=(p:string,root:string)=>p===root||p.startsWith(root+'/');
function endpointTuple(r:WireRecord):unknown[]{const e=r.endpoint as Record<string,unknown>;return ['hostname','os','arch','username','uid','device_id'].map(k=>e[k]??'');}
function matchTuple(r:WireRecord):string{return JSON.stringify(['ecosystem','normalized_name','version','root_kind','project_path','source_type','source_file','confidence'].map(k=>r[k]??''));}
function packageTuple(r:WireRecord):string{return JSON.stringify([r.ecosystem,r.normalized_name,r.version]);}

function planBatch(records:readonly WireRecord[],s:GatewaySession,source:BumblebeeSource,hash:Fingerprint,wireDigest:string,now:number):IngestionPlan {
 const summary=records.at(-1)!;must(summary.record_type==='scan_summary','wire');
 const rootValues=(summary.roots??[]) as {path:string;kind:string}[];
 must(rootValues.length===source.roots.length&&rootValues.every(r=>canonicalPath(r.path)),'population');
 const roots=rootValues.map(r=>({...r,digest:hash('root',r.path)}));
 must(new Set(roots.map(r=>r.digest)).size===roots.length&&roots.every(r=>source.roots.some(x=>x.digest===r.digest&&x.kind===r.kind)),'population');
 const ids=new Set<string>(),packages:WireRecord[]=[],findings:WireRecord[]=[];
 const expectedEndpoint=JSON.stringify(endpointTuple(summary));
 for(const [i,r] of records.entries()){
  must(!ids.has(r.record_id as string),'wire');ids.add(r.record_id as string);
  must(r.run_id===summary.run_id&&r.scan_time===summary.scan_time&&r.profile===source.profile&&JSON.stringify(endpointTuple(r))===expectedEndpoint&&(r.endpoint as Record<string,unknown>).device_id===source.endpointId,'population');
  if(r.record_type==='scan_summary'){must(i===records.length-1,'wire');continue;}
  must(source.ecosystems.includes(r.ecosystem as 'npm'|'pypi'),'population');
  must(canonicalPath(r.source_file)&&roots.some(root=>root.kind===r.root_kind&&within(r.source_file as string,root.path)),'population');
  if(r.project_path!==undefined&&r.project_path!==''){must(canonicalPath(r.project_path)&&roots.some(root=>root.kind===r.root_kind&&within(r.project_path as string,root.path)&&within(r.source_file as string,r.project_path as string)),'population');}
  if(r.record_type==='package'){packages.push(r);}else{findings.push(r);}
 }
 must(summary.package_records_emitted===packages.length&&summary.findings_emitted===findings.length,'wire');
 if(summary.counts!==undefined){const c=summary.counts as Record<string,number>;must((c.package??0)===packages.length&&(c.finding??0)===findings.length,'wire');}
 const entries=s.catalog?.entries??[],byEntry=new Map(entries.map(e=>[e.id,e]));
 const packageMatches=new Set(packages.map(matchTuple));
 for(const f of findings){
  const e=byEntry.get(f.catalog_id as string);
  must(e&&e.ecosystem===f.ecosystem&&e.name===f.normalized_name&&e.version===f.version&&packageMatches.has(matchTuple(f)),'catalog');
 }
 const sanitized:SanitizedPackage[]=packages.map(r=>({id:hash('record',r.record_id),ecosystem:r.ecosystem as 'npm'|'pypi',name:r.normalized_name as string,version:r.version as string,confidence:r.confidence as 'high'|'medium'|'low',sourceFileDigest:hash('path',r.source_file),projectPathDigest:r.project_path?hash('path',r.project_path):null,rootDigest:roots.filter(root=>root.kind===r.root_kind&&within(r.source_file as string,root.path)).sort((a,b)=>b.path.length-a.path.length)[0]!.digest,endpointDigest:hash('endpoint',endpointTuple(r)),hasLifecycleScripts:r.has_lifecycle_scripts as boolean}));
 const exposures=new Map<string,{alertKey:string;catalogEntryId:string;ecosystem:'npm'|'pypi';name:string;version:string;severity:'low'|'medium'|'high'|'critical';packageIds:string[]}>();
 let correlations=0;
 for(const [i,r] of packages.entries()){
  if(r.confidence!=='high'||r.version===''){continue;}
  for(const e of entries){
   if(e.ecosystem!==r.ecosystem||e.name!==r.normalized_name||e.version!==r.version){continue;}
   must(++correlations<=BUMBLEBEE.maxRecords,'wire');
   const alertKey=hash('alert',[source.sourceId,s.lease.populationDigest,e.id,packageTuple(r)]);
   const existing=exposures.get(alertKey);
   if(existing){existing.packageIds.push(sanitized[i]!.id);}else{exposures.set(alertKey,{alertKey,catalogEntryId:e.id,ecosystem:e.ecosystem,name:e.name,version:e.version,severity:e.severity,packageIds:[sanitized[i]!.id]});}
  }
 }
 const degraded=Boolean(summary.error)||(summary.http_batches_failed as number??0)>0;
 const eligible=routineEligible(source,{profile:summary.profile,status:summary.status,rootDigests:roots.map(r=>r.digest),packageCount:summary.package_records_emitted,receivedPackages:packages.length,findingCount:summary.findings_emitted,receivedFindings:findings.length,suppressed:summary.package_records_suppressed??0,diagnostics:summary.diagnostics_count,timedOut:summary.timed_out},s.lease.generation,s.currentGeneration)&&!degraded;
 const complete=summary.status==='complete'&&!summary.timed_out&&summary.diagnostics_count===0&&(summary.package_records_suppressed??0)===0&&!degraded;
 const freshness=eligible?'fresh':s.lastCompleteReceivedAt===null?'unknown':now-s.lastCompleteReceivedAt>=86400000?'stale':'fresh';
 const verified=[...exposures.values()].sort((a,b)=>a.alertKey.localeCompare(b.alertKey));for(const e of verified){e.packageIds.sort();}
 return frozen({scope:{groupId:s.scope.groupId,workspaceId:s.scope.workspaceId},sourceId:source.sourceId,sourceRevision:s.sourceRevision,leaseId:s.lease.id,generation:s.lease.generation,populationDigest:s.lease.populationDigest,catalogRevisionId:source.catalogRevisionId,catalogDigest:s.lease.catalogDigest,wireDigest,runDigest:hash('run',summary.run_id),summaryDigest:hash('record',summary.record_id),keyRevision:s.keyRevision,redaction:'allowlist-v1',trust:'gateway-verified',catalogTrust:s.catalog?'approved':'none',catalogFreshness:s.catalog?'current':'none',freshness,evidenceState:complete?(eligible?'complete':'late'):'partial',clockSkew:Date.parse(summary.end_time as string)>now||Date.parse(summary.scan_time as string)<s.lease.issuedAt,receivedAt:now,summary:{status:summary.status as 'complete'|'partial'|'error',packageCount:packages.length,findingCount:findings.length,suppressed:(summary.package_records_suppressed??0) as number,diagnostics:summary.diagnostics_count as number,duplicates:summary.duplicates as number,timedOut:summary.timed_out as boolean,durationMs:summary.duration_ms as number},replaceCurrent:eligible,packages:sanitized,exposures:verified,findingIds:findings.map(f=>hash('record',f.record_id)),simulations:verified.map(e=>({alertKey:e.alertKey,mode:'simulation',text:'Review this verified package exposure with an authorized human. No action has been executed.'}))});
}

/** Returns a NON-DURABLE plan. Only the integration transaction may accept it.
 * Reader must stream-bound maxBytes and enforce admission/deadline. Not an HTTP
 * handler: no caller identities, auth credentials, commands or content-encoding. */
export function createBumblebeeIngestor(options:{gateway:BumblebeeGateway;redactionKey:Uint8Array;keyRevision:string;now:()=>number}) {
 must(options.redactionKey instanceof Uint8Array&&options.redactionKey.byteLength===32&&/^[A-Za-z0-9._:-]{1,128}$/.test(options.keyRevision));
 const key=Buffer.from(options.redactionKey),keyRevision=options.keyRevision,gateway=options.gateway,clock=options.now;
 return async(readBody:(maxBytes:number)=>Promise<Uint8Array>):Promise<IngestionResult>=>{
  try{
   const result=await gateway.withVerifiedLease(async(live,recheck):Promise<IngestionResult>=>{
    checkSession(live,clock(),keyRevision);
    // Own a stable snapshot across the body-reader await; never freeze gateway state.
    const session=frozen(structuredClone(live)),source=parseBumblebeeSource(session.source),scope=session.scope;
    const raw=await readBody(BUMBLEBEE.maxWireBytes);
    must(raw instanceof Uint8Array&&raw.byteLength>0&&raw.byteLength<=BUMBLEBEE.maxWireBytes,'wire');
    const bytes=Uint8Array.from(raw);
    const hash:Fingerprint=(domain,value)=>createHmac('sha256',key).update(JSON.stringify(['bumblebee-redaction-v1',scope.groupId,scope.workspaceId,domain,value])).digest('hex');
    const wireDigest=hash('wire',Buffer.from(bytes).toString('base64'));
    // Deny even exact replay after revocation/expiry. Exact replay never returns a
    // fabricated persisted receipt; gateway must reconcile its exact stored receipt.
    if(session.priorWireDigest!==null){
     must(await recheck());checkSession(live,clock(),keyRevision);checkSession(session,clock(),keyRevision);
     must(JSON.stringify(live)===JSON.stringify(session));
     must(session.priorWireDigest===wireDigest,'replay_conflict');return frozen({status:'exact-replay',wireDigest});
    }
    let records:readonly WireRecord[];try{records=parseBumblebeeWire(bytes);}catch{throw new Rejected('wire');}
    const plan=planBatch(records,session,source,hash,wireDigest,clock());
    must(await recheck());checkSession(live,clock(),keyRevision);checkSession(session,clock(),keyRevision);
    // Locks must prevent a source/catalog/head mutation; detect adapter snapshot drift too.
    must(JSON.stringify(live)===JSON.stringify(session));
    return frozen({status:'candidate',plan});
   });
   return result??frozen({status:'rejected',code:'authority'});
  }catch(error){return error instanceof Rejected?frozen({status:'rejected',code:error.code}):frozen({status:'unknown',code:'unavailable'});}
 };
}
