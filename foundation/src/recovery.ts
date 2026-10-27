import {SQL} from 'bun';
import {mkdtemp,mkdir,open,readFile,writeFile,readdir,rm,chmod} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join,dirname,resolve,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {EMBEDDING} from './embedding.ts';
import {verifyCoreRelease} from './core-release.ts';
import {recoveryConnection,startRecoveryDump,startRecoveryRestore,type RecoveryTarget} from './recovery-target.ts';
const root=fileURLToPath(new URL('..',import.meta.url)),MAX=256*1024*1024;
type Migration={version:number;digest:string};
type Manifest={format:'allura-recovery-v1';id:string;sourceTarget:string;createdAt:string;archive:{file:'archive.dump';bytes:number;sha256:string};source:{head:string;dirty:boolean;inputs:Record<string,string>};migrations:Migration[];embedding:typeof EMBEDDING};
const hash=(v:Uint8Array|string)=>createHash('sha256').update(v).digest('hex');
const sha=(v:unknown,n=64)=>typeof v==='string'&&v.length===n&&/^[0-9a-f]+$/.test(v);
const keys=(v:unknown,names:string[])=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===names.length&&Object.keys(v).every(k=>names.includes(k));
async function migrations():Promise<Migration[]>{const files=(await readdir(join(root,'migrations'))).filter(n=>/^\d{3}-[a-z-]+\.sql$/.test(n)).sort();return Promise.all(files.map(async(name,i)=>({version:i+1,digest:hash(await readFile(join(root,'migrations',name)))})));}
async function provenance():Promise<Manifest['source']>{
 const inputs:Record<string,string>={};for(const file of ['package.json','bun.lock',...(await readdir(join(root,'src'))).filter(n=>n.endsWith('.ts')).map(n=>'src/'+n)]){inputs[file]=hash(await readFile(join(root,file)));}
 if(await Bun.file(join(root,'release.json')).exists()){
  const release=await verifyCoreRelease(root);if(Object.entries(inputs).some(([file,digest])=>release.inputs[file]!==digest)){throw new Error('core_release_integrity');}return {head:release.sourceHead,dirty:release.sourceDirty,inputs};
 }
 const git=(args:string[])=>{const p=Bun.spawnSync(['git',...args],{cwd:root,stdout:'pipe',stderr:'pipe',timeout:10000});if(p.exitCode!==0){throw new Error('recovery_source_unavailable');}return p.stdout.toString().trim();};
 if(basename(root)!=='foundation'||git(['rev-parse','--show-toplevel'])!==resolve(root,'..')){throw new Error('recovery_source_unavailable');}
 return {head:git(['rev-parse','HEAD']),dirty:!!git(['status','--porcelain']),inputs};
}
async function drain(stream:ReadableStream<Uint8Array>):Promise<void>{await stream.pipeTo(new WritableStream({write(){}}));}
export async function backupRecovery(target:RecoveryTarget,parent:string,options:{timeoutMs?:number;signal?:AbortSignal}={}):Promise<string>{
 const timeoutMs=options.timeoutMs??60000;if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>60000){throw new Error('recovery_invalid');}options.signal?.throwIfAborted();
 const sql=new SQL(await recoveryConnection(target),{max:1});let directory:string|undefined,successful=false;
 try{const result=await sql.begin(async tx=>{
  await tx.unsafe("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL idle_in_transaction_session_timeout='65000'");
  const expected=await migrations(),actual=await tx`SELECT version,digest FROM allura.schema_migrations ORDER BY version`;if(JSON.stringify(actual.map((r:Migration)=>({version:r.version,digest:r.digest})))!==JSON.stringify(expected)){throw new Error('recovery_schema');}
  const [snapshot]=await tx`SELECT pg_export_snapshot() AS id`;await mkdir(parent,{recursive:true});directory=await mkdtemp(join(parent,'backup-'));await chmod(directory,0o700);const output=await open(join(directory,'archive.dump'),'wx',0o600);
  let process:ReturnType<typeof startRecoveryDump>|undefined,stderr:Promise<void>=Promise.resolve(),bytes=0;const digest=createHash('sha256');
  try{process=startRecoveryDump(target,timeoutMs,snapshot.id);stderr=drain(process.stderr).catch(()=>{});
   for await(const chunk of process.stdout){options.signal?.throwIfAborted();bytes+=chunk.byteLength;if(bytes>MAX){throw new Error('recovery_size');}digest.update(chunk);await output.writeFile(chunk);}
   if(await process.exited!==0||bytes===0){throw new Error('recovery_dump_failed');}await stderr;options.signal?.throwIfAborted();await output.sync();
   const manifest:Manifest={format:'allura-recovery-v1',id:randomUUID(),sourceTarget:target.id,createdAt:new Date().toISOString(),archive:{file:'archive.dump',bytes,sha256:digest.digest('hex')},source:await provenance(),migrations:expected,embedding:EMBEDDING};
   const manifestPath=join(directory,'manifest.json');await writeFile(manifestPath,JSON.stringify(manifest,null,2),{flag:'wx',mode:0o600});return manifestPath;
  }finally{process?.kill();await process?.exited;await stderr;await output.close();}
 });successful=true;return result;
 }finally{await sql.close();if(!successful&&directory){await rm(directory,{recursive:true,force:true});}}
}
async function parseManifest(path:string):Promise<Manifest>{
 try{const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);let raw:unknown;try{const stat=await file.stat();if(!stat.isFile()||stat.size>65536){throw new Error();}raw=JSON.parse(await file.readFile('utf8'));}finally{await file.close();}
  if(!keys(raw,['format','id','sourceTarget','createdAt','archive','source','migrations','embedding'])){throw new Error();}const m=raw as Manifest;
  const uuid=(v:unknown)=>typeof v==='string'&&v.length===36&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
  if(m.format!=='allura-recovery-v1'||!uuid(m.id)||!uuid(m.sourceTarget)||typeof m.createdAt!=='string'||!Number.isFinite(Date.parse(m.createdAt))||!keys(m.archive,['file','bytes','sha256'])||m.archive.file!=='archive.dump'||!Number.isSafeInteger(m.archive.bytes)||m.archive.bytes<=0||m.archive.bytes>MAX||!sha(m.archive.sha256)||!keys(m.source,['head','dirty','inputs'])||!sha(m.source.head,40)||typeof m.source.dirty!=='boolean'||!m.source.inputs||Array.isArray(m.source.inputs)||!sha(m.source.inputs['bun.lock'])||Object.entries(m.source.inputs).some(([name,digest])=>!(/^(src\/[a-z-]+\.ts|bun\.lock|package\.json)$/.test(name)&&sha(digest)))||JSON.stringify(m.migrations)!==JSON.stringify(await migrations())||!keys(m.embedding,Object.keys(EMBEDDING))||Object.entries(EMBEDDING).some(([key,value])=>m.embedding[key as keyof typeof EMBEDDING]!==value)){throw new Error();}return m;
 }catch{throw new Error('recovery_manifest');}
}
const restoring=new WeakSet<object>();
export async function restoreRecovery(target:RecoveryTarget,manifestPath:string):Promise<void>{
 if(!target||typeof target!=='object'){throw new Error('recovery_target_denied');}
 if(restoring.has(target)){throw new Error('recovery_target_busy');}restoring.add(target);
 try{await restoreVerified(target,manifestPath);}finally{restoring.delete(target);}
}
async function restoreVerified(target:RecoveryTarget,manifestPath:string):Promise<void>{
 const connection=await recoveryConnection(target),manifest=await parseManifest(manifestPath);if(manifest.sourceTarget===target.id){throw new Error('recovery_target_not_empty');}
 const stage=await mkdtemp(join(tmpdir(),'allura-verified-restore-'));await chmod(stage,0o700);const snapshot=join(stage,'verified.dump');
 try{
  try{const input=await open(join(dirname(manifestPath),manifest.archive.file),constants.O_RDONLY|constants.O_NOFOLLOW);let size=0;const digest=createHash('sha256');
   try{const output=await open(snapshot,'wx',0o600);try{const stat=await input.stat();if(!stat.isFile()||stat.size!==manifest.archive.bytes){throw new Error();}for await(const chunk of input.createReadStream({autoClose:false})){size+=chunk.byteLength;if(size>MAX){throw new Error();}digest.update(chunk);await output.writeFile(chunk);}await output.sync();if(size!==manifest.archive.bytes||digest.digest('hex')!==manifest.archive.sha256){throw new Error();}}finally{await output.close();}}finally{await input.close();}
  }catch{throw new Error('recovery_integrity');}await chmod(snapshot,0o400);
  const sql=new SQL(connection,{max:1});try{
   const [state]=await sql`SELECT (SELECT count(*)::integer FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema') AS objects,(SELECT count(*)::integer FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname NOT IN ('public','information_schema')) AS schemas,(SELECT count(*)::integer FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema') AS functions,(SELECT count(*)::integer FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema') AS types,(SELECT count(*)::integer FROM pg_extension WHERE extname<>'plpgsql') AS extensions,(SELECT count(*)::integer FROM pg_roles WHERE rolname !~ '^pg_' AND rolname<>'postgres') AS roles`;
   if(Object.values(state).some(value=>value!==0)){throw new Error('recovery_target_not_empty');}
   const [role]=await sql`SELECT rolsuper,rolbypassrls,rolcanlogin FROM pg_roles WHERE rolname='allura_app'`;if(role){throw new Error('recovery_target_not_empty');}
   await sql.unsafe('CREATE ROLE allura_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS');
   const process=startRecoveryRestore(target,snapshot);const [, ,exit]=await Promise.all([drain(process.stdout),drain(process.stderr),process.exited]);if(exit!==0){throw new Error('recovery_restore_failed');}
   const restored=await sql`SELECT version,digest FROM allura.schema_migrations ORDER BY version`;if(JSON.stringify(restored.map((r:Migration)=>({version:r.version,digest:r.digest})))!==JSON.stringify(manifest.migrations)){throw new Error('recovery_schema');}
  }finally{await sql.close();}
 }finally{await rm(stage,{recursive:true,force:true});}
}
