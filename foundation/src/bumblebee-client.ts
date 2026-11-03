import {BUMBLEBEE,parseBumblebeeSource,parseLeaseRequest,populationDigest,type BumblebeeSource} from './bumblebee-contract.ts';
import {runBumblebeeScan} from './bumblebee-runner.ts';
import {type BumblebeeLease} from './bumblebee-leases.ts';
import {type Scope} from './authority.ts';
type Options={origin:string;scope:Scope;source:BumblebeeSource;sourceRevision:number;operationKey:string;runnerToken:string;binary:string;roots:Parameters<typeof runBumblebeeScan>[0]['roots'];ca?:string};
type Receipt={version:'bumblebee-ingest-v1';sourceId:string;leaseId:string;generation:number;eventId:string;state:'complete'|'partial'|'late';replacedCurrent:boolean;packageCount:number;exposureCount:number;wireDigest:string;redaction:'allowlist-v1';keyRevision:string};
class RunError extends Error{constructor(code:'invalid'|'unknown'|'forbidden'|'conflict'){super(`bumblebee_run_${code}`);}}
function requireRun(value:unknown):asserts value{if(!value){throw new RunError('invalid');}}
function requireResponse(value:unknown):asserts value{if(!value){throw new RunError('unknown');}}
const uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const digest=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const revision=(v:unknown)=>typeof v==='string'&&/^[A-Za-z0-9._:-]{1,128}$/.test(v);
const integer=(v:unknown,min:number,max:number)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max;
function keys(v:unknown,expected:string[]):asserts v is Record<string,unknown>{requireResponse(v&&typeof v==='object'&&!Array.isArray(v));requireResponse(Object.keys(v).length===expected.length&&expected.every(k=>Object.hasOwn(v,k)));}
/** Explicit one-shot leased runner SDK. No enrollment, scheduling, token storage,
 * automatic retry or disk spool. run() acquires one lease before scanning;
 * submit() explicitly reconciles the SAME in-memory bytes, never rescans.
 * After process loss/close an ambiguous delivery remains unknown. */
export function createBumblebeeRun(input:Options){
 let origin:string,source:BumblebeeSource,command:ReturnType<typeof parseLeaseRequest>;
 try{const url=new URL(input.origin);requireRun(url.protocol==='https:'&&url.origin===input.origin&&!url.username&&!url.password);origin=url.origin;source=parseBumblebeeSource(input.source);command=parseLeaseRequest({sourceRevision:input.sourceRevision,operationKey:input.operationKey});}catch{throw new RunError('invalid');}
 requireRun(/^allura-[a-z0-9][a-z0-9-]{0,79}$/.test(input.scope.groupId)&&uuid(input.scope.workspaceId)&&/^bbr1\.[A-Za-z0-9_-]{43}$/.test(input.runnerToken));requireRun(input.ca===undefined||(typeof input.ca==='string'&&Buffer.byteLength(input.ca)>0&&Buffer.byteLength(input.ca)<=65536));
 const scope={...input.scope},binary=input.binary,roots=input.roots.map(r=>({...r})),tls={rejectUnauthorized:true,...(input.ca?{ca:input.ca}:{})},closedSignal=new AbortController();let token=input.runnerToken,lease:BumblebeeLease|undefined,wire:Uint8Array|undefined,started=false,active=false,closed=false,receiptText:string|undefined;
 const post=async(path:'/api/bumblebee/lease'|'/api/bumblebee/ingest',secret:string,body:string|Uint8Array,parent:AbortSignal)=>{
  const signal=AbortSignal.any([parent,AbortSignal.timeout(5000)]);signal.throwIfAborted();const response=await fetch(origin+path,{method:'POST',redirect:'error',credentials:'omit',headers:{Authorization:`Bearer ${secret}`,'content-type':path.endsWith('/lease')?'application/json':'application/x-ndjson'},body:typeof body==='string'?body:Buffer.from(body),signal,tls});
  if(response.status!==200){void response.body?.cancel();throw new RunError(response.status===401||response.status===403?'forbidden':response.status===409?'conflict':'unknown');}
  if(response.headers.get('content-type')?.split(';')[0]!=='application/json'||response.headers.has('content-encoding')){void response.body?.cancel();throw new RunError('unknown');}
  const reader=response.body?.getReader();requireRun(reader);const chunks:Uint8Array[]=[];let size=0;const cancel=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',cancel,{once:true});
  try{while(true){signal.throwIfAborted();const part=await reader.read();if(part.done){break;}size+=part.value.byteLength;if(size>65536){cancel();throw new RunError('unknown');}chunks.push(part.value);}signal.throwIfAborted();return new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));}finally{signal.removeEventListener('abort',cancel);reader.releaseLock();}
 };
 const upload=async(signal:AbortSignal):Promise<Receipt>=>{
  requireRun(lease&&wire&&lease.expiresAt>Date.now());const text=await post('/api/bumblebee/ingest',lease.ingestToken,wire,signal),r:unknown=JSON.parse(text);keys(r,['version','sourceId','leaseId','generation','eventId','state','replacedCurrent','packageCount','exposureCount','wireDigest','redaction','keyRevision']);
  requireResponse(r.version==='bumblebee-ingest-v1'&&r.sourceId===source.sourceId&&r.leaseId===lease.leaseId&&r.generation===lease.generation&&uuid(r.eventId)&&['complete','partial','late'].includes(String(r.state))&&r.replacedCurrent===(r.state==='complete')&&integer(r.packageCount,0,BUMBLEBEE.maxRecords)&&integer(r.exposureCount,0,BUMBLEBEE.maxRecords)&&digest(r.wireDigest)&&r.redaction==='allowlist-v1'&&revision(r.keyRevision));requireResponse(receiptText===undefined||receiptText===text);receiptText=text;return Object.freeze(r) as Receipt;
 };
 const exclusive=async(work:(signal:AbortSignal)=>Promise<Receipt>,external?:AbortSignal)=>{
  requireRun(!closed&&!active);active=true;const signal=AbortSignal.any([closedSignal.signal,AbortSignal.timeout(45000),...(external?[external]:[])]);
  try{signal.throwIfAborted();return await work(signal);}catch(error){if(error instanceof RunError){throw error;}throw new RunError('unknown');}finally{active=false;if(closed){wire?.fill(0);wire=undefined;lease=undefined;token='';receiptText=undefined;}}
 };
 return Object.freeze({
  run:(signal?:AbortSignal)=>exclusive(async live=>{
   requireRun(!started);started=true;const value:unknown=JSON.parse(await post('/api/bumblebee/lease',token,JSON.stringify(command),live));keys(value,['groupId','workspaceId','sourceId','source','sourceRevision','leaseId','generation','populationDigest','catalogDigest','issuedAt','expiresAt','ingestToken','keyRevision','artifactSha256']);
   requireResponse(value.groupId===scope.groupId&&value.workspaceId===scope.workspaceId&&value.sourceId===source.sourceId&&value.sourceRevision===command.sourceRevision&&JSON.stringify(parseBumblebeeSource(value.source))===JSON.stringify(source)&&uuid(value.leaseId)&&integer(value.generation,1,Number.MAX_SAFE_INTEGER)&&value.populationDigest===populationDigest(source)&&(value.catalogDigest===null||digest(value.catalogDigest))&&integer(value.issuedAt,0,Date.now()+30000)&&integer(value.expiresAt,Date.now()+1,Date.now()+630000)&&Number(value.expiresAt)-Number(value.issuedAt)===BUMBLEBEE.leaseSeconds*1000&&typeof value.ingestToken==='string'&&/^bbi1\.[A-Za-z0-9_-]{43}$/.test(value.ingestToken)&&revision(value.keyRevision)&&value.artifactSha256==='3b46f98ab8fa6345a5d39c7483ff37c51b2ee7699aabe51f2a54133f357f6c7a');
   lease=value as unknown as BumblebeeLease;wire=await runBumblebeeScan({binary,source,roots,signal:live});live.throwIfAborted();return upload(live);
  },signal),
  submit:(signal?:AbortSignal)=>exclusive(upload,signal),
  close:()=>{closed=true;closedSignal.abort();wire?.fill(0);wire=undefined;lease=undefined;token='';receiptText=undefined;},
 });
}
