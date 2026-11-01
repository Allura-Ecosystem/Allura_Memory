import {readFile,lstat,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
export type CoreRelease={contract:'allura-core-release-v1';version:'0.1.0-dev.1';sourceHead:string;sourceDirty:boolean;sourcePackageSha256:string;packScriptSha256:string;inputs:Record<string,string>};
// This manifest has exactly two object levels, not general recursive JSON or NDJSON.
// Decode each key before duplicate detection; JSON.parse alone silently keeps the last.
function parseRelease(text:string):CoreRelease{
 let at=0;
 const whitespace=()=>{while(at<text.length&&/[ \t\r\n]/.test(text[at]!)){at++;}};
 const take=(token:string)=>{whitespace();if(text.slice(at,at+token.length)!==token){throw new Error();}at+=token.length;};
 const string=()=>{
  whitespace();const start=at;take('"');
  while(at<text.length){const char=text[at++];if(char==='"'){return JSON.parse(text.slice(start,at)) as string;}if(char==='\\'){at++;}}
  throw new Error();
 };
 const object=(inputs:boolean):Record<string,unknown>=>{
  take('{');const result:Record<string,unknown>=Object.create(null);whitespace();
  if(text[at]==='}'){at++;return result;}
  for(;;){
   const key=string();if(Object.hasOwn(result,key)){throw new Error();}take(':');
   if(!inputs&&key==='inputs'){result[key]=object(true);}
   else if(!inputs&&key==='sourceDirty'){whitespace();const value=text.startsWith('true',at);take(value?'true':'false');result[key]=value;}
   else{result[key]=string();}
   whitespace();if(text[at]==='}'){at++;return result;}take(',');
  }
 };
 const release=object(false);whitespace();
 const fields=['contract','version','sourceHead','sourceDirty','sourcePackageSha256','packScriptSha256','inputs'];
 if(at!==text.length||Object.keys(release).length!==fields.length||fields.some(key=>!Object.hasOwn(release,key))){throw new Error();}
 return release as CoreRelease;
}
export async function verifyCoreRelease(root:string):Promise<CoreRelease>{
 try{
  const raw=await readFile(join(root,'release.json'));if(raw.byteLength>65536){throw new Error();}const release=parseRelease(raw.toString());
  const hash=(v:unknown,length=64)=>typeof v==='string'&&v.length===length&&/^[0-9a-f]+$/.test(v);
  if(!release||release.contract!=='allura-core-release-v1'||release.version!=='0.1.0-dev.1'||!hash(release.sourceHead,40)||typeof release.sourceDirty!=='boolean'||!hash(release.sourcePackageSha256)||!hash(release.packScriptSha256)||!release.inputs||typeof release.inputs!=='object'||Array.isArray(release.inputs)||Object.keys(release.inputs).length>160){throw new Error();}
  for(const required of ['src/core-server.ts','src/core-init.ts','src/core-config.ts','src/core-api.ts','src/core-release.ts','src/embedding.ts','src/persistence.ts','src/dashboard-server.ts','dashboard/app.js','dashboard/app.css','dashboard/allura-lettermark.png','bun.lock','package.json']){if(!hash(release.inputs[required])){throw new Error();}}
  const assets=await readdir(join(root,'dashboard'));if(assets.length>32||assets.length!==Object.keys(release.inputs).filter(p=>p.startsWith('dashboard/')).length||assets.some(p=>!hash(release.inputs['dashboard/'+p]))){throw new Error();}
  for(const [file,digest] of Object.entries(release.inputs)){
   if(!hash(digest)||!/^(src\/[a-z-]+\.ts|migrations\/[0-9]{3}-[a-z-]+\.sql|migrations\/033-work-plane-http-run8\.sql|scripts\/(check-toolchain|prepare-model)\.ts|dashboard\/[A-Za-z0-9_.-]+\.(js|css|woff2|png)|README\.md|package\.json|bun\.lock)$/.test(file)){throw new Error();}
   const path=join(root,file),metadata=await lstat(path);if(!metadata.isFile()||metadata.isSymbolicLink()||metadata.size>2*1024*1024||createHash('sha256').update(await readFile(path)).digest('hex')!==digest){throw new Error();}
  }
  return release;
 }catch{throw new Error('core_release_integrity');}
}
