import {spawn,type ChildProcess} from 'node:child_process';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
export async function platformFixture(){
 const root=await mkdtemp(join(tmpdir(),'allura-secret-service-'));const children:ChildProcess[]=[];
 const env={PATH:'/usr/bin:/bin',HOME:root,XDG_DATA_HOME:join(root,'data'),XDG_CONFIG_HOME:join(root,'config'),XDG_RUNTIME_DIR:join(root,'runtime'),TMPDIR:root,DBUS_SESSION_BUS_ADDRESS:`unix:path=${join(root,'bus')}`};
 const close=async()=>{for(const child of children.reverse()){if(child.exitCode===null&&child.signalCode===null){await new Promise<void>(resolve=>{const timer=setTimeout(()=>{child.kill('SIGKILL');resolve();},1000);child.once('exit',()=>{clearTimeout(timer);resolve();});child.kill('SIGTERM');});}}await rm(root,{recursive:true,force:true});};
 try{
  await mkdir(env.XDG_RUNTIME_DIR,{mode:0o700});await mkdir(join(root,'control'),{mode:0o700});
  const bus=spawn('/usr/bin/dbus-daemon',['--session','--nofork',`--address=${env.DBUS_SESSION_BUS_ADDRESS}`,'--print-address'],{env,stdio:['ignore','pipe','ignore']});children.push(bus);
  await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('owned_bus_timeout')),3000);bus.once('error',()=>{clearTimeout(timer);reject(new Error('owned_bus_unavailable'));});bus.stdout!.once('data',()=>{clearTimeout(timer);resolve();});});
  const keyring=spawn('/usr/bin/gnome-keyring-daemon',['--foreground','--unlock','--components=secrets',`--control-directory=${join(root,'control')}`],{env,stdio:['pipe','ignore','ignore']});children.push(keyring);keyring.on('error',()=>{});keyring.stdin!.on('error',()=>{});keyring.stdin!.end(randomBytes(32).toString('hex'));
  for(let i=0;i<30;i++){const result=Bun.spawnSync(['/usr/bin/gdbus','call','--session','--dest','org.freedesktop.DBus','--object-path','/org/freedesktop/DBus','--method','org.freedesktop.DBus.NameHasOwner','org.freedesktop.secrets'],{env,stdout:'pipe',stderr:'pipe',timeout:1000});if(result.exitCode===0&&result.stdout.toString().includes('true')){return {root,env,close,lock:()=>{const r=Bun.spawnSync(['/usr/bin/gdbus','call','--session','--dest','org.freedesktop.secrets','--object-path','/org/freedesktop/secrets','--method','org.freedesktop.Secret.Service.Lock',"['/org/freedesktop/secrets/collection/login']"],{env,stdout:'pipe',stderr:'pipe',timeout:3000});if(r.exitCode!==0||!r.stdout.toString().includes('/org/freedesktop/secrets/collection/login')){throw new Error('owned_store_lock_failed');}}};}await Bun.sleep(100);}
  throw new Error('owned_store_unavailable');
 }catch(error){await close();throw error;}
}
