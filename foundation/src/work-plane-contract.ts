import { validScope } from './authority.ts';
import {createHash,createHmac,timingSafeEqual} from 'node:crypto';

export type WorkList={group_id:string;workspace_id:string;project_id:string;status:WorkStatus|null;lane_id:string|null;limit:number;cursor:string|null};
export function parseWorkList(raw:string):WorkList {
 const invalid=():never=>{throw new WorkPlaneError('invalid');};
 if(typeof raw!=='string'||raw.length>2048){return invalid();}
 // Validate every encoded component before URLSearchParams can replace invalid
 // UTF8. Form-query '+' means space; literal plus must arrive as %2B.
 try{for(const pair of raw.replace(/^\?/, '').split('&')){for(const part of pair.split('=')){decodeURIComponent(part.replaceAll('+',' '));}}}catch{return invalid();}
 const query=new URLSearchParams(raw),values:Record<string,string>=Object.create(null);
 for(const [k,v] of query){if(!['group_id','workspace_id','project_id','status','lane_id','limit','cursor'].includes(k)||Object.hasOwn(values,k)||!workText(v,k==='cursor'?1024:256)){return invalid();}values[k]=v;}
 if(!values.group_id||!values.workspace_id||!validScope({groupId:values.group_id,workspaceId:values.workspace_id})||!values.project_id){return invalid();}
 if(values.status!==undefined&&!Object.hasOwn(workGraph,values.status)){return invalid();}
 if(values.limit!==undefined&&!/^(?:[1-9]|[1-9][0-9]|100)$/.test(values.limit)){return invalid();}
 return Object.freeze({group_id:values.group_id,workspace_id:values.workspace_id,project_id:values.project_id,status:(values.status??null) as WorkStatus|null,lane_id:values.lane_id??null,limit:values.limit===undefined?100:Number(values.limit),cursor:values.cursor??null});
}
const cursorDomain='allura-work-list-cursor-v1';
export function workListBinding(v:WorkList,principal:string,mapping:string):string {
 return createHash('sha256').update(JSON.stringify([workContract,principal,v.group_id,v.workspace_id,v.project_id,mapping,v.status,v.lane_id,v.limit])).digest('base64url');
}
type WorkPosition={created_at:string;id:string};
export function signWorkListCursor(key:Uint8Array,binding:string,last:WorkPosition,now=Date.now()):string {
 if(!workToken(last.created_at)||!workText(last.id,256)||!Number.isSafeInteger(now)||now<0||!Number.isSafeInteger(now+900000)){throw new WorkPlaneError('invalid');}
 const payload=Buffer.from(JSON.stringify({b:binding,t:now,c:last.created_at,i:last.id})).toString('base64url');
 return payload+'.'+createHmac('sha256',key).update(cursorDomain+'\0'+payload).digest('base64url');
}
export function readWorkListCursor(token:string,key:Uint8Array,binding:string,now=Date.now()):WorkPosition {
 const invalid=():never=>{throw new WorkPlaneError('invalid');};
 if(typeof token!=='string'||token.length>1024||!Number.isSafeInteger(now)||!/^[-_A-Za-z0-9]+\.[-_A-Za-z0-9]{43}$/.test(token)){return invalid();}
 const [payload,mac]=token.split('.') as [string,string];
 const decoded=Buffer.from(payload,'base64url'),signature=Buffer.from(mac,'base64url');
 if(decoded.toString('base64url')!==payload||signature.toString('base64url')!==mac||signature.length!==32||!timingSafeEqual(signature,createHmac('sha256',key).update(cursorDomain+'\0'+payload).digest())){return invalid();}
 let v:Record<string,unknown>;
 try{v=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(decoded));}catch{return invalid();}
 if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).sort().join(',')!=='b,c,i,t'||v.b!==binding||typeof v.t!=='number'||!Number.isSafeInteger(v.t)||v.t<0||v.t>now||now-v.t>=900000||!workToken(v.c)||!workText(v.i,256)){return invalid();}
 // Canonical encoding also rejects duplicate JSON fields and spelling aliases.
 if(JSON.stringify({b:v.b,t:v.t,c:v.c,i:v.i})!==decoded.toString('utf8')){return invalid();}
 return {created_at:v.c,id:v.i};
}
export const workContract = 'work-plane-compatibility-v1' as const;
export const workGraph = Object.freeze({backlog:['ready','cancelled'],ready:['in_progress','backlog','cancelled'],in_progress:['in_review','blocked','done','cancelled'],in_review:['in_progress','done','cancelled'],blocked:['in_progress','cancelled'],done:[],cancelled:[]} as const);
export type WorkStatus = keyof typeof workGraph;
export class WorkPlaneError extends Error {
  constructor(public readonly code: 'invalid'|'forbidden'|'not_found'|'conflict'|'failed'|'unknown'|'capacity') { super(code); this.name='WorkPlaneError'; }
}
export function workText(value: unknown, max: number, min=1): value is string {
  return typeof value==='string' && Buffer.from(value,'utf8').toString('utf8')===value && !/[\u0000-\u001f\u007f]/u.test(value) && Buffer.byteLength(value)>=min && Buffer.byteLength(value)<=max;
}
export function workToken(value: unknown): value is string {
  if(typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(value)){return false;}
  const y=Number(value.slice(0,4)),m=Number(value.slice(5,7)),d=Number(value.slice(8,10));
  const days=[31,y%4===0 && (y%100!==0 || y%400===0)?29:28,31,30,31,30,31,31,30,31,30,31];
  return y>=1 && m>=1 && m<=12 && d>=1 && d<=days[m-1]! && Number(value.slice(11,13))<24 && Number(value.slice(14,16))<60 && Number(value.slice(17,19))<60;
}
export type WorkJson = null|boolean|number|string|readonly WorkJson[]|{readonly [key:string]:WorkJson};
function createInvalid():never {throw new WorkPlaneError('invalid');}
function jsonString(v:string):boolean {return !v.includes('\0')&&Buffer.from(v).toString('utf8')===v;}
// Decimal tuples compare exact JSON lexemes without business-number arithmetic.
export function workNumberLexeme(raw:string):number {
 const tuple=(s:string)=>{
  const m=/^(-?)(0|[1-9][0-9]*)(?:\.([0-9]+))?(?:[eE]([+-]?[0-9]+))?$/.exec(s);if(!m){return createInvalid();}
  const exp=Number(m[4]??0);if(!Number.isSafeInteger(exp)||Math.abs(exp)>1000){return createInvalid();}
  const fraction=m[3]??'',digits=(m[2]!+fraction).replace(/^0+/,'');if(!digits){return '0';}
  const coefficient=digits.replace(/0+$/,'');return `${m[1]}${coefficient}e${exp-fraction.length+digits.length-coefficient.length}`;
 };
 const n=Number(raw);if(!Number.isFinite(n)||(Number.isInteger(n)&&!Number.isSafeInteger(n))||tuple(raw)!==tuple(JSON.stringify(n))){return createInvalid();}return Object.is(n,-0)?0:n;
}
function copyWorkJson(raw:unknown):WorkJson {
 const seen=new Set<object>();let nodes=0;
 const copy=(v:unknown,depth:number):WorkJson=>{
  if(++nodes>16384){return createInvalid();}
  if(v===null||typeof v==='boolean'){return v;}
  if(typeof v==='string'){if(!jsonString(v)){return createInvalid();}return v;}
  if(typeof v==='number'){if(!Number.isFinite(v)||(Number.isInteger(v)&&!Number.isSafeInteger(v))){return createInvalid();}return Object.is(v,-0)?0:v;}
  if(!v||typeof v!=='object'||depth>8||seen.has(v)){return createInvalid();}
  seen.add(v);const descriptors=Object.getOwnPropertyDescriptors(v),keys=Reflect.ownKeys(v);
  if(keys.some(k=>typeof k!=='string')||Object.values(descriptors).some(d=>!('value' in d))){return createInvalid();}
  let result:WorkJson;
  if(Array.isArray(v)){
   if(v.length>16384||keys.length!==v.length+1||keys.some(k=>k!=='length'&&(!/^(0|[1-9][0-9]*)$/.test(k as string)||Number(k)>=v.length))){return createInvalid();}
   result=Object.freeze(Array.from({length:v.length},(_,i)=>{const d=descriptors[String(i)];if(!d?.enumerable){return createInvalid();}return copy(d.value,depth+1);}));
  }else{
   if(![Object.prototype,null].includes(Object.getPrototypeOf(v))){return createInvalid();}
   const out:Record<string,WorkJson>=Object.create(null);
   for(const k of keys as string[]){if(!jsonString(k)||!descriptors[k]!.enumerable){return createInvalid();}out[k]=copy(descriptors[k]!.value,depth+1);}
   result=Object.freeze(out);
  }
  seen.delete(v);return result;
 };
 const result=copy(raw,1);if(Buffer.byteLength(JSON.stringify(result))>16384){return createInvalid();}return result;
}
export type WorkCreate = Readonly<{contract:typeof workContract;command:'create';group_id:string;workspace_id:string;actor_id:string;operation_key:string;project_id:string;title:string;description:string|null;priority:'critical'|'high'|'medium'|'low';owner_id:string|null;lane_id:string|null;acceptance_criteria:readonly WorkJson[]}>;
export function parseWorkCreate(value:unknown):WorkCreate {
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value))){return createInvalid();}
 const required=['contract','command','group_id','workspace_id','actor_id','operation_key','project_id','title'],optional=['description','priority','owner_id','lane_id','acceptance_criteria'],descriptors=Object.getOwnPropertyDescriptors(value);
 if(Reflect.ownKeys(value).some(k=>typeof k!=='string'||![...required,...optional].includes(k))||Object.values(descriptors).some(d=>!('value' in d)||!d.enumerable)||required.some(k=>!Object.hasOwn(descriptors,k))){return createInvalid();}
 const v=value as Record<string,unknown>;
 if(v.contract!==workContract||v.command!=='create'||typeof v.group_id!=='string'||typeof v.workspace_id!=='string'||!validScope({groupId:v.group_id,workspaceId:v.workspace_id})||typeof v.actor_id!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v.actor_id)||typeof v.operation_key!=='string'||! /^[A-Za-z0-9._:-]{1,128}$/.test(v.operation_key)||!workText(v.project_id,256)||!workText(v.title,512)){return createInvalid();}
 for(const k of ['description','owner_id','lane_id']){if(Object.hasOwn(v,k)&&v[k]!==null&&!workText(v[k],k==='description'?8192:256,k==='description'?0:1)){return createInvalid();}}
 if(Object.hasOwn(v,'priority')&&(typeof v.priority!=='string'||!['critical','high','medium','low'].includes(v.priority))){return createInvalid();}
 const criteria=Object.hasOwn(v,'acceptance_criteria')?v.acceptance_criteria:[];if(!Array.isArray(criteria)||criteria.length>32){return createInvalid();}
 return Object.freeze({contract:workContract,command:'create',group_id:v.group_id,workspace_id:v.workspace_id,actor_id:v.actor_id,operation_key:v.operation_key,project_id:v.project_id,title:v.title,description:(v.description??null) as string|null,priority:(v.priority??'medium') as WorkCreate['priority'],owner_id:(v.owner_id??null) as string|null,lane_id:(v.lane_id??null) as string|null,acceptance_criteria:copyWorkJson(criteria) as readonly WorkJson[]});
}
export type WorkTransition = {contract:typeof workContract;command:'transition';group_id:string;workspace_id:string;actor_id:string;operation_key:string;expected_updated_at:string;to_status:WorkStatus;reason:string|null;evidence_id:null};
// Service DTO, not a JSON/HTTP parser: raw strings (including duplicate-key JSON)
// are rejected. A later wire packet must preserve keys before constructing DTOs.
export function parseWorkTransition(value: unknown): WorkTransition {
  const fail=()=>{throw new WorkPlaneError('invalid');};
  if(!value || typeof value!=='object' || Array.isArray(value) || ![Object.prototype,null].includes(Object.getPrototypeOf(value))){return fail();}
  const keys=['contract','command','group_id','workspace_id','actor_id','operation_key','expected_updated_at','to_status','reason','evidence_id'];
  const descriptors=Object.getOwnPropertyDescriptors(value);
  if(Reflect.ownKeys(value).some(k=>typeof k!=='string' || !keys.includes(k)) || Object.values(descriptors).some(d=>!('value' in d))){return fail();}
  const v=value as Record<string,unknown>;
  if(v.contract!==workContract || v.command!=='transition' || typeof v.group_id!=='string' || typeof v.workspace_id!=='string' || !validScope({groupId:v.group_id,workspaceId:v.workspace_id}) || typeof v.actor_id!=='string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v.actor_id) || typeof v.operation_key!=='string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(v.operation_key) || !workToken(v.expected_updated_at) || typeof v.to_status!=='string' || !Object.hasOwn(workGraph,v.to_status)){return fail();}
  if(Object.hasOwn(v,'reason') && v.reason!==null && (typeof v.reason!=='string' || Buffer.from(v.reason,'utf8').toString('utf8')!==v.reason || v.reason.includes('\0') || Buffer.byteLength(v.reason)>2048)){return fail();}
  if(Object.hasOwn(v,'evidence_id') && v.evidence_id!==null){return fail();}
  return Object.freeze({contract:workContract,command:'transition',group_id:v.group_id,workspace_id:v.workspace_id,actor_id:v.actor_id,operation_key:v.operation_key,expected_updated_at:v.expected_updated_at,to_status:v.to_status as WorkStatus,reason:(v.reason??null) as string|null,evidence_id:null});
}
