import {readFile,writeFile,mkdir,lstat,mkdtemp,rm,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=fileURLToPath(new URL('..',import.meta.url));
const binaryHash='3b46f98ab8fa6345a5d39c7483ff37c51b2ee7699aabe51f2a54133f357f6c7a',archiveHash='53b080cf3ddb692b0c4e5492ef4785b4c54daf1624fcd0fcba3958116a0be8d9';
const hash=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
/** Public pinned test dependency; no scanner execution or source enrollment. */
export async function prepareBumblebee():Promise<string>{
 let stage:string|undefined;
 try{
  if(process.platform!=='linux'||process.arch!=='x64'){throw new Error();}
  const cache=join(root,'node_modules/.cache/allura-bumblebee'),target=join(cache,'bumblebee-v0.1.2');await mkdir(cache,{recursive:true});
  const exists=await lstat(target).catch((e:NodeJS.ErrnoException)=>{if(e.code==='ENOENT'){return null;}throw e;});
  if(exists){if(!exists.isFile()||exists.isSymbolicLink()||exists.size!==6738104||hash(await readFile(target))!==binaryHash){throw new Error();}return target;}
  stage=await mkdtemp(join(cache,'prepare-'));const response=await fetch('https://github.com/perplexityai/bumblebee/releases/download/v0.1.2/bumblebee_0.1.2_linux_amd64.tar.gz',{signal:AbortSignal.timeout(30000)});if(!response.ok||!response.body){throw new Error();}
  const reader=response.body.getReader(),parts:Uint8Array[]=[];let size=0;try{while(true){const {done,value}=await reader.read();if(done){break;}size+=value.length;if(size>16777216){await reader.cancel();throw new Error();}parts.push(value);}}finally{reader.releaseLock();}
  const archive=Buffer.concat(parts);if(hash(archive)!==archiveHash){throw new Error();}const path=join(stage,'upstream.tar.gz');await writeFile(path,archive,{mode:0o600,flag:'wx'});
  const bytes=execFileSync('tar',['-xOzf',path,'bumblebee'],{timeout:10000,maxBuffer:8388608,stdio:['ignore','pipe','pipe']});if(bytes.length!==6738104||hash(bytes)!==binaryHash){throw new Error();}
  const file=join(stage,'bumblebee');await writeFile(file,bytes,{mode:0o700,flag:'wx'});await rename(file,target);return target;
 }catch{throw new Error('bumblebee_preparation_failed');}finally{if(stage){await rm(stage,{recursive:true,force:true});}}
}
if(import.meta.main){console.log(JSON.stringify({binary:await prepareBumblebee(),sha256:binaryHash,license:'Apache-2.0',redistributed:false}));}
