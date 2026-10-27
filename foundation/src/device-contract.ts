import { createHash } from 'node:crypto';
export const DEVICE_ACTIONS=Object.freeze(['memory:read','memory:capture','proposal:write','review:read'] as const);
export type DeviceAction=typeof DEVICE_ACTIONS[number];
export const DEVICE_LIMITS=Object.freeze({enrollmentSeconds:600,credentialSeconds:2592000,maxDevices:8,labelBytes:80});
export type DeviceCommand=
 | Readonly<{kind:'begin';label:string;challenge:string;actions:readonly DeviceAction[];operationKey:string}>
 | Readonly<{kind:'approve';enrollmentId:string;expectedRevision:number;actions:readonly DeviceAction[]}>
 | Readonly<{kind:'complete';enrollmentId:string;verifier:string;token:string}>
 | Readonly<{kind:'status';enrollmentId:string}>
 | Readonly<{kind:'rotate';deviceId:string;expectedGeneration:number;token:string;operationKey:string}>
 | Readonly<{kind:'revoke';deviceId:string;operationKey:string}>
 | Readonly<{kind:'list'}>;
function invalid():never{throw new Error('device_invalid');}
function requireValid(value:unknown):asserts value{if(!value){invalid();}}
function exact(value:Record<string,unknown>,keys:readonly string[]):void{requireValid(Object.keys(value).length===keys.length+1&&Object.keys(value).every(k=>k==='kind'||keys.includes(k)));}
function id(value:unknown):string{requireValid(typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value));return value;}
function version(value:unknown):number{requireValid(typeof value==='number'&&Number.isSafeInteger(value)&&value>0);return value;}
function key(value:unknown):string{requireValid(typeof value==='string'&&value.length>=1&&value.length<=128&&/^[A-Za-z0-9._:-]+$/.test(value));return value;}
function secret(value:unknown):string{requireValid(typeof value==='string'&&/^[A-Za-z0-9_-]{43}$/.test(value)&&Buffer.from(value,'base64url').toString('base64url')===value);return value;}
function actions(value:unknown):readonly DeviceAction[]{requireValid(Array.isArray(value)&&value.length>0&&value.length<=DEVICE_ACTIONS.length&&value.includes('memory:read')&&new Set(value).size===value.length&&value.every(v=>DEVICE_ACTIONS.includes(v)));return Object.freeze([...value]) as readonly DeviceAction[];}
export function deviceChallenge(verifier:unknown):string{return createHash('sha256').update(secret(verifier),'ascii').digest('base64url');}
export function parseDeviceCommand(value:unknown):DeviceCommand{
 requireValid(value!==null&&typeof value==='object'&&!Array.isArray(value));const v=value as Record<string,unknown>;
 switch(v.kind){
  case 'begin':{exact(v,['label','challenge','actions','operationKey']);requireValid(typeof v.label==='string'&&v.label.trim().length>0&&Buffer.byteLength(v.label,'utf8')<=DEVICE_LIMITS.labelBytes&&!/[\u0000-\u001f\u007f]/u.test(v.label));return Object.freeze({kind:v.kind,label:v.label,challenge:secret(v.challenge),actions:actions(v.actions),operationKey:key(v.operationKey)});}
  case 'approve':exact(v,['enrollmentId','expectedRevision','actions']);return Object.freeze({kind:v.kind,enrollmentId:id(v.enrollmentId),expectedRevision:version(v.expectedRevision),actions:actions(v.actions)});
  case 'complete':{exact(v,['enrollmentId','verifier','token']);const verifier=secret(v.verifier),token=secret(v.token);requireValid(verifier!==token);return Object.freeze({kind:v.kind,enrollmentId:id(v.enrollmentId),verifier,token});}
  case 'status':exact(v,['enrollmentId']);return Object.freeze({kind:v.kind,enrollmentId:id(v.enrollmentId)});
  case 'rotate':exact(v,['deviceId','expectedGeneration','token','operationKey']);return Object.freeze({kind:v.kind,deviceId:id(v.deviceId),expectedGeneration:version(v.expectedGeneration),token:secret(v.token),operationKey:key(v.operationKey)});
  case 'revoke':exact(v,['deviceId','operationKey']);return Object.freeze({kind:v.kind,deviceId:id(v.deviceId),operationKey:key(v.operationKey)});
  case 'list':exact(v,[]);return Object.freeze({kind:v.kind});
  default:return invalid();
 }
}
