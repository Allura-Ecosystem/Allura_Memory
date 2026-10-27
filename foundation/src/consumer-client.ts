import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {type CallToolResult} from '@modelcontextprotocol/sdk/types.js';
import {CONSUMER_VERSION,CONSUMER_CONTRACT,type MemoryTool} from './consumer-contract.js';
export {DISCLOSURE,CONSUMER_VERSION,CONSUMER_CONTRACT} from './consumer-contract.js';
export type Outcome='invalid'|'unauthenticated'|'forbidden'|'not_found'|'conflict'|'unavailable'|'unknown';
export class ConsumerError extends Error{constructor(readonly outcome:Outcome){super(outcome);this.name='ConsumerError';}}
export type ConsumerOptions={endpoint:string;groupId:string;workspaceId:string;token:()=>Promise<string>;allowLoopback?:boolean;timeoutMs?:number};
export type AddInput={content:string;idempotency_key:string;trace_type?:'run'|'tool'|'failure'|'cron'|'conversation';threshold?:number|null;metadata?:{source?:string;source_id?:string;tags?:string[]}};
export type SearchInput={query:string;status?:'approved'|'all';limit?:number;history?:boolean;min_score?:number};
export type GetInput={id:string;kind?:'semantic'|'receipt';history?:boolean};
export type ListInput={limit?:number;history?:boolean;cursor?:string};
export type DeleteInput={memoryId:string;expectedHeadRevision:number;reason:string;operationKey:string};
let activeFetches=0;
const outcomes=new Set<Outcome>(['invalid','unauthenticated','forbidden','not_found','conflict','unavailable','unknown']);
function sanitized(error:unknown):ConsumerError{return error instanceof ConsumerError?error:new ConsumerError('unknown');}
export class AlluraClient{
 readonly #client=new Client({name:'allura-consumer',version:CONSUMER_VERSION},{capabilities:{}});
 readonly #url:URL;readonly #token:()=>Promise<string>;readonly #timeout:number;#ready=false;#closed=false;
 constructor(options:ConsumerOptions){
  try{
   const url=new URL(options.endpoint);if(url.username||url.password||url.search||url.hash||url.pathname!=='/mcp'||(url.protocol!=='https:'&&!(options.allowLoopback===true&&url.protocol==='http:'&&['127.0.0.1','[::1]'].includes(url.hostname)))||!/^allura-[a-z0-9][a-z0-9-]{0,79}$/.test(options.groupId)||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(options.workspaceId)||typeof options.token!=='function'){throw new Error();}
   this.#timeout=options.timeoutMs??6000;if(!Number.isSafeInteger(this.#timeout)||this.#timeout<20||this.#timeout>10000){throw new Error();}
   url.searchParams.set('group_id',options.groupId);url.searchParams.set('workspace_id',options.workspaceId);this.#url=url;this.#token=options.token;
  }catch{throw new ConsumerError('invalid');}
 }
 async #fetch(input:string|URL|Request,init?:RequestInit):Promise<Response>{
  if(this.#closed){throw new ConsumerError('unknown');}if(activeFetches>=16){throw new ConsumerError('unavailable');}
  const target=new URL(input instanceof Request?input.url:String(input));if(target.href!==this.#url.href){throw new ConsumerError('invalid');}
  if(typeof init?.body==='string'&&Buffer.byteLength(init.body)>65536){throw new ConsumerError('invalid');}
  activeFetches++;const abort=new AbortController(),external=init?.signal;const cancel=()=>abort.abort();external?.addEventListener('abort',cancel,{once:true});if(external?.aborted){abort.abort();}
  let timer:ReturnType<typeof setTimeout>|undefined;
  const work=(async()=>{
   abort.signal.throwIfAborted();const token=await this.#token();abort.signal.throwIfAborted();if(typeof token!=='string'||!/^[-A-Za-z0-9._~+/=]{24,512}$/.test(token)){throw new ConsumerError('unauthenticated');}
   const headers=new Headers(init?.headers);headers.set('Authorization',`Bearer ${token}`);
   const response=await fetch(target,{...init,headers,signal:abort.signal,redirect:'error'});
   if(response.status===401||response.status===403){void response.body?.cancel();throw new ConsumerError(response.status===401?'unauthenticated':'forbidden');}
   if(response.status===429){void response.body?.cancel();throw new ConsumerError('unavailable');}
   const reader=response.body?.getReader(),chunks:Uint8Array[]=[];let size=0;
   if(reader){const stop=()=>{void reader.cancel().catch(()=>{});};abort.signal.addEventListener('abort',stop,{once:true});try{while(true){abort.signal.throwIfAborted();const part=await reader.read();if(part.done){break;}size+=part.value.byteLength;if(size>131072){stop();throw new ConsumerError('unknown');}chunks.push(part.value);}abort.signal.throwIfAborted();}finally{abort.signal.removeEventListener('abort',stop);reader.releaseLock();}}
   return new Response([202,204,304].includes(response.status)?null:Buffer.concat(chunks),{status:response.status,headers:response.headers});
  })().finally(()=>{activeFetches--;});
  const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{abort.abort();reject(new ConsumerError('unknown'));},this.#timeout);});
  try{return await Promise.race([work,deadline]);}catch(error){throw sanitized(error);}finally{clearTimeout(timer);external?.removeEventListener('abort',cancel);}
 }
 async connect(signal?:AbortSignal):Promise<void>{
  if(this.#closed||this.#ready){throw new ConsumerError('invalid');}
  const transport=new StreamableHTTPClientTransport(this.#url,{fetch:(input,init)=>this.#fetch(input,init),requestInit:{redirect:'error'},reconnectionOptions:{maxRetries:0,initialReconnectionDelay:1,maxReconnectionDelay:1,reconnectionDelayGrowFactor:1}});
  try{await this.#client.connect(transport,{timeout:this.#timeout+100,maxTotalTimeout:this.#timeout+100,...(signal?{signal}:{})});this.#ready=true;}catch(error){await this.close();throw sanitized(error);}
 }
 async invoke(name:MemoryTool,args:Record<string,unknown>,signal?:AbortSignal):Promise<CallToolResult>{
  if(!this.#ready||this.#closed||!['memory_add','memory_search','memory_get','memory_list','memory_delete'].includes(name)||!args||Array.isArray(args)){throw new ConsumerError('invalid');}
  try{const result=await this.#client.callTool({name,arguments:args},undefined,{timeout:this.#timeout+100,maxTotalTimeout:this.#timeout+100,...(signal?{signal}:{})}) as CallToolResult;
   if(result.isError){const first=result.content[0];let outcome:Outcome='unknown';if(first?.type==='text'){try{const parsed=JSON.parse(first.text) as {outcome:Outcome};if(outcomes.has(parsed.outcome)){outcome=parsed.outcome;}}catch{/* Do not surface arbitrary server text. */}}throw new ConsumerError(outcome);}
   if(result.structuredContent?.contract!==CONSUMER_CONTRACT){throw new ConsumerError('unknown');}return result;
  }catch(error){throw sanitized(error);}
 }
 async #data(name:MemoryTool,args:Record<string,unknown>,signal?:AbortSignal):Promise<Record<string,unknown>>{const result=await this.invoke(name,args,signal);const data=result.structuredContent?.data;if(!data||typeof data!=='object'||Array.isArray(data)){throw new ConsumerError('unknown');}return data as Record<string,unknown>;}
 add(input:AddInput,signal?:AbortSignal){return this.#data('memory_add',input,signal);}
 search(input:SearchInput,signal?:AbortSignal){return this.#data('memory_search',input,signal);}
 get(input:GetInput,signal?:AbortSignal){return this.#data('memory_get',input,signal);}
 list(input:ListInput={},signal?:AbortSignal){return this.#data('memory_list',input,signal);}
 delete(input:DeleteInput,signal?:AbortSignal){return this.#data('memory_delete',input,signal);}
 async close():Promise<void>{this.#closed=true;this.#ready=false;await this.#client.close();}
}
