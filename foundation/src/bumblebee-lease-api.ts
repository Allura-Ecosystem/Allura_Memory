import {type SQL} from 'bun';
import {createBumblebeeLeases} from './bumblebee-leases.ts';
import {BumblebeeConfigurationError} from './bumblebee-configuration.ts';
import {createWorkBudget,WorkBudgetError} from './work-budget.ts';
import {createBumblebeePersistence} from './bumblebee-persistence.ts';
import {timingSafeEqual} from 'node:crypto';
const response=(status:number,outcome:unknown)=>Response.json(outcome,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
function invalid():never{throw new BumblebeeConfigurationError('invalid');}
async function readBytes(request:Request,signal:AbortSignal,limit:number,contentType:string):Promise<Uint8Array>{
 if(request.headers.get('content-type')?.split(';')[0]?.trim()!==contentType||(request.headers.has('content-encoding')&&request.headers.get('content-encoding')!=='identity')){invalid();}
 const length=request.headers.get('content-length');if(length!==null&&(!/^\d+$/.test(length)||Number(length)>limit)){invalid();}if(!request.body){invalid();}
 const reader=request.body.getReader(),cancel=()=>{void reader.cancel().catch(()=>undefined);};signal.addEventListener('abort',cancel,{once:true});const chunks:Uint8Array[]=[];let size=0;
 try{
  while(true){signal.throwIfAborted();const {done,value}=await reader.read();if(done){break;}size+=value.length;if(size>limit){cancel();invalid();}chunks.push(value);}
  signal.throwIfAborted();return Buffer.concat(chunks);
 }finally{signal.removeEventListener('abort',cancel);reader.releaseLock();}
}
/** Dedicated route: no client scope and no general browser/MCP authority. The
 * loopback exception is an explicit fixture constructor choice, never a header. */
type LeaseOptions={leaseKey:Uint8Array;keyRevision:string;allowLoopbackFixture?:boolean;timeoutMs?:number};
export type BumblebeeScannerOptions=LeaseOptions&{redactionKey:Uint8Array;redactionKeyRevision:string};
export function createBumblebeeLeaseGateway(sql:SQL,options:LeaseOptions){return createIngress(sql,options);}
export function createBumblebeeScannerGateway(sql:SQL,options:BumblebeeScannerOptions){
 if(!(options.leaseKey instanceof Uint8Array)||!(options.redactionKey instanceof Uint8Array)||options.leaseKey.byteLength!==32||options.redactionKey.byteLength!==32||timingSafeEqual(options.leaseKey,options.redactionKey)){invalid();}
 return createIngress(sql,options,createBumblebeePersistence(sql,{redactionKey:options.redactionKey,keyRevision:options.redactionKeyRevision}));
}
function createIngress(sql:SQL,options:LeaseOptions,persistence?:ReturnType<typeof createBumblebeePersistence>){
 const leases=createBumblebeeLeases(sql,options),budget=createWorkBudget({capacity:8,timeoutMs:options.timeoutMs??2000});
 return async(request:Request):Promise<Response>=>{
  try{
   const url=new URL(request.url),upload=url.pathname==='/api/bumblebee/ingest';if(request.method!=='POST'||(url.pathname!=='/api/bumblebee/lease'&&!(upload&&persistence))){return response(404,{outcome:'not_found'});}
   if(url.protocol!=='https:'&&!(options.allowLoopbackFixture===true&&url.protocol==='http:'&&url.hostname==='127.0.0.1')){throw new BumblebeeConfigurationError('forbidden');}
   if(request.headers.has('cookie')||request.headers.has('Cf-Access-Jwt-Assertion')||request.headers.has('origin')||request.headers.has('sec-fetch-site')){throw new BumblebeeConfigurationError('forbidden');}
   const authorization=request.headers.get('authorization');if(!authorization?.startsWith('Bearer ')){throw new BumblebeeConfigurationError('forbidden');}
   const selected=()=>{if(url.search||url.hash||url.username||url.password||request.url.length>2048){invalid();}};
   const result=await budget.run<unknown>(signal=>upload?persistence!.ingest(authorization.slice(7),async max=>{selected();return readBytes(request,signal,max,'application/x-ndjson');},signal):leases.acquireFrom(authorization.slice(7),async()=>{selected();const bytes=await readBytes(request,signal,4096,'application/json');try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{invalid();}},signal),request.signal);
   return upload?new Response(result as string,{status:200,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}}):response(200,result);
  }catch(e){
   if(e instanceof BumblebeeConfigurationError){return response(e.code==='forbidden'?403:e.code==='invalid'?400:e.code==='conflict'?409:503,{outcome:e.code});}
   if(e instanceof WorkBudgetError){return response(e.code==='busy'?429:504,{outcome:e.code==='busy'?'unavailable':'unknown'});}
   return response(503,{outcome:'unknown'});
  }
 };
}
