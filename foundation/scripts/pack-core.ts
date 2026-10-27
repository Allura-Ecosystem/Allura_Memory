import {mkdtemp,mkdir,readdir,readFile,writeFile,copyFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('..',import.meta.url));
export async function packCore(destination?:string):Promise<{tarball:string;sha256:string;receipt:string}>{
 const parent=resolve(destination??tmpdir());await mkdir(parent,{recursive:true});const output=await mkdtemp(join(parent,'allura-core-artifact-')),stage=await mkdtemp(join(tmpdir(),'allura-core-stage-'));
 const run=(args:string[])=>{const result=Bun.spawnSync(args,{cwd:root,stdout:'pipe',stderr:'pipe',timeout:60000});if(result.exitCode!==0){throw new Error('core_pack_failed');}return result.stdout.toString().trim();};
 const hash=(data:Uint8Array|string)=>createHash('sha256').update(data).digest('hex');
 try{
  const inputs:Record<string,string>={};const files=['bun.lock','scripts/check-toolchain.ts','scripts/prepare-model.ts','core-package/README.md',...(await readdir(join(root,'src'))).filter(n=>/^[a-z-]+\.ts$/.test(n)).map(n=>'src/'+n),...(await readdir(join(root,'migrations'))).filter(n=>/^\d{3}-[a-z-]+\.sql$/.test(n)).map(n=>'migrations/'+n)];
  for(const file of files){const target=file==='core-package/README.md'?'README.md':file;await mkdir(join(stage,target,'..'),{recursive:true});await copyFile(join(root,file),join(stage,target));inputs[target]=hash(await readFile(join(stage,target)));}
  const original=JSON.parse(await readFile(join(root,'package.json'),'utf8'));const manifest={...original,scripts:{'check:toolchain':'bun scripts/check-toolchain.ts','install:frozen':'bun run check:toolchain && bun install --frozen-lockfile --ignore-scripts','prepare:model':'bun scripts/prepare-model.ts','init:empty':'bun src/core-init.ts','start':'bun src/core-server.ts'}};
  await writeFile(join(stage,'package.json'),JSON.stringify(manifest,null,2));inputs['package.json']=hash(await readFile(join(stage,'package.json')));
  const provenance={contract:'allura-core-release-v1',version:'0.1.0-dev.1',sourceHead:run(['git','rev-parse','HEAD']),sourceDirty:!!run(['git','status','--porcelain']),sourcePackageSha256:hash(await readFile(join(root,'package.json'))),packScriptSha256:hash(await readFile(fileURLToPath(import.meta.url))),inputs};
  await writeFile(join(stage,'release.json'),JSON.stringify(provenance,null,2));const tarball=join(output,'allura-core-0.1.0-dev.1.tar.gz');run(['tar','-czf',tarball,'-C',stage,'.']);const sha256=hash(await readFile(tarball)),receipt=join(output,'pack-receipt.json');await writeFile(receipt,JSON.stringify({...provenance,tarball,sha256},null,2));return {tarball,sha256,receipt};
 }finally{await rm(stage,{recursive:true,force:true});}
}
if(import.meta.main){console.log(JSON.stringify(await packCore(process.argv[2])));}
