import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {constants} from 'node:fs';
import {mkdir,lstat,open} from 'node:fs/promises';
import {join,isAbsolute} from 'node:path';

export type DeviceStoreScope=Readonly<{endpoint:string;groupId:string;workspaceId:string;profileId:string}>;
export class SecretStoreError extends Error{constructor(code:'invalid'|'unavailable'|'busy'){super(`secure_store_${code}`);this.name='SecretStoreError';}}
// Linux Secret Service only. No plaintext/in-memory substitute and no shell.
export class LinuxDeviceSecretStore{
 private readonly slot:string;private readonly environment:NodeJS.ProcessEnv;
 constructor(scope:DeviceStoreScope,environment:NodeJS.ProcessEnv=process.env,allowLoopback=false){
  try{const endpoint=new URL(scope.endpoint),uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;if((endpoint.protocol!=='https:'&&!(allowLoopback===true&&endpoint.protocol==='http:'&&['127.0.0.1','[::1]'].includes(endpoint.hostname)))||endpoint.href!==scope.endpoint||endpoint.pathname!=='/mcp'||endpoint.username||endpoint.password||endpoint.search||endpoint.hash||!/^allura-[a-z0-9][a-z0-9-]{0,79}$/.test(scope.groupId)||!uuid.test(scope.workspaceId)||!uuid.test(scope.profileId)){throw new Error();}}catch{throw new SecretStoreError('invalid');}
  if(process.platform!=='linux'||!environment.DBUS_SESSION_BUS_ADDRESS||environment.DBUS_SESSION_BUS_ADDRESS.length>4096||environment.DBUS_SESSION_BUS_ADDRESS.includes('\0')||!/^unix:(?:path=\/[^;\r\n]+|abstract=[^;\r\n]+)$/.test(environment.DBUS_SESSION_BUS_ADDRESS)){throw new SecretStoreError('unavailable');}
  this.slot=createHash('sha256').update(JSON.stringify(['allura-device-store-v1',scope.endpoint,scope.groupId,scope.workspaceId,scope.profileId])).digest('hex');
  this.environment={};for(const key of ['PATH','HOME','XDG_DATA_HOME','XDG_CONFIG_HOME','XDG_RUNTIME_DIR','DBUS_SESSION_BUS_ADDRESS','LANG']){if(environment[key]!==undefined){this.environment[key]=environment[key];}}Object.freeze(this.environment);
 }
 async exclusive<T>(work:()=>Promise<T>):Promise<T>{
  // Kernel-owned lock, not stale PID files: child stdin closes on client death.
  const runtime=this.environment.XDG_RUNTIME_DIR;if(!runtime||!isAbsolute(runtime)){throw new SecretStoreError('unavailable');}
  const directory=join(runtime,'allura-device-locks');
  try{const parent=await lstat(runtime);if(!parent.isDirectory()||parent.uid!==process.getuid?.()||(parent.mode&0o077)!==0){throw new Error();}await mkdir(directory,{mode:0o700,recursive:true});const info=await lstat(directory);if(!info.isDirectory()||info.uid!==process.getuid?.()||(info.mode&0o077)!==0){throw new Error();}}catch{throw new SecretStoreError('unavailable');}
  const file=await open(join(directory,this.slot),constants.O_CREAT|constants.O_RDWR|constants.O_NOFOLLOW,0o600).catch(()=>{throw new SecretStoreError('unavailable');});
  let child:ReturnType<typeof spawn>|undefined;
  try{
   const info=await file.stat();if(!info.isFile()||info.nlink!==1||info.uid!==process.getuid?.()||(info.mode&0o077)!==0){throw new SecretStoreError('unavailable');}
   child=spawn('/usr/bin/flock',['--nonblock','--no-fork','--conflict-exit-code','75','/proc/self/fd/3','/usr/bin/cat'],{env:this.environment,stdio:['pipe','pipe','ignore',file.fd]});
   const holder=child;await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new SecretStoreError('unavailable')),3000);holder.once('error',()=>{clearTimeout(timer);reject(new SecretStoreError('unavailable'));});holder.once('exit',code=>{clearTimeout(timer);reject(new SecretStoreError(code===75?'busy':'unavailable'));});holder.stdin!.on('error',()=>{});holder.stdout!.once('data',data=>{clearTimeout(timer);if(data.toString()==='ready\n'){resolve();}else{reject(new SecretStoreError('unavailable'));}});holder.stdin!.write('ready\n');});
   return await work();
  }finally{if(child){child.stdin?.end();if(child.exitCode===null&&child.signalCode===null){await new Promise<void>(resolve=>{const timer=setTimeout(()=>{child!.kill('SIGKILL');resolve();},1000);child!.once('exit',()=>{clearTimeout(timer);resolve();});});}}await file.close();}
 }
 private async invoke(op:'store'|'lookup'|'clear',value?:string):Promise<string|null>{
  return new Promise((resolve,reject)=>{
   const args=[op,...(op==='store'?['--label=Allura device credential']:[]),'application','allura-memory-device-v1','slot',this.slot];
   const child=spawn('/usr/bin/secret-tool',args,{env:this.environment,stdio:['pipe','pipe','pipe']});const chunks:Buffer[]=[];let bytes=0,diagnostic=false,settled=false;
   const fail=()=>{if(!settled){settled=true;clearTimeout(timer);child.kill('SIGKILL');reject(new SecretStoreError('unavailable'));}};
   const timer=setTimeout(fail,3000);child.once('error',fail);child.stdin.on('error',fail);
   child.stdout.on('data',(data:Buffer)=>{bytes+=data.length;if(bytes>16384){fail();}else{chunks.push(data);}});child.stderr.on('data',()=>{diagnostic=true;});
   child.once('close',code=>{if(settled){return;}settled=true;clearTimeout(timer);const output=Buffer.concat(chunks).toString('utf8');if(code===0){resolve(output.endsWith('\n')?output.slice(0,-1):output);}else if(op==='lookup'&&code===1&&!diagnostic&&!output){resolve(null);}else{reject(new SecretStoreError('unavailable'));}});
   child.stdin.end(value??'');
  });
 }
 async read():Promise<string|null>{const value=await this.invoke('lookup');if(value!==null&&Buffer.byteLength(value)>8192){throw new SecretStoreError('unavailable');}return value;}
 async write(value:string):Promise<void>{if(typeof value!=='string'||!value||Buffer.byteLength(value)>8192||value.includes('\0')){throw new SecretStoreError('invalid');}await this.invoke('store',value);if(await this.read()!==value){throw new SecretStoreError('unavailable');}}
 async clear():Promise<void>{await this.invoke('clear');if(await this.read()!==null){throw new SecretStoreError('unavailable');}}
}
