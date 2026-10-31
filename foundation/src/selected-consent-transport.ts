import {type Scope} from './authority.ts';
import {DashboardError} from './dashboard-transport.ts';
export type SelectedConsentDisplay=Readonly<{clientId:string;name:string;redirectUri:string;actions:readonly string[];groupId:string;workspaceId:string;transaction:string;nonce:string;mode:'selected';connectionId:string}>;
const secret=/^[A-Za-z0-9_-]{43}$/;
const connection=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const object=(value:unknown):Record<string,unknown>=>{if(!value||typeof value!=='object'||Array.isArray(value)){throw new DashboardError('unknown');}return value as Record<string,unknown>;};
function callbackUrl(value:unknown):URL{
 if(typeof value!=='string'||value.length>2048){throw new DashboardError('unknown');}let url:URL;try{url=new URL(value);}catch{throw new DashboardError('unknown');}
 if(url.href!==value||url.username||url.password||value.includes('#')||(url.protocol!=='https:'&&!(url.protocol==='http:'&&['127.0.0.1','[::1]','localhost'].includes(url.hostname)))){throw new DashboardError('unknown');}return url;
}
export function selectedConsentTransaction(location:string):string{
 let url:URL;try{url=new URL(location);}catch{throw new DashboardError('invalid');}
 const transaction=url.searchParams.get('transaction');if(url.pathname!=='/dashboard/oauth/selected-consent'||location.includes('#')||url.searchParams.size!==1||!transaction||!secret.test(transaction)){throw new DashboardError('invalid');}return transaction;
}
// One display and one decision. Failed or lost responses are terminal, never retried.
// No bearer input, browser storage, token exchange, or scope enumeration.
export class SelectedConsentTransport{
 readonly #scope:Scope;readonly #origin:string;readonly #transaction:string;readonly #timeout:number;
 #phase:'entry'|'displaying'|'displayed'|'deciding'|'closed'='entry';#shown:SelectedConsentDisplay|null=null;#active:AbortController|null=null;
 constructor(origin:string,scope:Scope,transaction:string,options:{timeoutMs?:number}={}){
  let url:URL;try{url=new URL(origin);}catch{throw new DashboardError('invalid');}
  const timeout=options.timeoutMs??5000;
  if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||(origin!==url.origin&&origin!==url.origin+'/')||(url.protocol!=='https:'&&!(url.protocol==='http:'&&['127.0.0.1','[::1]'].includes(url.hostname)))||!Number.isSafeInteger(timeout)||timeout<1||timeout>5000||!secret.test(transaction)||!scope||typeof scope.groupId!=='string'||!/^allura-[a-z0-9][a-z0-9-]{0,79}$/.test(scope.groupId)||typeof scope.workspaceId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(scope.workspaceId)){throw new DashboardError('invalid');}
  this.#origin=url.origin;this.#scope=Object.freeze({groupId:scope.groupId,workspaceId:scope.workspaceId});this.#transaction=transaction;this.#timeout=timeout;
 }
 close():void{this.#phase='closed';this.#shown=null;this.#active?.abort();}

 async #request(body?:Record<string,unknown>):Promise<unknown>{
  const url=new URL('/api/oauth/selected-consent',this.#origin);url.search=new URLSearchParams({transaction:this.#transaction,group_id:this.#scope.groupId,workspace_id:this.#scope.workspaceId}).toString();
  const controller=new AbortController();this.#active=controller;const timer=setTimeout(()=>controller.abort(),this.#timeout);let cleanup=()=>{};
  const current=()=>{if(this.#phase==='closed'){throw new DashboardError('stale');}if(controller.signal.aborted){throw new DashboardError('unknown');}};
  let onAbort=()=>{};const aborted=new Promise<never>((_resolve,reject)=>{onAbort=()=>reject(new DashboardError(this.#phase==='closed'?'stale':'unknown'));controller.signal.addEventListener('abort',onAbort,{once:true});});
  try{
   const response=await Promise.race([fetch(url,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:controller.signal}).then(response=>{if(controller.signal.aborted){void response.body?.cancel().catch(()=>{});}return response;}),aborted]);current();
   if(response.status!==200){void response.body?.cancel().catch(()=>{});throw new DashboardError(response.status===401||response.status===403?'denied':'unknown');}
   if(response.headers.get('content-type')?.split(';')[0]?.trim()!=='application/json'||!response.body){void response.body?.cancel().catch(()=>{});throw new DashboardError('unknown');}
   const reader=response.body.getReader();cleanup=()=>{void reader.cancel().catch(()=>{});reader.releaseLock();};const chunks:Uint8Array[]=[];let size=0;
   while(true){const {done,value}=await Promise.race([reader.read(),aborted]);current();if(done){break;}size+=value.length;if(size>16384){throw new DashboardError('unknown');}chunks.push(value);}
   const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  }catch(error){if(error instanceof DashboardError){throw error;}throw new DashboardError('unknown');}
  finally{clearTimeout(timer);controller.signal.removeEventListener('abort',onAbort);cleanup();controller.abort();this.#active=null;}
 }
 async display():Promise<SelectedConsentDisplay>{
  if(this.#phase!=='entry'){throw new DashboardError('stale');}this.#phase='displaying';
  try{const v=object(await this.#request());
   if(Object.keys(v).length!==10||Object.keys(v).some(k=>!['clientId','name','redirectUri','actions','groupId','workspaceId','transaction','nonce','mode','connectionId'].includes(k))||typeof v.clientId!=='string'||!v.clientId||v.clientId.length>256||typeof v.name!=='string'||!v.name||v.name.length>256||v.groupId!==this.#scope.groupId||v.workspaceId!==this.#scope.workspaceId||v.transaction!==this.#transaction||typeof v.nonce!=='string'||!secret.test(v.nonce)||!Array.isArray(v.actions)||v.actions.length!==1||v.actions[0]!=='memory:selected:read'||v.mode!=='selected'||typeof v.connectionId!=='string'||!connection.test(v.connectionId)){throw new DashboardError('unknown');}
   const callback=callbackUrl(v.redirectUri);if(['code','state','error','error_description','error_uri'].some(k=>callback.searchParams.has(k))){throw new DashboardError('unknown');}
   const shown=Object.freeze({...v,actions:Object.freeze([...v.actions])}) as SelectedConsentDisplay;this.#shown=shown;this.#phase='displayed';return shown;
  }catch(error){this.close();throw error;}
 }
 async decide(decision:'approve'|'cancel'):Promise<string>{
  if(this.#phase!=='displayed'||!this.#shown||!['approve','cancel'].includes(decision)){throw new DashboardError('stale');}const shown=this.#shown;this.#phase='deciding';
  try{const result=object(await this.#request({...shown,decision}));if(Object.keys(result).length!==2||!Object.hasOwn(result,'redirect')||result.connectionId!==shown.connectionId){throw new DashboardError('unknown');}const redirect=callbackUrl(result.redirect),registered=callbackUrl(shown.redirectUri);
   if(redirect.origin!==registered.origin||redirect.pathname!==registered.pathname){throw new DashboardError('unknown');}
   const field=decision==='approve'?'code':'error',value=redirect.searchParams.get(field);if(redirect.searchParams.getAll(field).length!==1||(decision==='approve'?!value||!secret.test(value):value!=='access_denied')){throw new DashboardError('unknown');}
   const state=redirect.searchParams.getAll('state');if(state.length>1||(state.length===1&&!/^[\x21-\x7e]{1,512}$/.test(state[0]!))){throw new DashboardError('unknown');}
   redirect.searchParams.delete(field);redirect.searchParams.delete('state');if(redirect.searchParams.toString()!==registered.searchParams.toString()){throw new DashboardError('unknown');}return result.redirect as string;
  }finally{this.close();}
 }
}
