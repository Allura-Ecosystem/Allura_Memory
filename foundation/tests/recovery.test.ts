import {test,expect,beforeAll,afterAll} from 'bun:test';
import {mkdtemp,readFile,writeFile,readdir,rm,chmod} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createRecoveryTarget,recoveryConnection,restartRecoveryTarget,closeRecoveryTarget,type RecoveryTarget} from '../src/recovery-target.ts';
import {backupRecovery,restoreRecovery} from '../src/recovery.ts';
import {SQL} from 'bun';
import {migrate,appendEvent} from '../src/persistence.ts';
import {fixture} from './lifecycle-fixture.ts';
import {capture,readCaptureReceipt} from '../src/capture.ts';
import {submitProposal} from '../src/proposals.ts';
import {decideProposal} from '../src/decisions.ts';
import {drainIndexBatch} from '../src/indexing.ts';
import {loadLocalEmbedder} from '../src/embedding.ts';
import {searchIndex} from '../src/retrieval-index.ts';
import {createCoreGateway} from '../src/core-api.ts';
import {randomBytes} from 'node:crypto';
let source:RecoveryTarget,first:RecoveryTarget,second:RecoveryTarget,root:string,f:Awaited<ReturnType<typeof fixture>>,one:string,two:string,event1:string,event2:string;
let captureReceipt:string,semanticId:string;
async function canonical(sql:SQL){const result:Record<string,string>={};for(const table of ['events','capture_receipts','semantic_versions','semantic_heads','decision_receipts','semantic_provenance','source_vectors','proposal_audit','operation_observations','read_audit']){result[table]=(await sql.unsafe(`SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb)::text AS data FROM allura.${table} t`))[0].data;}return result;}
beforeAll(async()=>{root=await mkdtemp(join(tmpdir(),'allura-recovery-evidence-'));source=await createRecoveryTarget();f=await fixture('allura-recovery',await recoveryConnection(source));},60000);
afterAll(async()=>{await f?.app.close();await f?.owner.close();for(const target of [second,first,source]){if(target){await closeRecoveryTarget(target);}}if(root){await rm(root,{recursive:true,force:true});}},60000);
test('recovery targets reject forged capabilities and preserve data through actual database restart',async()=>{
 await expect(recoveryConnection({id:source.id})).rejects.toThrow('recovery_target_denied');
 captureReceipt=await capture(f.app,f.identities.machine,f.scope,{content:'first recovery evidence',idempotency_key:'recovery-first'});event1=JSON.parse(captureReceipt).event_id;
 await f.close();await restartRecoveryTarget(source);const ownerUrl=await recoveryConnection(source),appUrl=new URL(f.appUrl);appUrl.port=new URL(ownerUrl).port;f.owner=new SQL(ownerUrl);f.app=new SQL(appUrl.href);expect((await f.owner`SELECT count(*)::integer AS n FROM allura.events WHERE id=${event1}::uuid`)[0].n).toBe(1);
},60000);
test('one streaming backup exceeds old buffer limits and two same-day manifests restore exact chosen evidence',async()=>{
 const proposal=await submitProposal(f.app,f.identities.machine,f.scope,{summary:'Approved violet recovery knowledge',assertionKind:'observation',evidenceIds:[event1]});semanticId=JSON.parse(await decideProposal(f.app,f.identities.reviewer,f.scope,{proposalId:proposal.id,reviewedProposalVersion:1,decision:'approve',rationale:'Independent recovery fixture approval',evidenceIds:[event1],operationKey:'recovery-approve'})).semantic_version_id;
 const provider=await loadLocalEmbedder();expect((await drainIndexBatch(f.app,f.identities.machine,f.scope,provider)).every(row=>row.state==='succeeded')).toBe(true);const firstState=await canonical(f.owner);
 // Random hexadecimal bytes resist repetition/compression; archive is explicitly uncompressed.
 await f.owner.unsafe('CREATE TABLE public.recovery_padding(payload text NOT NULL)');
 await f.owner.unsafe("INSERT INTO public.recovery_padding SELECT string_agg(md5(random()::text),'') FROM generate_series(1,400000)");
 one=await backupRecovery(source,root);const manifest=JSON.parse(await readFile(one,'utf8'));expect(manifest.archive.bytes).toBeGreaterThan(10*1024*1024);expect(manifest.migrations).toHaveLength(12);expect(manifest.embedding.dimensions).toBe(384);
 event2=await appendEvent(f.app,f.identities.machine!,f.scope,{content:'second recovery evidence'});const secondState=await canonical(f.owner);two=await backupRecovery(source,root);expect(two).not.toBe(one);
 first=await createRecoveryTarget();await restoreRecovery(first,one);const db1=new SQL(await recoveryConnection(first));try{expect(await canonical(db1)).toEqual(firstState);expect(await migrate(db1)).toBe('unchanged');expect((await db1`SELECT id FROM allura.events WHERE kind='capture' ORDER BY id`).map((r:{id:string})=>r.id)).toEqual([event1]);expect((await db1`SELECT length(payload) AS n FROM public.recovery_padding`)[0].n).toBe(12800000);}finally{await db1.close();}
 second=await createRecoveryTarget();await restoreRecovery(second,two);const db2=new SQL(await recoveryConnection(second));try{expect(await canonical(db2)).toEqual(secondState);expect((await db2`SELECT count(*)::integer AS n FROM allura.events WHERE kind='capture'`)[0].n).toBe(2);expect((await db2`SELECT count(*)::integer AS n FROM allura.events WHERE id=${event2}::uuid`)[0].n).toBe(1);
 const password=randomBytes(32).toString('hex');await db2.unsafe(`ALTER ROLE allura_app LOGIN PASSWORD '${password}'`);const url=new URL(await recoveryConnection(second));url.username='allura_app';url.password=password;const app=new SQL(url.href);let server:ReturnType<typeof Bun.serve>|undefined;
 try{const [role]=await app`SELECT current_user,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user`;expect(role).toMatchObject({current_user:'allura_app',rolsuper:false,rolbypassrls:false});expect(await readCaptureReceipt(app,f.identities.machine,f.scope,JSON.parse(captureReceipt).receipt_id)).toBe(captureReceipt);
 const found=await searchIndex(app,f.identities.machine,f.scope,{query:'violet recovery',mode:'vector',limit:10},provider);expect(found.used).toContain('vector');expect(found.results[0]?.id).toBe(semanticId);expect(found.degraded).toBe(false);
 server=Bun.serve({hostname:'127.0.0.1',port:0,fetch:createCoreGateway(app,f.humanConfig,'https://recovery.invalid',randomBytes(32),provider)});const endpoint=`http://127.0.0.1:${server.port}/api/memory/get?group_id=${f.scope.groupId}&workspace_id=${f.scope.workspaceId}`;
 const response=await fetch(endpoint,{method:'POST',headers:{'Cf-Access-Jwt-Assertion':f.jwt('viewer'),Origin:'https://recovery.invalid','Sec-Fetch-Site':'same-origin','content-type':'application/json'},body:JSON.stringify({id:semanticId})});expect(response.status).toBe(200);expect((await response.json() as {id:string}).id).toBe(semanticId);
 expect((await fetch(endpoint,{method:'POST',headers:{'Cf-Access-Jwt-Assertion':'forged','content-type':'application/json'},body:JSON.stringify({id:semanticId})})).status).toBe(401);
 }finally{await server?.stop(true);await app.close();}
 }finally{await db2.close();}
 await expect(restoreRecovery(first,two)).rejects.toThrow('recovery_target_not_empty');
},180000);
test('restore hashes actual archive and rejects missing corrupt traversal and incompatible evidence before target writes',async()=>{
 const target=await createRecoveryTarget();try{const manifest=JSON.parse(await readFile(one,'utf8')),directory=join(one,'..'),archive=join(directory,manifest.archive.file);await chmod(archive,0o600);await writeFile(archive,'corrupt archive');
 await expect(restoreRecovery(target,one)).rejects.toThrow('recovery_integrity');
 const modified=join(directory,'invalid.json');await writeFile(modified,JSON.stringify({...manifest,archive:{...manifest.archive,file:'../foreign.dump'}}));await expect(restoreRecovery(target,modified)).rejects.toThrow('recovery_manifest');
 await writeFile(modified,JSON.stringify({...manifest,embedding:{...manifest.embedding,dimensions:1024}}));await expect(restoreRecovery(target,modified)).rejects.toThrow('recovery_manifest');
 await rm(archive);await expect(restoreRecovery(target,one)).rejects.toThrow('recovery_integrity');
 const sql=new SQL(await recoveryConnection(target));try{expect((await sql`SELECT count(*)::integer AS n FROM pg_namespace WHERE nspname='allura'`)[0].n).toBe(0);}finally{await sql.close();}
 }finally{await closeRecoveryTarget(target);}
},60000);
test('backup deadline removes partial output and emits no successful manifest',async()=>{
 const destination=await mkdtemp(join(root,'failure-'));await expect(backupRecovery(source,destination,{timeoutMs:1})).rejects.toThrow('recovery_dump_failed');expect(await readdir(destination)).toEqual([]);
},30000);
test('restore refuses pre-existing foreign schema without adding restored data',async()=>{
 const target=await createRecoveryTarget(),sql=new SQL(await recoveryConnection(target));try{await sql.unsafe('CREATE SCHEMA foreign_empty');await expect(restoreRecovery(target,two)).rejects.toThrow('recovery_target_not_empty');expect((await sql`SELECT count(*)::integer AS n FROM pg_namespace WHERE nspname='allura'`)[0].n).toBe(0);}finally{await sql.close();await closeRecoveryTarget(target);}
},60000);
test('concurrent restore admits one writer and mutated owned resource bounds deny before operations',async()=>{
 const target=await createRecoveryTarget(),name=`allura-recovery-${target.id}`;try{
 const results=await Promise.allSettled([restoreRecovery(target,two),restoreRecovery(target,two)]);expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);const rejected=results.find(r=>r.status==='rejected') as PromiseRejectedResult;expect(rejected.reason.message).toBe('recovery_target_busy');
 expect(Bun.spawnSync(['docker','update','--pids-limit','64',name],{stdout:'pipe',stderr:'pipe'}).exitCode).toBe(0);await expect(recoveryConnection(target)).rejects.toThrow('recovery_target_denied');
 }finally{expect(Bun.spawnSync(['docker','update','--pids-limit','128',name],{stdout:'pipe',stderr:'pipe'}).exitCode).toBe(0);await closeRecoveryTarget(target);}
},60000);
