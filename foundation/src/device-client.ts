import {randomBytes,randomUUID} from 'node:crypto';
import {LinuxDeviceSecretStore,type DeviceStoreScope} from './device-secret-store.js';
import {deviceChallenge,parseDeviceCommand,type DeviceAction,type DeviceCommand} from './device-contract.js';
import {AlluraClient,ConsumerError} from './consumer-client.js';
export type DeviceOptions=DeviceStoreScope&Readonly<{humanOrigin?:string;allowLoopback?:boolean}>;
type Pending={v:1;phase:'pending';command:DeviceCommand;verifier?:string;token?:string};
type Active={v:1;phase:'active';deviceId:string;generation:number;token:string;expiresAt:string};
type State=Pending|Active;
const id=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const secret=(value:unknown):value is string=>typeof value==='string'&&/^[A-Za-z0-9_-]{43}$/.test(value)&&Buffer.from(value,'base64url').toString('base64url')===value;
const version=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>0;
export class PersistentDevice{
 readonly #store:LinuxDeviceSecretStore;readonly #options:DeviceOptions;readonly #url:URL;readonly #origin:string;
 constructor(options:DeviceOptions,environment:NodeJS.ProcessEnv=process.env){
  this.#options=Object.freeze({...options});this.#store=new LinuxDeviceSecretStore(options,environment,options.allowLoopback);
  try{const endpoint=new URL(options.endpoint),origin=new URL(options.humanOrigin??endpoint.origin);if(origin.origin!==options.humanOrigin&&options.humanOrigin!==undefined||origin.protocol!=='https:'||origin.username||origin.password||origin.search||origin.hash||origin.origin!==endpoint.origin&&!(options.allowLoopback===true&&endpoint.protocol==='http:')){throw new Error();}this.#origin=origin.origin;this.#url=new URL('/api/devices/command',endpoint);this.#url.searchParams.set('group_id',options.groupId);this.#url.searchParams.set('workspace_id',options.workspaceId);}catch{throw new ConsumerError('invalid');}
 }
 async #load():Promise<State|null>{
  const text=await this.#store.read();if(text===null){return null;}
  try{const value=JSON.parse(text) as State;if(!value||value.v!==1){throw new Error();}
   if(value.phase==='active'){if(!id(value.deviceId)||!version(value.generation)||!secret(value.token)||typeof value.expiresAt!=='string'||!Number.isFinite(Date.parse(value.expiresAt))){throw new Error();}}
   else if(value.phase==='pending'){const command=parseDeviceCommand(value.command);if(!['begin','complete','rotate','revoke'].includes(command.kind)){throw new Error();}if(command.kind==='begin'&&(!secret(value.verifier)||!secret(value.token)||value.verifier===value.token||deviceChallenge(value.verifier)!==command.challenge)){throw new Error();}}
   else{throw new Error();}return value;
  }catch{throw new ConsumerError('invalid');}
 }
 async #save(state:State):Promise<void>{await this.#store.write(JSON.stringify(state));}
 async #post(command:DeviceCommand,humanAssertion:string):Promise<Record<string,unknown>>{
  if(typeof humanAssertion!=='string'||humanAssertion.length>16384||!/^[-A-Za-z0-9_]+\.[-A-Za-z0-9_]+\.[-A-Za-z0-9_]+$/.test(humanAssertion)){throw new ConsumerError('unauthenticated');}
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),6000);
  try{
   const response=await fetch(this.#url,{method:'POST',redirect:'error',signal:controller.signal,headers:{'Content-Type':'application/json',Origin:this.#origin,'Sec-Fetch-Site':'same-origin','Cf-Access-Jwt-Assertion':humanAssertion},body:JSON.stringify(command)});
   if(response.status!==200){void response.body?.cancel();throw new ConsumerError(response.status===401?'unauthenticated':response.status===403?'forbidden':response.status===409?'conflict':response.status===404?'not_found':response.status===400?'invalid':'unknown');}
   const reader=response.body?.getReader();if(!reader){throw new ConsumerError('unknown');}const chunks:Uint8Array[]=[];let size=0;
   try{while(true){const part=await reader.read();if(part.done){break;}size+=part.value.byteLength;if(size>16384){await reader.cancel();throw new ConsumerError('unknown');}chunks.push(part.value);}}finally{reader.releaseLock();}
   const data:unknown=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!data||typeof data!=='object'||Array.isArray(data)){throw new ConsumerError('unknown');}return data as Record<string,unknown>;
  }catch(error){throw error instanceof ConsumerError?error:new ConsumerError('unknown');}finally{clearTimeout(timer);}
 }
 async #resume(human:string):Promise<Record<string,unknown>>{
  const state=await this.#load();if(!state||state.phase!=='pending'){throw new ConsumerError('conflict');}const command=state.command,result=await this.#post(command,human);
  if(command.kind==='begin'){
   if(result.outcome!=='pending'||!id(result.enrollmentId)||result.revision!==1){throw new ConsumerError('unknown');}
   await this.#save({v:1,phase:'pending',command:parseDeviceCommand({kind:'complete',enrollmentId:result.enrollmentId,verifier:state.verifier,token:state.token})});return {outcome:'pending',enrollmentId:result.enrollmentId,revision:1};
  }
  if(command.kind==='complete'||command.kind==='rotate'){
   if(result.outcome!==(command.kind==='complete'?'issued':'rotated')||!id(result.deviceId)||!version(result.generation)||result.generation!==(command.kind==='complete'?1:command.expectedGeneration+1)||typeof result.expiresAt!=='string'||!Number.isFinite(Date.parse(result.expiresAt))||command.kind==='complete'&&result.enrollmentId!==command.enrollmentId||command.kind==='rotate'&&result.deviceId!==command.deviceId){throw new ConsumerError('unknown');}
   await this.#save({v:1,phase:'active',deviceId:result.deviceId,generation:result.generation,token:command.token,expiresAt:result.expiresAt});return {outcome:result.outcome,deviceId:result.deviceId,generation:result.generation,expiresAt:result.expiresAt};
  }
  if(command.kind==='revoke'&&result.outcome==='revoked'&&result.deviceId===command.deviceId){await this.#store.clear();return {outcome:'revoked',deviceId:command.deviceId};}throw new ConsumerError('unknown');
 }
 async begin(label:string,actions:readonly DeviceAction[],human:string):Promise<Record<string,unknown>>{
  return this.#store.exclusive(async()=>{if(await this.#load()){throw new ConsumerError('conflict');}const verifier=randomBytes(32).toString('base64url'),token=randomBytes(32).toString('base64url');let command:DeviceCommand;try{command=parseDeviceCommand({kind:'begin',label,actions,challenge:deviceChallenge(verifier),operationKey:randomUUID()});}catch{throw new ConsumerError('invalid');}await this.#save({v:1,phase:'pending',command,verifier,token});return this.#resume(human);});
 }
 async resume(human:string):Promise<Record<string,unknown>>{return this.#store.exclusive(()=>this.#resume(human));}
 async rotate(human:string):Promise<Record<string,unknown>>{return this.#store.exclusive(async()=>{const state=await this.#load();if(!state||state.phase!=='active'){throw new ConsumerError('conflict');}await this.#save({v:1,phase:'pending',command:{kind:'rotate',deviceId:state.deviceId,expectedGeneration:state.generation,token:randomBytes(32).toString('base64url'),operationKey:randomUUID()}});return this.#resume(human);});}
 async revoke(human:string):Promise<Record<string,unknown>>{return this.#store.exclusive(async()=>{const state=await this.#load();if(!state||state.phase!=='active'){throw new ConsumerError('conflict');}await this.#save({v:1,phase:'pending',command:{kind:'revoke',deviceId:state.deviceId,operationKey:randomUUID()}});return this.#resume(human);});}
 async connect():Promise<AlluraClient>{
  // Secret Service item replacement is atomic. Reads do not compete with each
  // other for the mutation lock; the server always rejects stale generations.
  const client=new AlluraClient({...this.#options,terminalDenial:true,token:async()=>{const state=await this.#load();if(!state||state.phase!=='active'||Date.parse(state.expiresAt)<=Date.now()){throw new ConsumerError('unauthenticated');}return state.token;}});
  try{await client.connect();return client;}catch(error){await client.close();throw error instanceof ConsumerError?error:new ConsumerError('unknown');}
 }
}
