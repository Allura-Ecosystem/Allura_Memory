import {type SQL} from 'bun';
import {createHash} from 'node:crypto';
import {type Identity} from './authentication.ts';
import {AuthorityError,type Scope} from './authority.ts';
import {scopedTransaction} from './persistence.ts';
import {BumblebeeConfigurationError,type BumblebeeSourceView} from './bumblebee-configuration.ts';
import {populationDigest} from './bumblebee-contract.ts';
import {createBumblebeeIngestor,type GatewaySession,type SanitizedPackage} from './bumblebee-ingestion.ts';
type VerifiedContext={session:GatewaySession;receipt:string|null};
async function safe<T>(work:()=>Promise<T>):Promise<T>{try{return await work();}catch(e){if(e instanceof AuthorityError||e instanceof BumblebeeConfigurationError){throw e;}const message=e instanceof Error?e.message:'';if(message==='invalid'||message==='forbidden'||message==='not_found'||message==='conflict'){throw new BumblebeeConfigurationError(message);}throw new BumblebeeConfigurationError('unknown');}}
function ingestDigest(token:string):string{if(typeof token!=='string'||!/^bbi1\.[A-Za-z0-9_-]{43}$/.test(token)||Buffer.from(token.slice(5),'base64url').toString('base64url')!==token.slice(5)){throw new BumblebeeConfigurationError('forbidden');}return createHash('sha256').update(token).digest('hex');}
/** The planner receives only a database-produced snapshot while its authority,
 * source, catalog, credential, lease and population locks remain held. No public
 * route accepts an Identity/GatewaySession/plan or arbitrary SQL callback. */
export function createBumblebeePersistence(sql:SQL,options:{redactionKey:Uint8Array;keyRevision:string}){
 if(!(options.redactionKey instanceof Uint8Array)||options.redactionKey.byteLength!==32||!/^[A-Za-z0-9._:-]{1,128}$/.test(options.keyRevision)){throw new BumblebeeConfigurationError('invalid');}
 const redactionKey=Uint8Array.from(options.redactionKey),keyRevision=options.keyRevision;
 return Object.freeze({async ingest(token:string,readBody:(maxBytes:number)=>Promise<Uint8Array>,signal?:AbortSignal):Promise<string>{
  const digest=ingestDigest(token);return safe(()=>sql.begin(async tx=>{
   signal?.throwIfAborted();await tx`SELECT set_config('statement_timeout','5000',true),set_config('lock_timeout','2000',true),set_config('idle_in_transaction_session_timeout','5000',true)`;
   const load=async():Promise<VerifiedContext>=>{signal?.throwIfAborted();const [row]=await tx`SELECT allura.bumblebee_ingest_context(${digest},${keyRevision}) AS verified`;return row.verified as VerifiedContext;};
   const context=await load();signal?.throwIfAborted();
   const planner=createBumblebeeIngestor({redactionKey,keyRevision,now:Date.now,gateway:{async withVerifiedLease(use){return use(context.session,async()=>JSON.stringify(await load())===JSON.stringify(context));}}});
   let bodyError:unknown;
   const result=await planner(async max=>{try{signal?.throwIfAborted();const bytes=await readBody(max);signal?.throwIfAborted();return bytes;}catch(e){bodyError=e;throw e;}});signal?.throwIfAborted();
   // Preserve only the trusted reader's fixed typed errors, never raw exceptions.
   if(bodyError instanceof BumblebeeConfigurationError){throw bodyError;}
   if(result.status==='rejected'){throw new BumblebeeConfigurationError(result.code==='authority'?'forbidden':result.code==='replay_conflict'?'conflict':'invalid');}
   if(result.status==='unknown'){throw new BumblebeeConfigurationError('unknown');}
   if(result.status==='exact-replay'){if(context.receipt===null){throw new BumblebeeConfigurationError('unknown');}return context.receipt;}
   const [row]=await tx`SELECT allura.bumblebee_accept_batch(${digest},${result.plan}::jsonb) AS receipt`;signal?.throwIfAborted();return row.receipt as string;
  }));
 }});
}
export type BumblebeeInventory=Readonly<{source:BumblebeeSourceView;sourceId:string;current:Readonly<{leaseId:string;generation:number;populationDigest:string;packages:readonly SanitizedPackage[];packageCount:number;packagesTruncated:boolean;freshness:'fresh'|'stale'}>|null;alertCount:number;alertsTruncated:boolean;alerts:readonly Readonly<{alertKey:string;catalogEntryId:string;ecosystem:'npm'|'pypi';name:string;version:string;simulation:Readonly<{mode:'simulation';text:string}>}>[]}>;
export async function readBumblebeeInventory(sql:SQL,identity:Identity,scope:Scope,sourceId:string):Promise<BumblebeeInventory>{
 if(typeof sourceId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(sourceId)){throw new BumblebeeConfigurationError('invalid');}
 return safe(()=>scopedTransaction(sql,identity,scope,'evidence:read',async tx=>{
  await tx`SELECT pg_advisory_xact_lock(hashtextextended(jsonb_build_array(${scope.groupId}::text,${scope.workspaceId}::uuid,${sourceId}::uuid)::text,10103))`;
  const [row]=await tx`SELECT allura.read_bumblebee_source(${scope.groupId},${scope.workspaceId}::uuid,${sourceId}::uuid) AS source`,source=row.source as BumblebeeSourceView;
  const [data]=await tx`SELECT allura.read_bumblebee_inventory(${scope.groupId},${scope.workspaceId}::uuid,${sourceId}::uuid,${populationDigest(source.source)}) AS inventory`;return {...data.inventory,source} as BumblebeeInventory;
 }));
}
