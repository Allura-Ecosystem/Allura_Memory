import {test,expect,beforeAll,afterAll} from 'bun:test';
import {mkdtemp,writeFile,readFile,rm,stat,rename} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {randomBytes,createHash} from 'node:crypto';
import {SQL} from 'bun';
import {packCore} from '../scripts/pack-core.ts';
import {createRecoveryTarget,recoveryConnection,restartRecoveryTarget,closeRecoveryTarget,type RecoveryTarget} from '../src/recovery-target.ts';
import {fixture} from './lifecycle-fixture.ts';
import {AlluraClient} from '../src/consumer-client.ts';
import {submitProposal} from '../src/proposals.ts';
import {decideProposal} from '../src/decisions.ts';
let target:RecoveryTarget,directory:string,environment:Record<string,string>,f:Awaited<ReturnType<typeof fixture>>,child:ReturnType<typeof Bun.spawn>|undefined,endpoint:string,credential:string;
async function run(args:string[],env=environment){const p=Bun.spawn(args,{cwd:directory,env,stdout:'pipe',stderr:'pipe',timeout:180000});const [stdout,stderr,exit]=await Promise.all([new Response(p.stdout).text(),new Response(p.stderr).text(),p.exited]);if(exit){console.log(JSON.stringify({coreFailure:{command:args[0],exit,stderr:stderr.replaceAll(env.ALLURA_INIT_APP_PASSWORD??'SECRET_NOT_SET','[redacted]').replaceAll(env.ALLURA_DATABASE_URL??'SECRET_NOT_SET','[redacted]')}}));}return {stdout,stderr,exit};}
async function start(){
 const p=Bun.spawn([process.execPath,'src/core-server.ts','config.json'],{cwd:directory,env:environment,stdout:'pipe',stderr:'pipe'});child=p;const reader=p.stdout.getReader();let text='';const timeout=setTimeout(()=>p.kill(),35000);
 try{while(!text.includes('\n')){const next=await reader.read();if(next.done){throw new Error('Core did not report readiness');}text+=new TextDecoder().decode(next.value);if(text.length>4096){throw new Error('Core readiness overflow');}}const ready=JSON.parse(text.split('\n')[0]!);expect(ready.event).toBe('listening');expect(ready.host).toBe('127.0.0.1');endpoint=`http://127.0.0.1:${ready.port}/mcp`;return p;
 }finally{clearTimeout(timeout);reader.releaseLock();}
}
async function stop(){if(child){child.kill('SIGTERM');await child.exited;child=undefined;}}
beforeAll(async()=>{
 directory=await mkdtemp(join(tmpdir(),'allura-core-clean-'));const artifact=await packCore();expect(createHash('sha256').update(await readFile(artifact.tarball)).digest('hex')).toBe(artifact.sha256);
 expect(Bun.spawnSync(['tar','-xzf',artifact.tarball,'-C',directory],{stdout:'pipe',stderr:'pipe'}).exitCode).toBe(0);const node=Bun.spawnSync(['node','-p','process.execPath'],{stdout:'pipe',stderr:'pipe'});expect(node.exitCode).toBe(0);
 environment={PATH:[dirname(node.stdout.toString().trim()),dirname(process.execPath),process.env.PATH].join(':'),HOME:directory,TMPDIR:tmpdir(),BUN_INSTALL_CACHE_DIR:join(tmpdir(),'allura-core-dependency-cache')};
 expect((await run([process.execPath,'run','install:frozen'])).exit).toBe(0);expect((await run([process.execPath,'run','prepare:model'])).exit).toBe(0);
 target=await createRecoveryTarget();const password=randomBytes(32).toString('hex'),ownerUrl=await recoveryConnection(target);
 const initialized=await run([process.execPath,'run','init:empty'],{...environment,ALLURA_INIT_DATABASE_URL:ownerUrl,ALLURA_INIT_APP_PASSWORD:password});expect(initialized.exit).toBe(0);expect(initialized.stdout).toContain('initialized');expect(initialized.stderr).not.toContain(password);
 const owner=new SQL(ownerUrl);try{expect((await owner`SELECT count(*)::integer AS n FROM allura.events`)[0].n).toBe(0);expect((await owner`SELECT count(*)::integer AS n FROM allura.principals`)[0].n).toBe(0);}finally{await owner.close();}
 f=await fixture('allura-core-package',ownerUrl);credential=randomBytes(32).toString('base64url');await f.owner`INSERT INTO allura.machine_credentials(principal_id,digest,group_id,workspace_id,actions,expires_at) VALUES(${f.ids.machine}::uuid,decode(${createHash('sha256').update(credential).digest('hex')},'hex'),${f.scope.groupId},${f.scope.workspaceId}::uuid,ARRAY['memory:read','memory:capture'],clock_timestamp()+interval '1 hour')`;
 environment.ALLURA_DATABASE_URL=f.appUrl;environment.ALLURA_CURSOR_KEY=randomBytes(32).toString('base64url');await writeFile(join(directory,'config.json'),JSON.stringify({origin:'https://core.invalid',issuer:f.humanConfig.issuer,audience:f.humanConfig.audience,port:0,keys:[{kid:'key',pem:f.humanConfig.keys.get('key')!.export({type:'spki',format:'pem'}).toString()}]}));
 console.log(JSON.stringify({coreArtifact:artifact,cleanInstall:true,publicModelPrepared:true}));
},240000);
afterAll(async()=>{await stop();await f?.app.close();await f?.owner.close();if(target){await closeRecoveryTarget(target);}if(directory){await rm(directory,{recursive:true,force:true});}},60000);
test('clean packed core initializes without seed knowledge and survives real server and database restarts',async()=>{
 await start();const options=()=>({endpoint,groupId:f.scope.groupId,workspaceId:f.scope.workspaceId,token:async()=>credential,allowLoopback:true});const a=new AlluraClient(options());await a.connect();const receipt=await a.add({content:'Packaged orchid system observation',idempotency_key:'core-restart'});await a.close();
 const proposal=await submitProposal(f.app,f.identities.machine,f.scope,{summary:'Approved orchid system knowledge',assertionKind:'observation',evidenceIds:[String(receipt.event_id)]});const approved=JSON.parse(await decideProposal(f.app,f.identities.reviewer,f.scope,{proposalId:proposal.id,reviewedProposalVersion:1,decision:'approve',rationale:'Independent fixture decision',evidenceIds:[receipt.event_id],operationKey:'core-approve'}));
 await stop();await f.close();await restartRecoveryTarget(target);const ownerUrl=await recoveryConnection(target),appUrl=new URL(f.appUrl);appUrl.port=new URL(ownerUrl).port;environment.ALLURA_DATABASE_URL=appUrl.href;f.owner=new SQL(ownerUrl);f.app=new SQL(appUrl.href);await start();
 const b=new AlluraClient(options());try{await b.connect();expect(await b.get({kind:'receipt',id:String(receipt.receipt_id)})).toEqual(receipt);expect((await b.get({id:approved.semantic_version_id})).content).toBe('Approved orchid system knowledge');await f.owner`UPDATE allura.workspace_grants SET active=false WHERE group_id=${f.scope.groupId} AND principal_id=${f.ids.machine}::uuid`;await expect(b.list()).rejects.toThrow('forbidden');}finally{await b.close();}
 await stop();
},60000);
test('packed core refuses occupied initialization elevated runtime roles and missing offline model',async()=>{
 const count=Number((await f.owner`SELECT count(*) AS n FROM allura.events`)[0].n),ownerUrl=await recoveryConnection(target),password=randomBytes(32).toString('hex');
 const denied=await run([process.execPath,'run','init:empty'],{...environment,ALLURA_INIT_DATABASE_URL:ownerUrl,ALLURA_INIT_APP_PASSWORD:password});expect(denied.exit).toBe(1);expect(denied.stderr).not.toContain(password);expect(Number((await f.owner`SELECT count(*) AS n FROM allura.events`)[0].n)).toBe(count);
 await f.owner.unsafe('ALTER ROLE allura_app BYPASSRLS');try{const elevated=await run([process.execPath,'src/core-server.ts','config.json']);expect(elevated.exit).toBe(1);expect(elevated.stdout).not.toContain('listening');}finally{await f.owner.unsafe('ALTER ROLE allura_app NOBYPASSRLS');}
 const model=join(directory,'node_modules/.cache/allura-models');await rename(model,model+'-held');try{const missing=await run([process.execPath,'src/core-server.ts','config.json']);expect(missing.exit).toBe(1);expect(missing.stdout).not.toContain('listening');await expect(stat(model)).rejects.toThrow();}finally{await rename(model+'-held',model);}
},60000);
test('packed recovery backs up and restores without a source checkout or git provenance fallback',async()=>{
 const context=Bun.spawnSync(['docker','context','inspect','--format','{{.Endpoints.docker.Host}}'],{stdout:'pipe',stderr:'pipe'});expect(context.exitCode).toBe(0);const dockerHost=process.env.DOCKER_HOST??context.stdout.toString().trim();expect(dockerHost.startsWith('unix:///')).toBe(true);
 const result=await run([process.execPath,'--eval',`
  import {SQL} from 'bun';import {mkdtemp,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
  import {createRecoveryTarget,recoveryConnection,closeRecoveryTarget} from './src/recovery-target.ts';import {backupRecovery,restoreRecovery} from './src/recovery.ts';import {migrate} from './src/persistence.ts';
  const targets=[],connections=[],output=await mkdtemp(join(tmpdir(),'allura-packed-backup-'));
  try{
   const source=await createRecoveryTarget();targets.push(source);const owner=new SQL(await recoveryConnection(source));connections.push(owner);await migrate(owner);await owner.unsafe("CREATE TABLE public.package_witness(value text); INSERT INTO public.package_witness VALUES ('packed archive selected exactly')");
   const manifestPath=await backupRecovery(source,output),manifest=JSON.parse(await readFile(manifestPath,'utf8')),release=JSON.parse(await readFile('./release.json','utf8'));
   if(manifest.source.head!==release.sourceHead||manifest.source.dirty!==release.sourceDirty||manifest.source.inputs['bun.lock']!==release.inputs['bun.lock']){throw new Error('wrong_release_provenance');}
   const destination=await createRecoveryTarget();targets.push(destination);await restoreRecovery(destination,manifestPath);const restored=new SQL(await recoveryConnection(destination));connections.push(restored);const [row]=await restored.unsafe('SELECT value FROM public.package_witness');
   console.log(JSON.stringify({marker:row.value,migrations:manifest.migrations.length,releaseProvenance:true}));
  }finally{for(const connection of connections){await connection.close();}for(const target of targets.reverse()){await closeRecoveryTarget(target);}await rm(output,{recursive:true,force:true});}
 `],{PATH:environment.PATH!,HOME:directory,TMPDIR:tmpdir(),DOCKER_HOST:dockerHost});expect(result.exit).toBe(0);expect(JSON.parse(result.stdout)).toEqual({marker:'packed archive selected exactly',migrations:12,releaseProvenance:true});
},120000);
test('packed core refuses tampered source before database work and never prints injected credentials',async()=>{
 const path=join(directory,'src/core-api.ts');expect((await stat(path)).isSymbolicLink()).toBe(false);await writeFile(path,(await readFile(path,'utf8'))+'\n// deliberate integrity fault\n');const denied=await run([process.execPath,'src/core-server.ts','config.json']);expect(denied.exit).toBe(1);expect(denied.stdout).not.toContain('listening');expect(denied.stderr).not.toContain(environment.ALLURA_DATABASE_URL!);expect(denied.stderr).not.toContain(environment.ALLURA_CURSOR_KEY!);
});
