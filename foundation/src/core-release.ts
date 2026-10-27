import {readFile,lstat} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
export type CoreRelease={contract:'allura-core-release-v1';version:'0.1.0-dev.1';sourceHead:string;sourceDirty:boolean;sourcePackageSha256:string;packScriptSha256:string;inputs:Record<string,string>};
export async function verifyCoreRelease(root:string):Promise<CoreRelease>{
 try{
  const raw=await readFile(join(root,'release.json'));if(raw.byteLength>65536){throw new Error();}const release=JSON.parse(raw.toString()) as CoreRelease;
  const hash=(v:unknown,length=64)=>typeof v==='string'&&v.length===length&&/^[0-9a-f]+$/.test(v);
  if(!release||release.contract!=='allura-core-release-v1'||release.version!=='0.1.0-dev.1'||!hash(release.sourceHead,40)||typeof release.sourceDirty!=='boolean'||!hash(release.sourcePackageSha256)||!hash(release.packScriptSha256)||!release.inputs||typeof release.inputs!=='object'||Array.isArray(release.inputs)||Object.keys(release.inputs).length>128){throw new Error();}
  for(const required of ['src/core-server.ts','src/core-init.ts','src/core-config.ts','src/core-api.ts','src/core-release.ts','src/embedding.ts','src/persistence.ts','bun.lock','package.json']){if(!hash(release.inputs[required])){throw new Error();}}
  for(const [file,digest] of Object.entries(release.inputs)){
   if(!hash(digest)||!/^(src\/[a-z-]+\.ts|migrations\/[0-9]{3}-[a-z-]+\.sql|scripts\/(check-toolchain|prepare-model)\.ts|README\.md|package\.json|bun\.lock)$/.test(file)){throw new Error();}
   const path=join(root,file),metadata=await lstat(path);if(!metadata.isFile()||metadata.isSymbolicLink()||metadata.size>2*1024*1024||createHash('sha256').update(await readFile(path)).digest('hex')!==digest){throw new Error();}
  }
  return release;
 }catch{throw new Error('core_release_integrity');}
}
