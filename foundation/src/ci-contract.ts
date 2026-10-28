export const CI_LANES=['install','typecheck','lint','unit','model','database'] as const;
export type CiLane=typeof CI_LANES[number];
export const UNIT_FILES=['./tests/projection-contract.test.ts','./tests/bumblebee-contract.test.ts','./tests/dashboard-graph.test.ts','./tests/transform-text.test.ts','./tests/authority.test.ts','./tests/gateway.test.ts','./tests/retrieval-policy.test.ts','./tests/work-budget.test.ts','./tests/consumer-client.test.ts','./tests/ci-contract.test.ts','./tests/core-config.test.ts','./tests/recovery-readiness.test.ts','./tests/device-contract.test.ts','./tests/device-secret-store.test.ts','./tests/dashboard-contract.test.ts','./tests/dashboard-transport.test.ts','./tests/dashboard-view.test.ts'] as const;
export type AttemptIdentity={sourceSha:string;lockSha256:string;invocation:string;runId:string;attempt:number;mode:'local'|'github'};
export type LaneReceipt=AttemptIdentity&{lane:CiLane;exit:number;logSha256:string;tests:number;assertions:number};
const digest=(value:unknown,length:number)=>typeof value==='string'&&value.length===length&&/^[a-f0-9]+$/.test(value);
const token=(value:unknown)=>typeof value==='string'&&value.length>0&&value.length<=128&&!/[^A-Za-z0-9._:-]/.test(value);
function requireValid(condition:unknown):asserts condition{if(!condition){throw new Error('CI evidence invalid');}}
export function validateRevision(expected:string,actual:string,dirty:boolean):void{requireValid(digest(expected,40)&&expected===actual&&!dirty);}
export function validateAttempt(expected:AttemptIdentity,receipts:LaneReceipt[]):{tests:number;assertions:number}{
 requireValid(digest(expected.sourceSha,40)&&digest(expected.lockSha256,64)&&token(expected.invocation)&&token(expected.runId)&&Number.isSafeInteger(expected.attempt)&&expected.attempt>=1&&['local','github'].includes(expected.mode));
 requireValid(receipts.length===CI_LANES.length);const seen=new Set<string>();let tests=0,assertions=0;
 for(const row of receipts){
  requireValid(CI_LANES.includes(row.lane)&&!seen.has(row.lane));seen.add(row.lane);
  for(const key of ['sourceSha','lockSha256','invocation','runId','attempt','mode'] as const){requireValid(row[key]===expected[key]);}
  requireValid(row.exit===0&&digest(row.logSha256,64)&&Number.isSafeInteger(row.tests)&&Number.isSafeInteger(row.assertions)&&row.tests>=0&&row.assertions>=0);
  requireValid(row.lane==='unit'||row.lane==='database'?row.tests>0&&row.assertions>0:row.tests===0&&row.assertions===0);tests+=row.tests;assertions+=row.assertions;
 }
 return {tests,assertions};
}
export function summarizeTests(lane:'unit'|'database',log:string):{tests:number;assertions:number}{
 const rows:Record<string,unknown>[]=[];
 for(const line of log.split('\n')){if(!line.startsWith('{')){continue;}try{const value:unknown=JSON.parse(line);if(value&&typeof value==='object'&&!Array.isArray(value)){const row=value as Record<string,unknown>;if(lane==='unit'?Object.hasOwn(row,'requiredFile'):row.lane==='restricted-postgres'){rows.push(row);}}}catch{/* Unrelated diagnostic lines are not receipts. */}}
 const required:readonly string[]=lane==='unit'?UNIT_FILES:['restricted-postgres'];requireValid(rows.length===required.length);const seen=new Set<string>();let tests=0,assertions=0;
 for(const row of rows){const name=lane==='unit'?row.requiredFile:row.lane,missing=lane==='unit'?row.missingCases:row.missing,exit=lane==='unit'?row.runnerExit:row.exit;
  requireValid(typeof name==='string'&&required.includes(name)&&!seen.has(name));seen.add(name);
  requireValid(exit===0&&row.fail===0&&row.skip===0&&Array.isArray(missing)&&missing.length===0&&typeof row.pass==='number'&&Number.isSafeInteger(row.pass)&&row.pass>0&&typeof row.assertions==='number'&&Number.isSafeInteger(row.assertions)&&row.assertions>0);tests+=row.pass;assertions+=row.assertions;
 }
 return {tests,assertions};
}
