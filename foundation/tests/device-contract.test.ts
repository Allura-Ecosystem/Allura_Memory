import { expect, test } from 'bun:test';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { DEVICE_ACTIONS, DEVICE_LIMITS, deviceChallenge, parseDeviceCommand } from '../src/device-contract.ts';
const secret=()=>randomBytes(32).toString('base64url');
const begin=()=>({kind:'begin',label:'My workstation',challenge:secret(),actions:['memory:read','memory:capture'],operationKey:'enroll:1'});
test('device commands preserve bounded typed immutable snapshots',()=>{
 const input=begin(),command=parseDeviceCommand(input);expect<unknown>(command).toEqual(input);expect(Object.isFrozen(command)).toBe(true);
 if(command.kind!=='begin'){throw new Error('wrong command');}expect(Object.isFrozen(command.actions)).toBe(true);input.actions.push('review:approve');expect(command.actions).toEqual(['memory:read','memory:capture']);
 const enrollmentId=randomUUID(),deviceId=randomUUID();
 for(const value of [{kind:'approve',enrollmentId,expectedRevision:1,actions:['memory:read']},{kind:'complete',enrollmentId,verifier:secret(),token:secret()},{kind:'status',enrollmentId},{kind:'rotate',deviceId,expectedGeneration:1,token:secret(),operationKey:'rotation-1'},{kind:'revoke',deviceId,operationKey:'revoke-1'},{kind:'list'}]){expect<unknown>(parseDeviceCommand(value)).toEqual(value);}
 expect(DEVICE_LIMITS).toEqual({enrollmentSeconds:600,credentialSeconds:2592000,maxDevices:8,labelBytes:80});expect(Object.isFrozen(DEVICE_LIMITS)).toBe(true);expect(Object.isFrozen(DEVICE_ACTIONS)).toBe(true);
});
test('device contract denies authority injection and privileged action ceilings',()=>{
 for(const input of [null,[],true,{}, {kind:'unknown'}, {...begin(),ownerId:randomUUID()}, {...begin(),role:'workspace_admin'}, {...begin(),expiresAt:9999999999}, {...begin(),groupId:'allura-forged'}, {...begin(),authMethod:'human'}, {kind:'list',token:secret()}, {kind:'status',enrollmentId:randomUUID(),actions:['memory:read']}]){expect(()=>parseDeviceCommand(input)).toThrow('device_invalid');}
 for(const actions of [[],['memory:capture'],['memory:read','memory:read'],['memory:read','review:approve'],['memory:read','workspace:grants:manage'],['memory:read','evidence:read'],['memory:read','memory:delete'],['memory:read','audit:read'],['memory:read','health:read'],['memory:read',null], 'memory:read']){expect(()=>parseDeviceCommand({...begin(),actions})).toThrow('device_invalid');}
 expect(parseDeviceCommand({...begin(),actions:[...DEVICE_ACTIONS]}).kind).toBe('begin');
});
test('device contract rejects malformed identifiers versions labels and keys',()=>{
 for(const enrollmentId of ['',null,123,'not-uuid','00000000-0000-0000-0000-000000000000']){expect(()=>parseDeviceCommand({kind:'status',enrollmentId})).toThrow('device_invalid');}
 for(const expectedGeneration of [0,-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,'1']){expect(()=>parseDeviceCommand({kind:'rotate',deviceId:randomUUID(),expectedGeneration,token:secret(),operationKey:'a'})).toThrow('device_invalid');}
 for(const expectedRevision of [0,-1,NaN,'1']){expect(()=>parseDeviceCommand({kind:'approve',enrollmentId:randomUUID(),expectedRevision,actions:['memory:read']})).toThrow('device_invalid');}
 for(const label of ['', ' '.repeat(2), 'a'.repeat(81),'é'.repeat(41),'line\nfeed','null\0byte','\u007f']){expect(()=>parseDeviceCommand({...begin(),label})).toThrow('device_invalid');}
 for(const operationKey of ['', 'a'.repeat(129),'not a key','a/../b','é','\n',null]){expect(()=>parseDeviceCommand({...begin(),operationKey})).toThrow('device_invalid');}
 expect(parseDeviceCommand({...begin(),label:'é'.repeat(40),operationKey:'a'.repeat(128)}).kind).toBe('begin');
});
test('device proofs require canonical independent 256 bit secrets without error disclosure',()=>{
 const verifier=secret();expect(deviceChallenge(verifier)).toBe(createHash('sha256').update(verifier,'ascii').digest('base64url'));
 const alias=Buffer.alloc(32).toString('base64url').slice(0,-1)+'B';
 for(const value of ['',null,123,'a'.repeat(42),'a'.repeat(44),verifier+'=',alias,'+'.repeat(43),'/'.repeat(43)]){
  expect(()=>deviceChallenge(value)).toThrow('device_invalid');expect(()=>parseDeviceCommand({...begin(),challenge:value})).toThrow('device_invalid');
  expect(()=>parseDeviceCommand({kind:'complete',enrollmentId:randomUUID(),verifier:value,token:secret()})).toThrow('device_invalid');
  expect(()=>parseDeviceCommand({kind:'rotate',deviceId:randomUUID(),expectedGeneration:1,token:value,operationKey:'a'})).toThrow('device_invalid');
 }
 expect(()=>parseDeviceCommand({kind:'complete',enrollmentId:randomUUID(),verifier,token:verifier})).toThrow('device_invalid');
 try{parseDeviceCommand({...begin(),token:verifier});}catch(error){expect(String(error)).not.toContain(verifier);expect(String(error)).toBe('Error: device_invalid');}
});
