import {mkdtemp,mkdir,writeFile,readFile,appendFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {CI_LANES,validateRevision,validateAttempt,summarizeTests,type AttemptIdentity,type LaneReceipt,type CiLane} from '../src/ci-contract.ts';
const root=fileURLToPath(new URL('..',import.meta.url)),repository=fileURLToPath(new URL('../..',import.meta.url));
const hash=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
function git(args:string[]):string{const result=Bun.spawnSync(['git',...args],{cwd:repository,stdout:'pipe',stderr:'pipe',timeout:10000});if(result.exitCode!==0){throw new Error('CI source inspection failed');}return result.stdout.toString().trim();}
if(process.argv.length!==3){throw new Error('CI requires one explicit full source SHA');}
const expected=process.argv[2]!;validateRevision(expected,git(['rev-parse','HEAD']),!!git(['status','--porcelain']));
const outputParent=resolve(process.env.ALLURA_CI_OUTPUT??tmpdir());if(outputParent===resolve(repository)||outputParent.startsWith(resolve(repository)+'/')){throw new Error('CI output must be outside source');}
await mkdir(outputParent,{recursive:true});const output=await mkdtemp(join(outputParent,'allura-ci-')),invocation=randomUUID();
const github=process.env.GITHUB_ACTIONS==='true';if(github&&(process.env.GITHUB_SHA!==expected||!/^\d+$/.test(process.env.GITHUB_RUN_ID??'')||!/^\d+$/.test(process.env.GITHUB_RUN_ATTEMPT??''))){throw new Error('CI hosted identity mismatch');}
const identity:AttemptIdentity={sourceSha:expected,lockSha256:hash(await readFile(join(root,'bun.lock'))),invocation,runId:github?process.env.GITHUB_RUN_ID!:invocation,attempt:github?Number(process.env.GITHUB_RUN_ATTEMPT):1,mode:github?'github':'local'};
const commands:Record<CiLane,string[]>={install:['bun','run','install:frozen'],typecheck:['bun','run','typecheck'],lint:['bun','run','lint'],unit:['bun','run','test'],model:['bun','scripts/prepare-model.ts'],database:['bun','run','test:db']};
const receipts:LaneReceipt[]=[];let outcome:'failed'|'succeeded'='failed',counts:{tests:number;assertions:number}|undefined;
try{
 for(const lane of CI_LANES){
  const result=Bun.spawnSync(commands[lane],{cwd:root,stdout:'pipe',stderr:'pipe',timeout:600000});const raw=Buffer.concat([result.stdout,result.stderr]),logPath=join(output,lane+'.log');await writeFile(logPath,raw);
  let exit=result.exitCode,totals={tests:0,assertions:0};if(exit===0&&(lane==='unit'||lane==='database')){try{totals=summarizeTests(lane,raw.toString());}catch{exit=1;}}
  receipts.push({...identity,lane,exit,logSha256:hash(raw),...totals});console.log(JSON.stringify({lane,exit,...totals,logPath}));
  if(lane==='install'&&exit!==0){break;}
 }
 validateRevision(expected,git(['rev-parse','HEAD']),!!git(['status','--porcelain']));if(hash(await readFile(join(root,'bun.lock')))!==identity.lockSha256){throw new Error('CI lock changed');}
 counts=validateAttempt(identity,receipts);outcome='succeeded';
}finally{
 const manifest=join(output,'attempt.json');await writeFile(manifest,JSON.stringify({schema:'allura-ci-v1',...identity,outcome,counts,receipts},null,2));
 if(process.env.GITHUB_OUTPUT){await appendFile(process.env.GITHUB_OUTPUT,`artifact_path=${output}\n`);}
 console.log(JSON.stringify({outcome,manifest,...counts}));if(outcome!=='succeeded'){process.exitCode=1;}
}
