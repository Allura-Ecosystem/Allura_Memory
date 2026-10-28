import {request as httpRequest,type ClientRequest,type IncomingMessage} from 'node:http';
import {request as httpsRequest} from 'node:https';
import {type SQL} from 'bun';
import {type Identity} from './authentication.ts';
import {type Scope,validScope} from './authority.ts';
import {PROJECTION,ProjectionError,parseDestination,notionPatch,compareReadBack,type ProjectionDestination,type ProjectionEnvelope} from './projection-contract.ts';
import {claimProjection,markProjectionWrite,finishProjection,projectionStatus,withProjectionWork,type ProjectionStatus} from './projection.ts';
type Entry={scope:Scope;destination:ProjectionDestination;token:string};
type WireResult={kind:'page';page:unknown}|{kind:'ack'}|{kind:'unknown';reason:'timeout'|'unavailable'|'rate_limited';retryAfterMs?:number};
export type ProjectionTransport=Readonly<{configured:(scope:Scope)=>boolean;has:(scope:Scope,id:string,revision:number)=>boolean;request:(scope:Scope,envelope:ProjectionEnvelope,method:'GET'|'PATCH',signal?:AbortSignal)=>Promise<WireResult>}>;
const issued=new WeakSet<object>();
const key=(scope:Scope,id:string,revision:number)=>JSON.stringify([scope.groupId,scope.workspaceId,id,revision]);
// Explicit server-owned capability registry. No environment proxy, cookie jar,
// redirect, retry, credential discovery or caller-supplied URL is consulted.
export function createProjectionTransport(values:readonly Entry[]=[],fixture=false):ProjectionTransport{
 if(!Array.isArray(values)||values.length>32){throw new ProjectionError('invalid');}
 const entries=new Map<string,Entry>(),targets=new Set<string>();
 for(const value of values){
  if(!value||!validScope(value.scope)||typeof value.token!=='string'||!/^[A-Za-z0-9._-]{16,512}$/.test(value.token)){throw new ProjectionError('invalid');}
  const destination=parseDestination(value.destination,fixture),scope=Object.freeze({...value.scope}),id=key(scope,destination.id,destination.revision),target=JSON.stringify([destination.origin,destination.pageId]);
  if(entries.has(id)||targets.has(target)){throw new ProjectionError('invalid');}entries.set(id,{scope,destination,token:value.token});targets.add(target);
 }
 let active=0;
 const transport:ProjectionTransport=Object.freeze({
  configured:(scope:Scope)=>[...entries.values()].some(e=>e.scope.groupId===scope.groupId&&e.scope.workspaceId===scope.workspaceId),
  has:(scope:Scope,id:string,revision:number)=>entries.has(key(scope,id,revision)),
  request:async(scope:Scope,envelope:ProjectionEnvelope,method:'GET'|'PATCH',signal?:AbortSignal):Promise<WireResult>=>{
   signal?.throwIfAborted();const entry=entries.get(key(scope,envelope.destination.id,envelope.destination.revision));
   if(!entry||JSON.stringify(entry.destination)!==JSON.stringify(parseDestination(envelope.destination,fixture))||!['GET','PATCH'].includes(method)){throw new ProjectionError('forbidden');}
   if(active>=4){return {kind:'unknown',reason:'unavailable'};}active++;
   try{return await new Promise<WireResult>(resolve=>{
    let req:ClientRequest|undefined,incoming:IncomingMessage|undefined,outcome:WireResult|undefined,settled=false;const unknown=():WireResult=>({kind:'unknown',reason:'unavailable'});
    const finish=()=>{if(settled){return;}settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);resolve(outcome??unknown());};
    const stop=(result:WireResult)=>{if(!outcome){outcome=result;}if(incoming){incoming.destroy();}if(req){req.destroy();}else{finish();}};
    const abort=()=>stop({kind:'unknown',reason:'timeout'}),timer=setTimeout(abort,PROJECTION.requestMs);signal?.addEventListener('abort',abort,{once:true});
    try{
     const body=method==='PATCH'?JSON.stringify(notionPatch(envelope)):undefined;
     if(body!==undefined&&Buffer.byteLength(body)>PROJECTION.maxResponseBytes){stop(unknown());return;}
     const target=new URL(`/v1/pages/${entry.destination.pageId}`,entry.destination.origin),request=target.protocol==='https:'?httpsRequest:httpRequest;
     req=request(target,{method,agent:false,maxHeaderSize:8192,headers:{Authorization:`Bearer ${entry.token}`,'Notion-Version':PROJECTION.notionVersion,Accept:'application/json','Accept-Encoding':'identity',...(body===undefined?{}:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)})}},res=>{
      incoming=res;res.once('close',finish);
      if(res.statusCode===429){const value=res.headers['retry-after'];let delay=typeof value==='string'&&/^\d{1,5}$/.test(value)?Number(value)*1000:typeof value==='string'?Date.parse(value)-Date.now():NaN;if(!Number.isFinite(delay)||delay<0||delay>86400000){delay=86400000;}stop({kind:'unknown',reason:'rate_limited',retryAfterMs:Math.ceil(delay)});return;}
      if(res.statusCode!==200||(res.headers['content-encoding']&&res.headers['content-encoding']!=='identity')||Number(res.headers['content-length']??0)>PROJECTION.maxResponseBytes){stop(unknown());return;}
      const chunks:Buffer[]=[];let bytes=0;
      res.on('data',(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>PROJECTION.maxResponseBytes){stop(unknown());}else{chunks.push(chunk);}});
      res.on('error',()=>stop(unknown()));res.on('aborted',()=>stop(unknown()));
      res.on('end',()=>{if(outcome){return;}if(method==='PATCH'){stop({kind:'ack'});return;}try{if(res.headers['content-type']?.split(';')[0]?.trim()!=='application/json'){throw new Error();}const bytes=Buffer.concat(chunks),text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);stop({kind:'page',page:JSON.parse(text)});}catch{stop(unknown());}});
     });
     req.once('error',()=>{if(!outcome){outcome=unknown();}});req.once('close',()=>{if(!incoming){finish();}});
     if(signal?.aborted){abort();return;}req.end(body);
    }catch{stop(unknown());}
   });}finally{active--;}
  },
 });issued.add(transport);return transport;
}
export async function deliverProjection(sql:SQL,identity:Identity,scope:Scope,id:string,transport:ProjectionTransport,signal?:AbortSignal):Promise<ProjectionStatus>{
 signal?.throwIfAborted();if(!issued.has(transport)){throw new ProjectionError('forbidden');}
 const status=await projectionStatus(sql,identity,scope,id);
 if(!transport.has(scope,status.destinationId,status.destinationRevision)){throw new ProjectionError('forbidden');}
 signal?.throwIfAborted();const claim=await claimProjection(sql,identity,scope,id);if(claim.state!=='claimed'){return projectionStatus(sql,identity,scope,id);}
 const read=()=>withProjectionWork(sql,identity,scope,id,claim,e=>transport.request(scope,e,'GET',signal));
 const first=await read();
 if(first.kind==='page'&&compareReadBack(claim.envelope,first.page)==='empty'&&claim.mode==='read_then_write'){
  signal?.throwIfAborted();
  // A failed/ambiguous commit throws here: never proceed to PATCH or clean up
  // a transaction that could have committed. Next claim only reconciles.
  await markProjectionWrite(sql,identity,scope,id,claim);signal?.throwIfAborted();
  const write=await withProjectionWork(sql,identity,scope,id,claim,e=>transport.request(scope,e,'PATCH',signal));
  if(write.kind==='unknown'){await finishProjection(sql,identity,scope,id,claim,{reason:write.reason,...(write.retryAfterMs===undefined?{}:{retryAfterMs:write.retryAfterMs})});}
  else{const last=await read();await finishProjection(sql,identity,scope,id,claim,last.kind==='page'?{page:last.page}:last.kind==='unknown'?{reason:last.reason,...(last.retryAfterMs===undefined?{}:{retryAfterMs:last.retryAfterMs})}:{reason:'unavailable'});}
 }else{await finishProjection(sql,identity,scope,id,claim,first.kind==='page'?{page:first.page}:first.kind==='unknown'?{reason:first.reason,...(first.retryAfterMs===undefined?{}:{retryAfterMs:first.retryAfterMs})}:{reason:'unavailable'});}
 return projectionStatus(sql,identity,scope,id);
}
