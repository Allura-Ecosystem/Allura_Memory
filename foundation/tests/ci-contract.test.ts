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
test('CI database aggregation ignores preflights and batch diagnostics and requires one final native aggregate', () => {
 const log = (rows: unknown[]) => rows.map(row => JSON.stringify(row)).join('\n');
 const batches = [{ lane: 'restricted-postgres-batch', batch: 1, pass: 86, fail: 0, skip: 0, assertions: 100, missing: [], exit: 0 }, { lane: 'restricted-postgres-batch', batch: 2, pass: 235, fail: 0, skip: 0, assertions: 200, missing: [], exit: 0 }, { lane: 'restricted-postgres-batch', batch: 3, pass: 48, fail: 0, skip: 0, assertions: 100, missing: [], exit: 0 }];
 const preflight = { lane: 'run-inspection', pass: 10, fail: 0, skip: 0, assertions: 99, missing: [], exit: 0 };
 const aggregate = { lane: 'restricted-postgres', pass: 369, fail: 0, skip: 0, assertions: 400, missing: [], exit: 0 };
 expect(summarizeTests('database', log([...batches, aggregate]))).toEqual({tests: 369, assertions: 400});
 expect(summarizeTests('database', log([preflight, ...batches, aggregate]))).toEqual({tests: 369, assertions: 400});
 for (const rows of [[preflight, ...batches], [batches[0]], [...batches, aggregate, aggregate], [...batches, {...aggregate, exit: 1}], [...batches, {...aggregate, fail: 1}], [...batches, {...aggregate, skip: 1}], [...batches, {...aggregate, assertions: 0}], [...batches, {...aggregate, pass: 0}], [...batches, {...aggregate, missing: ['case']}], [...batches, {...aggregate, pass: 1.5}]]) {
  expect(() => summarizeTests('database', log(rows))).toThrow();
 }
});

test('CI schedules model preparation before offline inference lanes',()=>{
 expect(CI_LANES.indexOf('install')).toBeLessThan(CI_LANES.indexOf('model'));
 for(const lane of ['unit','database'] as const){expect(CI_LANES.indexOf('model')).toBeLessThan(CI_LANES.indexOf(lane));}
});
test('CI strict runner includes embedding and agent drain suites with named cases and assertion floors',async()=>{
 const runner=await Bun.file(new URL('../scripts/test.ts',import.meta.url)).text();
 const manifest=[...runner.matchAll(/requiredFile:\s*'([^']+)'/g)].map(match=>match[1]);
 expect(manifest).toEqual([...UNIT_FILES]);
 for(const file of ['./tests/core-release-integrity.test.ts','./tests/run-contract.test.ts','./tests/test-runner.test.ts','./tests/selected-consent-transport.test.ts','./tests/openai-embedding.test.ts','./tests/embedding-identity.test.ts','./tests/agent-index-drain.test.ts']){
  expect(UNIT_FILES as readonly string[]).toContain(file);
  const section=runner.slice(runner.indexOf("requiredFile:'"+file+"'" )).split('requiredFile:')[1]??'';
  expect(section).toMatch(/minAssertions:\s*[1-9]\d*/);
  const source=await Bun.file(new URL('../'+file,import.meta.url)).text();
  for(const match of source.matchAll(/^test\('([^']+)'/gm)){expect(section).toContain("'"+match[1]+"'");}
  const rows=UNIT_FILES.map(requiredFile=>({requiredFile,pass:1,fail:0,skip:0,assertions:2,missingCases:[],runnerExit:0}));
  expect(()=>summarizeTests('unit',rows.filter(row=>row.requiredFile!==file).map(row=>JSON.stringify(row)).join('\n'))).toThrow();
 }
});
test('CI test summaries require exact unit discovery and reject failure skip duplicates and empty assertions',()=>{
 expect(UNIT_FILES).toContain('./tests/machine-only.test.ts');
 const rows=UNIT_FILES.map(requiredFile=>({requiredFile,pass:1,fail:0,skip:0,assertions:2,missingCases:[],runnerExit:0}));const log=(values:unknown[])=>values.map(r=>JSON.stringify(r)).join('\n');
 expect(summarizeTests('unit',log(rows))).toEqual({tests:UNIT_FILES.length,assertions:UNIT_FILES.length*2});
 for(const change of [{fail:1},{skip:1},{assertions:0},{pass:0},{missingCases:['lost']},{runnerExit:1}]){expect(()=>summarizeTests('unit',log([{...rows[0],...change},...rows.slice(1)]))).toThrow();}
 expect(()=>summarizeTests('unit',log(rows.slice(1)))).toThrow();expect(()=>summarizeTests('unit',log([...rows,rows[0]]))).toThrow();expect(()=>summarizeTests('unit','')) .toThrow();
 const db={lane:'restricted-postgres',pass:1,fail:0,skip:0,assertions:3,missing:[],exit:0};expect(summarizeTests('database',log([db]))).toEqual({tests:1,assertions:3});expect(()=>summarizeTests('database',log([db,db]))).toThrow();expect(()=>summarizeTests('database',log([{...db,missing:['case']}]))).toThrow();
});
