import {type Scope} from './authority.ts';
import {viewOutcome,type DashboardState} from './dashboard-contract.ts';
export class DashboardError extends Error{constructor(readonly code:DashboardState){super(`dashboard_${code}`);this.name='DashboardError';}}
const getRoutes=new Set(['/api/apps','/api/dashboard/context','/api/health','/api/evidence','/api/projection/configuration']);
const postRoutes=new Set(['/api/apps/configure','/api/apps/view','/api/dashboard/proposals','/api/memory/list','/api/memory/get','/api/memory/search','/api/memory/graph','/api/memory/history','/api/memory/delete','/api/review/proposal','/api/review/evidence','/api/review/submit','/api/review/correction','/api/review/restoration','/api/review/decision','/api/operations','/api/access','/api/devices/command','/api/index/drain','/api/projection/authorize','/api/projection/process','/api/projection/revoke']);
function checkedScope(scope:Scope):Scope{if(!scope||typeof scope.groupId!=='string'||!/^allura-[a-z0-9][a-z0-9-]{0,79}$/.test(scope.groupId)||typeof scope.workspaceId!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(scope.workspaceId)){throw new DashboardError('invalid');}return Object.freeze({groupId:scope.groupId,workspaceId:scope.workspaceId});}
// No auth headers, token source, localStorage or retries. Browser-managed same-origin
// HttpOnly identity only. Server authority, not this routing scope, decides access.
export class DashboardTransport{
 readonly #origin:string;readonly #timeout:number;readonly #onReset:(reason:'scope'|'denied'|'closed')=>void;
 #scope:Scope;#epoch=0;#denied=false;#closed=false;readonly #active=new Set<AbortController>();
 constructor(origin:string,scope:Scope,onReset:(reason:'scope'|'denied'|'closed')=>void,options:{timeoutMs?:number}={}){
  let url:URL;try{url=new URL(origin);}catch{throw new DashboardError('invalid');}
  if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||(origin!==url.origin&&origin!==url.origin+'/')||(url.protocol!=='https:'&&!(url.protocol==='http:'&&['127.0.0.1','[::1]'].includes(url.hostname)))){throw new DashboardError('invalid');}
  const timeout=options.timeoutMs??5000;if(!Number.isSafeInteger(timeout)||timeout<1||timeout>5000||typeof onReset!=='function'){throw new DashboardError('invalid');}
  this.#origin=url.origin;this.#scope=checkedScope(scope);this.#onReset=onReset;this.#timeout=timeout;
 }
 #reset(reason:'scope'|'denied'|'closed'):void{this.#epoch++;for(const controller of this.#active){controller.abort();}this.#onReset(reason);}
 setScope(scope:Scope):void{if(this.#closed){throw new DashboardError('stale');}const next=checkedScope(scope);this.#scope=next;this.#denied=false;this.#reset('scope');}
 close():void{if(!this.#closed){this.#closed=true;this.#reset('closed');}}
 async request(path:string,body?:Record<string,unknown>):Promise<unknown>{
  if(this.#closed){throw new DashboardError('stale');}if(this.#denied){throw new DashboardError('denied');}
  const get=getRoutes.has(path)||/^\/api\/projection\/delivery\?id=[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(path);if((!get&&!postRoutes.has(path))||(get&&body!==undefined)){throw new DashboardError('invalid');}
  let payload:string|undefined;try{if(!get){if(body!==undefined&&(!body||Array.isArray(body)||typeof body!=='object')){throw new Error();}payload=JSON.stringify(body??{});if(new TextEncoder().encode(payload).length>65536){throw new Error();}}}catch{throw new DashboardError('invalid');}
  if(this.#active.size>=8){throw new DashboardError('unavailable');}
  const epoch=this.#epoch,url=new URL(path,this.#origin);url.searchParams.set('group_id',this.#scope.groupId);url.searchParams.set('workspace_id',this.#scope.workspaceId);
  const controller=new AbortController();this.#active.add(controller);const timer=setTimeout(()=>controller.abort(),this.#timeout);
  const current=()=>{if(epoch!==this.#epoch||this.#closed){throw new DashboardError('stale');}if(controller.signal.aborted){throw new DashboardError('unknown');}};
  try{
   const response=await fetch(url,{method:get?'GET':'POST',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{Accept:'application/json',...(get?{}:{'Content-Type':'application/json'})},...(payload===undefined?{}:{body:payload}),signal:controller.signal});current();
   if(response.status===401||response.status===403){this.#denied=true;this.#reset('denied');throw new DashboardError('denied');}
   if(response.status!==200){void response.body?.cancel().catch(()=>{});throw new DashboardError(viewOutcome(response.status));}
   if(response.headers.get('content-type')?.split(';')[0]?.trim()!=='application/json'||!response.body){void response.body?.cancel().catch(()=>{});throw new DashboardError('unknown');}
   const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
   try{while(true){current();const {done,value}=await reader.read();current();if(done){break;}size+=value.length;if(size>131072){void reader.cancel().catch(()=>{});throw new DashboardError('unknown');}chunks.push(value);}}
   finally{reader.releaseLock();}
   current();const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}const result:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));current();return result;
  }catch(error){if(error instanceof DashboardError){throw error;}if(epoch!==this.#epoch||this.#closed){throw new DashboardError('stale');}throw new DashboardError('unknown');}
  finally{clearTimeout(timer);controller.abort();this.#active.delete(controller);}
 }
}
