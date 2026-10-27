import {test,expect,beforeAll,afterAll} from 'bun:test';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {type CallToolResult,type TextContent} from '@modelcontextprotocol/sdk/types.js';
import {packConsumer} from '../scripts/pack-consumer.ts';
import {fixture} from './lifecycle-fixture.ts';
import {createCoreGateway} from '../src/core-api.ts';
import {loadLocalEmbedder} from '../src/embedding.ts';
import {submitProposal} from '../src/proposals.ts';
import {decideProposal} from '../src/decisions.ts';
let f:Awaited<ReturnType<typeof fixture>>,directory:string,nodeExecutable:string,server:ReturnType<typeof Bun.serve>,env:Record<string,string>,receipt:Record<string,unknown>;
async function run(args:string[],input:unknown,environment=env){const executable=args[0]==='node'?nodeExecutable:args[0]==='bun'?process.execPath:args[0]!;const proc=Bun.spawn([executable,...args.slice(1)],{cwd:directory,env:environment,stdin:'pipe',stdout:'pipe',stderr:'pipe',timeout:20000});proc.stdin.write(JSON.stringify(input));proc.stdin.end();const [stdout,stderr,exit]=await Promise.all([new Response(proc.stdout).text(),new Response(proc.stderr).text(),proc.exited]);if(exit){console.log(JSON.stringify({consumerFailure:{command:args[0],exit,stderr:stderr.replaceAll(environment.ALLURA_TOKEN!,'[redacted]')}}));}return {stdout,stderr,exit};}
beforeAll(async()=>{
 const resolved=Bun.spawnSync(['node','-p','process.execPath'],{stdout:'pipe',stderr:'pipe',timeout:10000});nodeExecutable=resolved.stdout.toString().trim();if(resolved.exitCode!==0||!nodeExecutable.startsWith('/')){throw new Error('Pinned Node discovery failed');}
 const version=Bun.spawnSync([nodeExecutable,'--version'],{env:{PATH:process.env.PATH!},stdout:'pipe',stderr:'pipe',timeout:10000});expect(version.exitCode).toBe(0);expect(version.stdout.toString().trim()).toBe('v24.19.0');
 const packed=await packConsumer();console.log(JSON.stringify({packedConsumer:packed}));directory=await mkdtemp(join(tmpdir(),'allura-clean-consumer-'));
 await writeFile(join(directory,'package.json'),JSON.stringify({name:'isolated-consumer',private:true,type:'module',dependencies:{'@allura/memory-consumer':`file:${packed.tarball}`}}));
 const install=Bun.spawnSync(['bun','install','--ignore-scripts'],{cwd:directory,stdout:'pipe',stderr:'pipe',timeout:60000});if(install.exitCode!==0){throw new Error('Clean consumer install failed');}
 expect(Bun.spawnSync(['bun','install','--frozen-lockfile','--ignore-scripts'],{cwd:directory,stdout:'pipe',stderr:'pipe',timeout:60000}).exitCode).toBe(0);
 const sdkScript="import {AlluraClient} from '@allura/memory-consumer';const c=new AlluraClient({endpoint:process.env.ALLURA_ENDPOINT,groupId:process.env.ALLURA_GROUP_ID,workspaceId:process.env.ALLURA_WORKSPACE_ID,token:async()=>process.env.ALLURA_TOKEN,allowLoopback:true});try{const chunks=[];for await(const part of process.stdin){chunks.push(part);}const input=JSON.parse(Buffer.concat(chunks).toString());await c.connect();const data=await c[input.method](input.args);console.log(JSON.stringify({resolved:import.meta.resolve('@allura/memory-consumer'),data}));}catch(e){console.error(JSON.stringify({outcome:e.outcome??'unknown'}));process.exitCode=1;}finally{await c.close();}";
 await writeFile(join(directory,'smoke.js'),sdkScript);
 await writeFile(join(directory,'types.mts'),"import {AlluraClient,type AddInput} from '@allura/memory-consumer';import {PersistentDevice,type DeviceOptions} from '@allura/memory-consumer/device';declare const options:DeviceOptions;void new PersistentDevice(options).connect();declare const client:AlluraClient;const input:AddInput={content:'typed',idempotency_key:'typed'};void client.add(input);\n");
 const typed=Bun.spawnSync(['node',join(import.meta.dir,'../node_modules/typescript/bin/tsc'),'--strict','--noEmit','--skipLibCheck','--target','ES2022','--module','NodeNext','--moduleResolution','NodeNext','types.mts'],{cwd:directory,stdout:'pipe',stderr:'pipe',timeout:20000});expect(typed.exitCode).toBe(0);
 f=await fixture('allura-packed-consumer');const token=randomBytes(32).toString('hex'),digest=createHash('sha256').update(token).digest('hex');
 await f.owner`INSERT INTO allura.machine_credentials(principal_id,digest,group_id,workspace_id,actions,expires_at) VALUES(${f.ids.machine}::uuid,decode(${digest},'hex'),${f.scope.groupId},${f.scope.workspaceId}::uuid,ARRAY['memory:read','memory:capture'],clock_timestamp()+interval '1 hour')`;
 server=Bun.serve({hostname:'127.0.0.1',port:0,fetch:createCoreGateway(f.app,f.humanConfig,'https://packed.invalid',randomBytes(32),await loadLocalEmbedder())});
 env={PATH:process.env.PATH!,ALLURA_ENDPOINT:`http://127.0.0.1:${server.port}/mcp`,ALLURA_GROUP_ID:f.scope.groupId,ALLURA_WORKSPACE_ID:f.scope.workspaceId,ALLURA_TOKEN:token,ALLURA_ALLOW_LOOPBACK:'1'};
},120000);
afterAll(async()=>{await server?.stop(true);await f?.close();if(directory){await rm(directory,{recursive:true,force:true});}});
test('clean packed SDK declarations Node and Bun clients execute real receipt replay without source imports',async()=>{
 const input={method:'add',args:{content:'Packed amber navigation observation',idempotency_key:'packed-sdk'}},node=await run(['node','smoke.js'],input),bun=await run(['bun','smoke.js'],input);expect(node.exit).toBe(0);expect(bun.exit).toBe(0);
 const n=JSON.parse(node.stdout),b=JSON.parse(bun.stdout);expect(n).toEqual(b);expect(n.resolved).toContain(directory+'/node_modules/@allura/memory-consumer/');expect(n.resolved).not.toContain('/foundation/src/');receipt=n.data;expect(receipt.promotion).toBe('not_requested');
 const get=await run(['node','smoke.js'],{method:'get',args:{kind:'receipt',id:receipt.receipt_id}});expect(get.exit).toBe(0);expect(JSON.parse(get.stdout).data).toEqual(receipt);
});
test('packed CLI and actual stdio MCP client share governed remote contracts and redact credentials',async()=>{
 const path='node_modules/@allura/memory-consumer/dist/consumer-cli.js',input={content:'Packed CLI observation',idempotency_key:'packed-cli'},first=await run(['node',path,'memory_add'],input),replay=await run(['node',path,'memory_add'],input);expect(first.exit).toBe(0);expect(first.stdout).toBe(replay.stdout);expect(first.stderr).toContain('append-only');expect(first.stderr).not.toContain(env.ALLURA_TOKEN!);
 const cliReceipt=JSON.parse(first.stdout),transport=new StdioClientTransport({command:nodeExecutable,args:[join(directory,'node_modules/@allura/memory-consumer/dist/consumer-mcp.js')],env,stderr:'pipe'}),client=new Client({name:'actual-stdio-consumer',version:'1'});let stderr='';transport.stderr?.on('data',chunk=>{stderr+=String(chunk);});
 try{await client.connect(transport,{timeout:10000});expect((await client.listTools()).tools).toHaveLength(5);const result=await client.callTool({name:'memory_get',arguments:{kind:'receipt',id:cliReceipt.receipt_id}}) as CallToolResult;expect(JSON.parse((result.content[0] as TextContent).text)).toEqual(cliReceipt);expect(stderr).not.toContain(env.ALLURA_TOKEN!);}finally{await client.close();}
});
test('packed second principal reuses approved record and exact revision deletion honors current grants',async()=>{
 const proposal=await submitProposal(f.app,f.identities.machine,f.scope,{summary:'Packed amber navigation knowledge',assertionKind:'observation',evidenceIds:[String(receipt.event_id)]});
 const approved=JSON.parse(await decideProposal(f.app,f.identities.reviewer,f.scope,{proposalId:proposal.id,reviewedProposalVersion:1,decision:'approve',rationale:'Independent fixture approval',evidenceIds:[receipt.event_id],operationKey:randomUUID()}));
 const principal=randomUUID(),token=randomBytes(32).toString('hex'),digest=createHash('sha256').update(token).digest('hex');
 await f.owner`INSERT INTO allura.principals(id,kind) VALUES(${principal}::uuid,'service')`;await f.owner`INSERT INTO allura.memberships(group_id,principal_id) VALUES(${f.scope.groupId},${principal}::uuid)`;
 await f.owner`INSERT INTO allura.workspace_grants(group_id,workspace_id,principal_id,role,issuer) VALUES(${f.scope.groupId},${f.scope.workspaceId}::uuid,${principal}::uuid,'viewer',${f.ids.author}::uuid)`;
 await f.owner`INSERT INTO allura.machine_credentials(principal_id,digest,group_id,workspace_id,actions,expires_at) VALUES(${principal}::uuid,decode(${digest},'hex'),${f.scope.groupId},${f.scope.workspaceId}::uuid,ARRAY['memory:read','memory:delete'],clock_timestamp()+interval '1 hour')`;
 const second={...env,ALLURA_TOKEN:token},get=await run(['node','smoke.js'],{method:'get',args:{id:approved.semantic_version_id}},second);expect(get.exit).toBe(0);expect(JSON.parse(get.stdout).data.content).toBe('Packed amber navigation knowledge');
 const search=await run(['bun','smoke.js'],{method:'search',args:{query:'amber',status:'approved'}},second);expect(search.exit).toBe(0);expect(JSON.parse(search.stdout).data.results[0].id).toBe(approved.semantic_version_id);
 const deletion={method:'delete',args:{memoryId:approved.semantic_version_id,expectedHeadRevision:1,reason:'Explicit fixture removal',operationKey:'packed-delete'}};
 const denied=await run(['node','smoke.js'],deletion,second);expect(denied.exit).toBe(1);expect(denied.stderr).toContain('forbidden');
 // Existing immutable authority contract makes admin grants human-only.
 await expect(f.owner`UPDATE allura.workspace_grants SET role='workspace_admin' WHERE group_id=${f.scope.groupId} AND principal_id=${principal}::uuid`.execute()).rejects.toThrow('human grant required');
 const human=new Client({name:'signed-human-delete',version:'1'}),humanUrl=new URL('/mcp/human',env.ALLURA_ENDPOINT);humanUrl.searchParams.set('group_id',f.scope.groupId);humanUrl.searchParams.set('workspace_id',f.scope.workspaceId);
 await human.connect(new StreamableHTTPClientTransport(humanUrl,{requestInit:{headers:{'Cf-Access-Jwt-Assertion':f.jwt('author'),Origin:'https://packed.invalid','Sec-Fetch-Site':'same-origin'}}}));
 try{const deleted=await human.callTool({name:'memory_delete',arguments:deletion.args}) as CallToolResult;expect(deleted.isError).not.toBe(true);expect(await human.callTool({name:'memory_delete',arguments:deletion.args})).toEqual(deleted);
 const stale=await human.callTool({name:'memory_delete',arguments:{...deletion.args,operationKey:'stale-delete'}}) as CallToolResult;expect(stale.isError).toBe(true);expect((stale.content[0] as TextContent).text).toContain('conflict');
 }finally{await human.close();}
 const list=await run(['node','smoke.js'],{method:'list',args:{}},second);expect(list.exit).toBe(0);expect(JSON.parse(list.stdout).data.items).toEqual([]);
 await f.owner`UPDATE allura.workspace_grants SET active=false WHERE group_id=${f.scope.groupId} AND principal_id=${principal}::uuid`;
 const revoked=await run(['node','smoke.js'],{method:'list',args:{}},second);expect(revoked.exit).toBe(1);expect(revoked.stderr).not.toContain(token);
 expect((await readFile(join(directory,'node_modules/@allura/memory-consumer/package.json'),'utf8'))).toContain('0.1.0-dev.1');
},20000);
test('consumer packing preserves existing artifacts in caller supplied directories',async()=>{
 const root=await mkdtemp(join(tmpdir(),'allura-pack-preserve-')),filename=join(root,'allura-memory-consumer-0.1.0-dev.1.tgz');await writeFile(filename,'owned sentinel artifact');
 try{const result=await packConsumer(root);expect(await readFile(filename,'utf8')).toBe('owned sentinel artifact');expect(result.tarball).not.toBe(filename);expect((await readFile(result.receipt,'utf8'))).toContain(result.sha256);}finally{await rm(root,{recursive:true,force:true});}
},20000);
test('packed CLI and stdio reject oversized frames with no protocol or credential spill',async()=>{
 const cli=await run(['node','node_modules/@allura/memory-consumer/dist/consumer-cli.js','memory_add'],{content:'x'.repeat(60001),operationKey:'too-large'});expect(cli.exit).toBe(1);expect(cli.stdout).toBe('');expect(cli.stderr).not.toContain(env.ALLURA_TOKEN!);
 const stdio=await run(['node','node_modules/@allura/memory-consumer/dist/consumer-mcp.js'],{jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'memory_add',arguments:{content:'x'.repeat(65536)}}});expect(stdio.exit).toBe(1);expect(stdio.stdout).toBe('');expect(stdio.stderr).toContain('"outcome":"invalid"');expect(stdio.stderr).not.toContain(env.ALLURA_TOKEN!);
},20000);
