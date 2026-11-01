import {test,expect} from 'bun:test';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm,cp,symlink} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {packCore} from '../scripts/pack-core.ts';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {verifyCoreRelease,type CoreRelease} from '../src/core-release.ts';

const required=['src/core-server.ts','src/core-init.ts','src/core-config.ts','src/core-api.ts','src/core-release.ts','src/embedding.ts','src/persistence.ts','src/dashboard-server.ts','dashboard/app.js','dashboard/app.css','dashboard/allura-lettermark.png','bun.lock','package.json'];
const digest=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
async function fixture(count:number,body:(root:string,release:CoreRelease)=>Promise<void>){
 const root=await mkdtemp(join(tmpdir(),'allura-release-integrity-'));
 try{
  const paths=[...required];for(let i=paths.length;i<count;i++){paths.push(`src/fixture-${String.fromCharCode(97+Math.floor(i/26),97+i%26)}.ts`);}
  const release:CoreRelease={contract:'allura-core-release-v1',version:'0.1.0-dev.1',sourceHead:'a'.repeat(40),sourceDirty:true,sourcePackageSha256:'b'.repeat(64),packScriptSha256:'c'.repeat(64),inputs:{}};
  for(const file of paths){await mkdir(dirname(join(root,file)),{recursive:true});await writeFile(join(root,file),file);release.inputs[file]=digest(file);}
  await manifest(root,release);await body(root,release);
 }finally{await rm(root,{recursive:true,force:true});}
}
async function manifest(root:string,release:CoreRelease|string){await writeFile(join(root,'release.json'),typeof release==='string'?release:JSON.stringify(release,null,2)+'\n');}

async function denied(root:string){
 const result=await verifyCoreRelease(root).then(()=>null,(error:unknown)=>error);
 expect(result).toBeInstanceOf(Error);expect((result as Error).message).toBe('core_release_integrity');
 expect((result as Error).cause).toBeUndefined();
}

test('core release rejects duplicate decoded envelope and input keys',async()=>{
 await fixture(128,async(root,release)=>{
  const text=JSON.stringify(release),good=release.inputs['src/core-server.ts']!,wrong='0'.repeat(64);
  const inputPair=`"src/core-server.ts":"${good}"`;
  const cases=[
   text.replace('"sourceDirty":true','"sourceDirty":true,"sourceDirty":true'),
   text.replace('"sourceDirty":true','"sourceDirty":false,"sourceDirty":true'),
   text.replace('"sourceDirty":true','"sourceDirty":true,"sourceDirty":false'),
   text.replace('"sourceDirty":true','"sourceDirty":true,"source\\u0044irty":true'),
   text.replace(inputPair,`${inputPair},${inputPair}`),
   text.replace(inputPair,`"src/core-server.ts":"${wrong}",${inputPair}`),
   text.replace(inputPair,`${inputPair},"src/core-server.ts":"${wrong}"`),
   text.replace(inputPair,`${inputPair},"src\\u002fcore-server.ts":"${good}"`),
   text.replace('"inputs":{',`"inputs":${JSON.stringify(release.inputs)},"inputs":{`),
   text.replace('"inputs":{',`"inputs":{},"inputs":{`),
   text.slice(0,-1)+',"inputs":{}}',
  ];
  for(const raw of cases){await manifest(root,raw);await denied(root);}
 });
});

test('core release rejects nonexact envelopes and invalid fixed two level JSON',async()=>{
 await fixture(128,async(root,release)=>{
  const cases:unknown[]=[null,[],{...release,extra:true},{...release,extra:'unknown'},{...release,contract:'wrong'},{...release,version:'wrong'},{...release,sourceHead:'a'.repeat(40)+'\n'},{...release,sourcePackageSha256:'a'.repeat(63)},{...release,packScriptSha256:'g'.repeat(64)},{...release,inputs:[]},{...release,inputs:null},{...release,inputs:{...release.inputs,'src/core-server.ts':{nested:'bad'}}},{...release,sourceDirty:'true'}];
  for(const key of Object.keys(release)){const copy={...release} as Record<string,unknown>;delete copy[key];cases.push(copy);}
  for(const value of cases){await manifest(root,JSON.stringify(value));await denied(root);}
  for(const raw of ['{','',JSON.stringify(release)+' true',JSON.stringify(release).replace('"inputs":{','"inputs":{,'),JSON.stringify(release).replace('"sourceDirty":true','"sourceDirty":true,')]){await manifest(root,raw);await denied(root);}
 });
});

test('core pack verifies actual rebuilt archive and rejects overlimit source before artifact receipt',async()=>{
 const root=await mkdtemp(join(tmpdir(),'allura-pack-integrity-')),source=fileURLToPath(new URL('..',import.meta.url));
 try{
  const packed=await packCore(join(root,'valid')),stage=join(root,'unpacked');await mkdir(stage);
  expect(digest(await readFile(packed.tarball))).toBe(packed.sha256);
  const unpack=Bun.spawnSync(['tar','-xzf',packed.tarball,'-C',stage]);expect(unpack.exitCode).toBe(0);
  const release=await verifyCoreRelease(stage),receipt=JSON.parse(await readFile(packed.receipt,'utf8'));
  expect(receipt.inputs).toEqual(release.inputs);expect(receipt.sha256).toBe(packed.sha256);
  expect(release.inputs['src/core-release.ts']).toBe(digest(await readFile(join(source,'src/core-release.ts'))));
  const embedded=await import(join(stage,'src/core-release.ts')) as typeof import('../src/core-release.ts');
  expect(await embedded.verifyCoreRelease(stage)).toEqual(release);
  const exported=join(root,'export','foundation');await mkdir(exported,{recursive:true});
  for(const name of ['src','scripts','migrations','core-package','ui','package.json','bun.lock']){await cp(join(source,name),join(exported,name),{recursive:true});}
  await cp(join(source,'../public/brand'),join(exported,'../public/brand'),{recursive:true});
  await symlink(join(source,'node_modules'),join(exported,'node_modules'),'dir');
  const originalCount=Object.keys(release.inputs).length;expect(originalCount).toBeLessThanOrEqual(160);
  for(let i=originalCount;i<161;i++){await writeFile(join(exported,`src/package-boundary-${String.fromCharCode(97+Math.floor(i/26),97+i%26)}.ts`),'export {};\n');}
  const git=Bun.spawnSync(['git','rev-parse','--absolute-git-dir'],{cwd:source});expect(git.exitCode).toBe(0);
  const output=join(root,'denied');
  const child=Bun.spawnSync([process.execPath,'scripts/pack-core.ts',output],{cwd:exported,env:{...process.env,GIT_DIR:git.stdout.toString().trim(),GIT_WORK_TREE:join(source,'..'),GIT_OPTIONAL_LOCKS:'0'},stdout:'pipe',stderr:'pipe',timeout:60000});
  expect(child.exitCode).not.toBe(0);expect(child.stderr.toString()).toContain('core_release_integrity');expect(child.stdout.toString()).toBe('');
  const names=await readdir(output);expect(names).toHaveLength(1);
  expect(await readdir(join(output,names[0]!))).toEqual([]);
 }finally{await rm(root,{recursive:true,force:true});}
},60000);

test('core release enforces literal 128 160 and 161 input boundaries and hashes the last entry',async()=>{
 for(const count of [128,160,161]){
  await fixture(count,async(root,release)=>{
   expect(Object.keys(release.inputs)).toHaveLength(count);
   if(count===161){await denied(root);return;}
   expect(await verifyCoreRelease(root)).toEqual(release);
   const last=Object.keys(release.inputs).at(-1)!;await writeFile(join(root,last),'changed');await denied(root);
  });
 }
});

test('core release enforces exact manifest bytes and accepts ordinary JSON whitespace and escapes',async()=>{
 await fixture(128,async(root,release)=>{
  const text=JSON.stringify(release,null,2).replace('"contract"','"con\\u0074ract"').replace('src/core-server.ts','src\\/core-server.ts');
  const exact=text+' \t\r\n'+' '.repeat(65536-Buffer.byteLength(text)-4);
  expect(Buffer.byteLength(exact)).toBe(65536);await manifest(root,exact);expect(await verifyCoreRelease(root)).toEqual(release);
  await manifest(root,exact+' ');expect((await readFile(join(root,'release.json'))).byteLength).toBe(65537);await denied(root);
 });
});

test('core release enforces two MiB per input and 32 dashboard asset boundaries',async()=>{
 await fixture(128,async(root,release)=>{
  const file='src/core-server.ts';for(const size of [2097152,2097153]){
   const bytes=Buffer.alloc(size,65);await writeFile(join(root,file),bytes);release.inputs[file]=digest(bytes);await manifest(root,release);
   if(size===2097152){expect(await verifyCoreRelease(root)).toEqual(release);}else{await denied(root);}
  }
 });
 await fixture(128,async(root,release)=>{
  for(let i=3;i<33;i++){
   const file=`dashboard/asset-${i}.js`;await writeFile(join(root,file),file);release.inputs[file]=digest(file);
   if(i===31||i===32){await manifest(root,release);expect((await readdir(join(root,'dashboard'))).length).toBe(i+1);if(i===31){expect(await verifyCoreRelease(root)).toEqual(release);}else{await denied(root);}}
  }
 });
});

test('core release rejects every missing required input missing file and invalid or wrong digest',async()=>{
 await fixture(128,async(root,release)=>{
  for(const file of required){const saved=release.inputs[file]!;delete release.inputs[file];await manifest(root,release);await denied(root);release.inputs[file]=saved;}
  const file='src/core-server.ts',saved=release.inputs[file]!;
  for(const value of ['0'.repeat(64),'a'.repeat(63),'A'.repeat(64),'g'.repeat(64),'a'.repeat(64)+'\n','']){release.inputs[file]=value;await manifest(root,release);await denied(root);}
  release.inputs[file]=saved;await manifest(root,release);await rm(join(root,file));await denied(root);
 });
});

test('core release rejects absolute traversal backslash nested forbidden and nonfile input paths',async()=>{
 await fixture(128,async(root,release)=>{
  for(const path of [join(root,'absolute.ts'),'../outside.ts','src/../outside.ts','src\\outside.ts','src/nested/file.ts','src/forbidden.js','migrations/not-numbered.sql','scripts/arbitrary.ts','dashboard/arbitrary.svg','unknown.txt','src/trailing.ts\n']){
   // Keep real matching bytes inside the owned fixture, never outside its root.
   const local=path!=='../outside.ts',actual=path.startsWith('/')?path:join(root,path);
   if(local){await mkdir(dirname(actual),{recursive:true});await writeFile(actual,'bytes');}
   release.inputs[path]=digest('bytes');await manifest(root,release);await denied(root);delete release.inputs[path];if(local){await rm(actual);}
  }
  const file='src/core-server.ts';await manifest(root,release);await rm(join(root,file));await symlink(join(root,'src/core-init.ts'),join(root,file));release.inputs[file]=release.inputs['src/core-init.ts']!;await manifest(root,release);await denied(root);
  await rm(join(root,file));await mkdir(join(root,file));await denied(root);
 });
});

test('core release rejects unlisted missing and nonfile dashboard assets',async()=>{
 await fixture(128,async(root,release)=>{
  await writeFile(join(root,'dashboard/extra.js'),'extra');await denied(root);await rm(join(root,'dashboard/extra.js'));
  await rm(join(root,'dashboard/app.js'));await denied(root);await mkdir(join(root,'dashboard/app.js'));await denied(root);
  delete release.inputs['dashboard/app.js'];await manifest(root,release);await denied(root);
 });
});

test('core release accepts valid 129 input filesystem package',async()=>{
 await fixture(129,async(root,release)=>{expect(Object.keys(release.inputs)).toHaveLength(129);expect(await verifyCoreRelease(root)).toEqual(release);});
});
