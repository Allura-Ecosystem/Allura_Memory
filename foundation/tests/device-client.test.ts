import {expect,test} from 'bun:test';
import {randomBytes,randomUUID} from 'node:crypto';
import {fixture} from './lifecycle-fixture.ts';
import {platformFixture} from './device-platform-fixture.ts';
import {createCoreGateway} from '../src/core-api.ts';
import {loadLocalEmbedder} from '../src/embedding.ts';
import {PersistentDevice} from '../src/device-client.ts';
import {LinuxDeviceSecretStore} from '../src/device-secret-store.ts';
import {AlluraClient} from '../src/consumer-client.ts';
import {packConsumer} from '../scripts/pack-consumer.ts';
import {mkdir,writeFile,readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
test('persistent device reconciles lost responses using actual secure store HTTP and MCP',async()=>{
 const f=await fixture(`allura-client-${randomUUID()}`),platform=await platformFixture(),origin='https://devices.invalid';
 const gateway=createCoreGateway(f.app,f.humanConfig,origin,randomBytes(32),await loadLocalEmbedder());let drop=false,pause:{ready:()=>void;wait:Promise<void>}|undefined;
 const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch:async request=>{const result=await gateway(request);if(pause&&request.url.includes('/api/devices/command')&&result.status===200){const gate=pause;pause=undefined;gate.ready();await gate.wait;}if(drop&&request.url.includes('/api/devices/command')&&result.status===200){drop=false;return new Response('',{status:504});}return result;}});
 const options={endpoint:`http://127.0.0.1:${server.port}/mcp`,...f.scope,profileId:randomUUID(),humanOrigin:origin,allowLoopback:true},device=new PersistentDevice(options,platform.env);
 try{
  drop=true;await expect(device.begin('Real platform',['memory:read','memory:capture'],f.jwt('curator'))).rejects.toThrow('unknown');
  const pending=await new PersistentDevice(options,platform.env).resume(f.jwt('curator'));expect(pending.outcome).toBe('pending');
  const url=new URL('/api/devices/command',options.endpoint);url.searchParams.set('group_id',f.scope.groupId);url.searchParams.set('workspace_id',f.scope.workspaceId);
  const approved=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,'Sec-Fetch-Site':'same-origin','Cf-Access-Jwt-Assertion':f.jwt('author')},body:JSON.stringify({kind:'approve',enrollmentId:pending.enrollmentId,expectedRevision:1,actions:['memory:read','memory:capture']})});expect(approved.status).toBe(200);
  drop=true;await expect(device.resume(f.jwt('curator'))).rejects.toThrow('unknown');const issued=await new PersistentDevice(options,platform.env).resume(f.jwt('curator'));expect(issued.outcome).toBe('issued');
  const rawStore=new LinuxDeviceSecretStore(options,platform.env,true),active=JSON.parse((await rawStore.read())!) as {token:string};
  const packed=await packConsumer(),directory=join(platform.root,'consumer');await mkdir(directory);
  await writeFile(join(directory,'package.json'),JSON.stringify({private:true,type:'module',dependencies:{'@allura/memory-consumer':`file:${packed.tarball}`}}));
  expect(Bun.spawnSync([process.execPath,'install','--ignore-scripts'],{cwd:directory,stdout:'pipe',stderr:'pipe',timeout:60000}).exitCode).toBe(0);
  const script="import {PersistentDevice} from '@allura/memory-consumer/device';const chunks=[];for await(const p of process.stdin)chunks.push(p);const options=JSON.parse(Buffer.concat(chunks).toString());let client;try{client=await new PersistentDevice(options).connect();const data=await client.add({content:'Packed persistent device',idempotency_key:'packed-device'});console.log(JSON.stringify({resolved:import.meta.resolve('@allura/memory-consumer/device'),data}));}catch(e){console.error(JSON.stringify({outcome:e.outcome??'unknown'}));process.exitCode=1;}finally{await client?.close();}";
  await writeFile(join(directory,'witness.mjs'),script);const node=Bun.spawnSync(['node','-p','process.execPath'],{stdout:'pipe',stderr:'pipe'}).stdout.toString().trim();let previous='';
  for(let attempt=0;attempt<2;attempt++){const child=Bun.spawn([node,'witness.mjs'],{cwd:directory,env:platform.env,stdin:Buffer.from(JSON.stringify(options)),stdout:'pipe',stderr:'pipe',timeout:15000});const argv=await readFile(`/proc/${child.pid}/cmdline`);expect(argv.includes(Buffer.from(active.token))).toBe(false);const [stdout,stderr,exit]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);expect(exit).toBe(0);expect(stderr).toBe('');expect(stdout.includes(active.token)).toBe(false);const data=JSON.parse(stdout);expect(fileURLToPath(data.resolved).startsWith(directory+'/node_modules/')).toBe(true);expect(data.data.promotion).toBe('not_requested');if(attempt){expect(stdout).toBe(previous);}previous=stdout;}
  for(const p of (await readdir(platform.env.XDG_DATA_HOME,{recursive:true})).filter(p=>p.endsWith('.keyring'))){const bytes=await readFile(join(platform.env.XDG_DATA_HOME,p));expect(bytes.includes(Buffer.from(active.token))).toBe(false);expect(bytes.includes(Buffer.from(f.jwt('curator')))).toBe(false);}
  await expect(new PersistentDevice({...options,workspaceId:f.foreignWorkspace},platform.env).connect()).rejects.toThrow('unauthenticated');
  const foreign=new AlluraClient({...options,workspaceId:f.foreignWorkspace,token:async()=>active.token});try{await expect(foreign.connect()).rejects.toThrow();}finally{await foreign.close();}
  const client=await device.connect();try{expect((await client.add({content:'Persistent platform evidence only',idempotency_key:randomUUID()})).promotion).toBe('not_requested');}finally{await client.close();}
  let ready!:()=>void,release!:()=>void;const entered=new Promise<void>(r=>{ready=r;}),wait=new Promise<void>(r=>{release=r;});pause={ready,wait};drop=true;
  const rotating=device.rotate(f.jwt('curator')).then(()=>false,(error:unknown)=>error instanceof Error&&error.message==='unknown');try{await Promise.race([entered,Bun.sleep(5000).then(()=>{throw new Error('mutation_not_reached');})]);await expect(new PersistentDevice(options,platform.env).rotate(f.jwt('curator'))).rejects.toThrow('secure_store_busy');}finally{release();expect(await rotating).toBe(true);}
  await expect(device.connect()).rejects.toThrow('unauthenticated');expect((await new PersistentDevice(options,platform.env).resume(f.jwt('curator'))).generation).toBe(2);
  const demoted=await device.connect();try{await f.owner`UPDATE allura.workspace_grants SET role='viewer' WHERE group_id=${f.scope.groupId} AND principal_id=${f.ids.curator}::uuid`;await expect(demoted.add({content:'Denied after demotion',idempotency_key:randomUUID()})).rejects.toThrow('forbidden');await f.owner`UPDATE allura.workspace_grants SET role='curator' WHERE group_id=${f.scope.groupId} AND principal_id=${f.ids.curator}::uuid`;await expect(demoted.list()).rejects.toThrow('invalid');}finally{await demoted.close();}
  for(const kind of ['membership','lock','expiry']){const connected=await device.connect();try{
   if(kind==='membership'){await f.owner`UPDATE allura.memberships SET active=false WHERE group_id=${f.scope.groupId} AND principal_id=${f.ids.curator}::uuid`;}
   if(kind==='lock'){await f.owner`UPDATE allura.workspaces SET locked=true WHERE group_id=${f.scope.groupId} AND id=${f.scope.workspaceId}::uuid`;}
   if(kind==='expiry'){await f.owner`UPDATE allura.machine_credentials SET expires_at=clock_timestamp()-interval '1 second' WHERE principal_id=${issued.deviceId}::uuid`;}
   await expect(connected.list()).rejects.toThrow();await expect(device.connect()).rejects.toThrow();
  }finally{await connected.close();await f.owner`UPDATE allura.memberships SET active=true WHERE group_id=${f.scope.groupId} AND principal_id=${f.ids.curator}::uuid`;await f.owner`UPDATE allura.workspaces SET locked=false WHERE group_id=${f.scope.groupId} AND id=${f.scope.workspaceId}::uuid`;if(kind==='expiry'){await f.owner`UPDATE allura.machine_credentials SET expires_at=clock_timestamp()+interval '1 hour' WHERE principal_id=${issued.deviceId}::uuid`;}}}
  const replacement=await device.connect();try{await replacement.list();drop=true;await expect(device.revoke(f.jwt('curator'))).rejects.toThrow('unknown');expect((await device.resume(f.jwt('curator'))).outcome).toBe('revoked');await expect(replacement.list()).rejects.toThrow();}finally{await replacement.close();}await expect(device.connect()).rejects.toThrow('unauthenticated');
 }finally{await server.stop(true);await platform.close();await f.close();}
},120000);
