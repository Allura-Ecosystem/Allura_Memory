import { validScope } from './authority.ts';
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
