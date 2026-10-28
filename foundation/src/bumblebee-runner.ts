import {open,realpath,lstat,readdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join,isAbsolute,normalize} from 'node:path';
import {homedir,tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {BUMBLEBEE,parseBumblebeeSource,type BumblebeeSource} from './bumblebee-contract.ts';
import {parseBumblebeeWire} from './bumblebee-wire.ts';
type LocalRoot=Readonly<{path:string;digest:string;kind:string}>;
const artifact='3b46f98ab8fa6345a5d39c7483ff37c51b2ee7699aabe51f2a54133f357f6c7a';
function requireScan(value:unknown):asserts value{if(!value){throw new Error('bumblebee_scan_failed');}}
/** Local approved root mapping is provisioned separately; never obtained from wire.
 * Receiver independently checks keyed root fingerprints. Not an OS sandbox or
 * authority to enroll a source, transfer data, execute packages or schedule scans. */
export async function runBumblebeeScan(input:{binary:string;source:BumblebeeSource;roots:readonly LocalRoot[];signal?:AbortSignal}):Promise<Uint8Array>{
 let directory:string|undefined,child:ReturnType<typeof Bun.spawn>|undefined;
 const signal=AbortSignal.any([AbortSignal.timeout(BUMBLEBEE.maxScanSeconds*1000),...(input.signal?[input.signal]:[])]),stop=()=>{child?.kill('SIGKILL');};
 try{
  signal.throwIfAborted();requireScan(process.platform==='linux'&&process.arch==='x64');const source=parseBumblebeeSource(input.source),roots=input.roots.map(r=>({...r}));
  requireScan(roots.length===source.roots.length&&new Set(roots.map(r=>r.path)).size===roots.length);
  requireScan(JSON.stringify(roots.map(r=>({digest:r.digest,kind:r.kind})).sort((a,b)=>a.digest.localeCompare(b.digest)))===JSON.stringify(source.roots));
  for(const r of roots){requireScan(Object.keys(r).length===3&&typeof r.path==='string'&&r.path.length<=4096&&isAbsolute(r.path)&&normalize(r.path)===r.path&&!r.path.includes('\0')&&!r.path.includes(',')&&r.path!=='/'&&r.path!==homedir()&&!homedir().startsWith(r.path+'/'));requireScan(await realpath(r.path)===r.path&&(await lstat(r.path)).isDirectory());}
  const snapshot=async()=>{const result:string[]=[];let entries=0;const walk=async(path:string,device:number):Promise<void>=>{signal.throwIfAborted();requireScan(++entries<=10000);const s=await lstat(path);requireScan(!s.isSymbolicLink()&&s.dev===device&&(s.isDirectory()||(s.isFile()&&s.nlink===1)));result.push(JSON.stringify([path,s.dev,s.ino,s.size,s.mtimeMs,s.ctimeMs]));if(s.isDirectory()){for(const name of (await readdir(path)).sort()){await walk(join(path,name),device);}}};for(const r of roots){await walk(r.path,(await lstat(r.path)).dev);}return JSON.stringify(result);};
  const before=await snapshot();requireScan(isAbsolute(input.binary)&&await realpath(input.binary)===input.binary);const handle=await open(input.binary,constants.O_RDONLY|constants.O_NOFOLLOW);let bytes:Buffer;
  try{const s=await handle.stat();requireScan(s.isFile()&&s.size===6738104);const b=Buffer.alloc(6738105),{bytesRead}=await handle.read(b,0,b.length,0);requireScan(bytesRead===6738104);bytes=b.subarray(0,bytesRead);requireScan(createHash('sha256').update(bytes).digest('hex')===artifact);}finally{await handle.close();}
  signal.throwIfAborted();directory=await mkdtemp(join(tmpdir(),'allura-bumblebee-run-'));const binary=join(directory,'scanner');await writeFile(binary,bytes,{flag:'wx',mode:0o700});
  const args=[binary,'scan','--profile',source.profile,...roots.flatMap(r=>['--root',r.path]),'--ecosystem',source.ecosystems.join(','),'--max-duration','30s','--max-file-size','65536','--concurrency','1','--device-id-env','ALLURA_SCANNER_DEVICE_ID','--output','stdout'];
  child=Bun.spawn(args,{cwd:directory,env:{HOME:directory,ALLURA_SCANNER_DEVICE_ID:source.endpointId},stdin:'ignore',stdout:'pipe',stderr:'pipe'});signal.addEventListener('abort',stop,{once:true});signal.throwIfAborted();
  const consume=async(stream:ReadableStream<Uint8Array>,limit:number,retain:boolean)=>{const reader=stream.getReader(),parts:Uint8Array[]=[];let size=0;try{while(true){signal.throwIfAborted();const {done,value}=await reader.read();if(done){break;}size+=value.length;if(size>limit){stop();await reader.cancel();throw new Error();}if(retain){parts.push(value);}}return Buffer.concat(parts);}finally{reader.releaseLock();}};
  const [wire,,exit]=await Promise.all([consume(child.stdout as ReadableStream<Uint8Array>,BUMBLEBEE.maxWireBytes,true),consume(child.stderr as ReadableStream<Uint8Array>,65536,false),child.exited]);signal.throwIfAborted();requireScan(exit===0&&await snapshot()===before);
  const records=parseBumblebeeWire(wire),summary=records.at(-1)!;requireScan(summary.record_type==='scan_summary');const declared=summary.roots as {path:string;kind:string}[];requireScan(Array.isArray(declared)&&declared.length===roots.length&&declared.every(r=>roots.some(x=>x.path===r.path&&x.kind===r.kind)));
  for(const r of records){requireScan(r.profile===source.profile&&(r.endpoint as {device_id:string}).device_id===source.endpointId);if(r.record_type!=='scan_summary'){requireScan(typeof r.source_file==='string'&&roots.some(root=>r.source_file===root.path||(r.source_file as string).startsWith(root.path+'/')));}}
  return wire;
 }catch{throw new Error('bumblebee_scan_failed');}finally{signal.removeEventListener('abort',stop);if(child&&child.exitCode===null){stop();await child.exited;}if(directory){await rm(directory,{recursive:true,force:true});}}
}
