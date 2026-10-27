import {expect,test} from 'bun:test';
import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import {LinuxDeviceSecretStore} from '../src/device-secret-store.ts';
import {platformFixture} from './device-platform-fixture.ts';
test('real isolated Linux Secret Service persists scoped secrets without plaintext fallback',async()=>{
 const platform=await platformFixture(),{root,env}=platform;
 try{
  const scope={endpoint:'https://memory.invalid/mcp',groupId:'allura-store-fixture',workspaceId:randomUUID(),profileId:randomUUID()},store=new LinuxDeviceSecretStore(scope,env),value=randomBytes(32).toString('base64url');
  let stored=false;for(let i=0;i<5&&!stored;i++){try{await store.write(value);stored=true;}catch{await Bun.sleep(100);}}expect(stored).toBe(true);
  expect(await store.read()).toBe(value);expect(await new LinuxDeviceSecretStore(scope,env).read()).toBe(value);
  const script=`import {LinuxDeviceSecretStore} from ${JSON.stringify(new URL('../src/device-secret-store.ts',import.meta.url).href)};const p=JSON.parse(await Bun.stdin.text());if(await new LinuxDeviceSecretStore(p.scope).read()!==p.value)process.exit(1);`;
  const child=Bun.spawnSync([process.execPath,'--eval',script],{env,stdin:Buffer.from(JSON.stringify({scope,value})),stdout:'pipe',stderr:'pipe',timeout:5000});expect(child.exitCode).toBe(0);expect(child.stdout.length+child.stderr.length).toBe(0);
  const files=await readdir(env.XDG_DATA_HOME,{recursive:true});expect(files.some(p=>p.endsWith('.keyring'))).toBe(true);for(const p of files.filter(p=>p.endsWith('.keyring'))){expect((await readFile(join(env.XDG_DATA_HOME,p))).includes(Buffer.from(value))).toBe(false);}
  const foreign=new LinuxDeviceSecretStore({...scope,groupId:'allura-foreign'},env);expect(await foreign.read()).toBeNull();
  const other=new LinuxDeviceSecretStore({...scope,workspaceId:randomUUID()},env),second=randomBytes(32).toString('base64url');await Promise.all([store.write(value),other.write(second)]);expect(await other.read()).toBe(second);expect(await store.read()).toBe(value);
  await store.clear();expect(await store.read()).toBeNull();expect(await other.read()).toBe(second);await other.clear();
  await expect(store.write('x'.repeat(8193))).rejects.toThrow('secure_store_invalid');
  expect(()=>new LinuxDeviceSecretStore({...scope,endpoint:'http://evil.invalid/mcp'},env)).toThrow('secure_store_invalid');
  await expect(new LinuxDeviceSecretStore(scope,{...env,DBUS_SESSION_BUS_ADDRESS:`unix:path=${join(root,'missing')}`}).read()).rejects.toThrow('secure_store_unavailable');
  await store.write(value);platform.lock();let denied=false;try{denied=await store.read()===null;}catch(error){denied=error instanceof Error&&error.message==='secure_store_unavailable';}expect(denied).toBe(true);
 }finally{await platform.close();}
},30000);
test('real store serializes same profile mutations and releases its lock on process death',async()=>{
 const platform=await platformFixture();try{
  const scope={endpoint:'https://memory.invalid/mcp',groupId:'allura-store-fixture',workspaceId:randomUUID(),profileId:randomUUID()},store=new LinuxDeviceSecretStore(scope,platform.env);
  let release!:()=>void,ready!:()=>void;const started=new Promise<void>(r=>{ready=r;}),hold=store.exclusive(async()=>{ready();await new Promise<void>(r=>{release=r;});});await started;
  await expect(new LinuxDeviceSecretStore(scope,platform.env).exclusive(async()=>true)).rejects.toThrow('secure_store_busy');release();await hold;
  expect(await store.exclusive(async()=>42)).toBe(42);
  expect(await store.exclusive(()=>new LinuxDeviceSecretStore({...scope,profileId:randomUUID()},platform.env).exclusive(async()=>44))).toBe(44);
  const script=`import {LinuxDeviceSecretStore} from ${JSON.stringify(new URL('../src/device-secret-store.ts',import.meta.url).href)};const scope=JSON.parse(await Bun.stdin.text());await new LinuxDeviceSecretStore(scope).exclusive(async()=>{process.stdout.write('ready');await new Promise(()=>{});});`;
  const child=Bun.spawn([process.execPath,'--eval',script],{env:platform.env,stdin:Buffer.from(JSON.stringify(scope)),stdout:'pipe',stderr:'pipe'});try{const reader=child.stdout.getReader(),result=await Promise.race([reader.read(),Bun.sleep(5000).then(()=>{throw new Error('child_not_ready');})]);expect(new TextDecoder().decode(result.value)).toBe('ready');reader.releaseLock();child.kill('SIGKILL');await child.exited;await Bun.sleep(100);expect(await store.exclusive(async()=>43)).toBe(43);}finally{child.kill('SIGKILL');await child.exited;}
 }finally{await platform.close();}
},30000);
