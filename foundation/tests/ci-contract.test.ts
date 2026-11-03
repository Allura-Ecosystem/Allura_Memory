import {test,expect} from 'bun:test';
import {CI_LANES,UNIT_FILES,validateRevision,validateAttempt,summarizeTests,type AttemptIdentity,type LaneReceipt} from '../src/ci-contract.ts';
const identity:AttemptIdentity={sourceSha:'a'.repeat(40),lockSha256:'b'.repeat(64),invocation:'fixture-invocation',runId:'fixture-run',attempt:2,mode:'local'};
const receipts=():LaneReceipt[]=>CI_LANES.map(lane=>({...identity,lane,exit:0,logSha256:'c'.repeat(64),tests:lane==='unit'||lane==='database'?4:0,assertions:lane==='unit'||lane==='database'?12:0}));
test('CI rejects malformed or mismatched source and dirty checkouts',()=>{
 expect(()=>validateRevision(identity.sourceSha,identity.sourceSha,false)).not.toThrow();
 for(const source of ['beta','a'.repeat(39),'A'.repeat(40),'a'.repeat(40)+'\n']){expect(()=>validateRevision(source,identity.sourceSha,false)).toThrow();}
 expect(()=>validateRevision(identity.sourceSha,'d'.repeat(40),false)).toThrow();expect(()=>validateRevision(identity.sourceSha,identity.sourceSha,true)).toThrow();
});
test('CI accepts only complete same-source same-attempt successful nonzero lanes',()=>{
 expect(validateAttempt(identity,receipts())).toEqual({tests:8,assertions:24});
 for(const field of ['sourceSha','lockSha256','invocation','runId','mode','attempt'] as const){const rows=receipts();(rows[0] as unknown as Record<string,unknown>)[field]=field==='attempt'?1:'other';expect(()=>validateAttempt(identity,rows)).toThrow();}
 expect(()=>validateAttempt(identity,receipts().slice(1))).toThrow();expect(()=>validateAttempt(identity,[...receipts(),receipts()[0]!])).toThrow();
 for(const change of [{exit:1},{logSha256:''},{tests:0},{assertions:0}]){const rows=receipts();Object.assign(rows.find(r=>r.lane==='unit')!,change);expect(()=>validateAttempt(identity,rows)).toThrow();}
});
test('CI test summaries require exact unit discovery and reject failure skip duplicates and empty assertions',()=>{
 const rows=UNIT_FILES.map(requiredFile=>({requiredFile,pass:1,fail:0,skip:0,assertions:2,missingCases:[],runnerExit:0}));const log=(values:unknown[])=>values.map(r=>JSON.stringify(r)).join('\n');
 expect(summarizeTests('unit',log(rows))).toEqual({tests:UNIT_FILES.length,assertions:UNIT_FILES.length*2});
 for(const change of [{fail:1},{skip:1},{assertions:0},{pass:0},{missingCases:['lost']},{runnerExit:1}]){expect(()=>summarizeTests('unit',log([{...rows[0],...change},...rows.slice(1)]))).toThrow();}
 expect(()=>summarizeTests('unit',log(rows.slice(1)))).toThrow();expect(()=>summarizeTests('unit',log([...rows,rows[0]]))).toThrow();expect(()=>summarizeTests('unit','')) .toThrow();
 const db={lane:'restricted-postgres',pass:1,fail:0,skip:0,assertions:3,missing:[],exit:0};expect(summarizeTests('database',log([db]))).toEqual({tests:1,assertions:3});expect(()=>summarizeTests('database',log([db,db]))).toThrow();expect(()=>summarizeTests('database',log([{...db,missing:['case']}]))).toThrow();
});
