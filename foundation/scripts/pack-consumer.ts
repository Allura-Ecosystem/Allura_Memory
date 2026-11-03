import {mkdtemp,mkdir,copyFile,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('..',import.meta.url));
export async function packConsumer(destination?:string):Promise<{tarball:string;sha256:string;receipt:string}>{
 const parent=destination?resolve(destination):tmpdir();await mkdir(parent,{recursive:true});const output=await mkdtemp(join(parent,'allura-consumer-artifact-'));
 const stage=await mkdtemp(join(tmpdir(),'allura-consumer-stage-'));
 const run=(args:string[],cwd:string)=>{const p=Bun.spawnSync(args,{cwd,stdout:'pipe',stderr:'pipe',timeout:60000});if(p.exitCode!==0){throw new Error(`Consumer build failed: ${args[0]} ${p.stderr.toString()}`);}return p.stdout.toString();};
 try{
  await mkdir(join(stage,'dist'));for(const name of ['package.json','README.md']){await copyFile(join(root,'consumer-package',name),join(stage,name));}
  for(const name of ['consumer-client','consumer-cli','consumer-mcp','device-client']){const build=await Bun.build({entrypoints:[join(root,'src',name+'.ts')],target:'node',format:'esm',packages:'external',outdir:join(stage,'dist'),naming:name+'.js'});if(!build.success){throw new Error('Consumer bundle failed');}}
  run(['node',join(root,'node_modules/typescript/bin/tsc'),'--declaration','--emitDeclarationOnly','--target','ES2022','--module','NodeNext','--moduleResolution','NodeNext','--strict','--skipLibCheck','--types','node','--outDir',join(stage,'dist'),'--rootDir',join(root,'src'),join(root,'src/consumer-client.ts'),join(root,'src/device-client.ts')],root);
  const packed=JSON.parse(run(['npm','pack','--ignore-scripts','--json','--pack-destination',output],stage)) as {filename:string}[]|Record<string,{filename:string}>;
  const artifact=Array.isArray(packed)?packed[0]:packed['@allura/memory-consumer'];if(artifact?.filename!=='allura-memory-consumer-0.1.0-dev.1.tgz'){throw new Error('Unexpected pack metadata');}
  const tarball=join(output,artifact.filename),sha256=createHash('sha256').update(await readFile(tarball)).digest('hex'),inputs:Record<string,string>={};
  for(const file of ['src/consumer-client.ts','src/consumer-contract.ts','src/consumer-cli.ts','src/consumer-runtime.ts','src/consumer-mcp.ts','src/device-client.ts','src/device-secret-store.ts','src/device-contract.ts','scripts/pack-consumer.ts','consumer-package/package.json','consumer-package/README.md','bun.lock']){inputs[file]=createHash('sha256').update(await readFile(join(root,file))).digest('hex');}
  const receipt=join(output,'pack-receipt.json');await writeFile(receipt,JSON.stringify({contract:'allura-consumer-v1',sourceHead:run(['git','rev-parse','HEAD'],root).trim(),sourceDirty:!!run(['git','status','--porcelain'],root).trim(),inputs,tarball,sha256},null,2));
  return {tarball,sha256,receipt};
 }finally{await rm(stage,{recursive:true,force:true});}
}
if(import.meta.main){console.log(JSON.stringify(await packConsumer(process.argv[2])));}
