import {test,expect,beforeAll,afterAll} from 'bun:test';
import {randomUUID,createHash} from 'node:crypto';
import {fixture} from './lifecycle-fixture.ts';
import {capture} from '../src/capture.ts';
import {configureBumblebeeSource,approveBumblebeeCatalog,readBumblebeeSource,invalidateBumblebeeCatalog,parseBumblebeeCatalog} from '../src/bumblebee-configuration.ts';
import {createBumblebeeConfigurationGateway} from '../src/bumblebee-configuration-api.ts';
let f:Awaited<ReturnType<typeof fixture>>;
beforeAll(async()=>{f=await fixture('allura-bumblebee-config');});afterAll(async()=>{await f?.close();});
async function request(){const evidenceId=JSON.parse(await capture(f.app,f.identities.machine,f.scope,{idempotency_key:randomUUID(),content:'Synthetic source authorization evidence'})).event_id as string;return {source:{sourceId:randomUUID(),endpointId:randomUUID(),profile:'project' as const,roots:[{digest:'a'.repeat(64),kind:'project_root' as const}],ecosystems:['npm'] as const,catalogRevisionId:null},expectedRevision:0,enabled:true,rationale:'Explicit synthetic enrollment',evidenceIds:[evidenceId],operationKey:randomUUID()};}
function catalog(sourceId:string,evidenceIds:string[]){const now=Date.now();return {sourceId,revisionId:randomUUID(),publisher:'synthetic-security-team',sourceUrl:'https://catalog.example.invalid/reviewed',publishedAt:now-2000,fetchedAt:now-1000,expiresAt:now+600000,entries:[{id:randomUUID(),ecosystem:'npm',name:'example-pkg',version:'1.2.3',severity:'high'}],rationale:'Reviewed internal synthetic catalog',evidenceIds,operationKey:randomUUID()};}
test('Bumblebee configuration binds human source revision evidence and exact concurrent replay',async()=>{
 const input=await request(),results=await Promise.all([1,2].map(()=>configureBumblebeeSource(f.app,f.identities.author,f.scope,input)));expect(results[0]).toBe(results[1]);const receipt=JSON.parse(results[0]!);expect(receipt.revision).toBe(1);expect(receipt.sourceId).toBe(input.source.sourceId);
 const current=await readBumblebeeSource(f.app,f.identities.author,f.scope,input.source.sourceId);expect(current.revision).toBe(1);expect(current.enabled).toBe(true);expect(current.source).toEqual(input.source);expect(current.ownerId).toBe(f.ids.author);
 await expect(configureBumblebeeSource(f.app,f.identities.author,f.scope,{...input,rationale:'changed'})).rejects.toThrow('bumblebee_conflict');
 const changed={...input,expectedRevision:1,enabled:false,operationKey:randomUUID()};const outcomes=await Promise.allSettled([configureBumblebeeSource(f.app,f.identities.author,f.scope,changed),configureBumblebeeSource(f.app,f.identities.author,f.scope,{...changed,operationKey:randomUUID()})]);expect(outcomes.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(outcomes.filter(r=>r.status==='rejected')).toHaveLength(1);expect((await readBumblebeeSource(f.app,f.identities.author,f.scope,input.source.sourceId)).revision).toBe(2);
 const [history]=await f.owner`SELECT count(*)::int AS n FROM allura.bumblebee_source_revisions WHERE group_id=${f.scope.groupId} AND source_id=${input.source.sourceId}::uuid`;expect(history.n).toBe(2);
});
test('Bumblebee configuration rejects implicit machine foreign and revoked authority before disclosure',async()=>{
 const input=await request();for(const identity of [f.identities.org,f.identities.viewer,f.identities.curator,f.identities.machine]){await expect(configureBumblebeeSource(f.app,identity,f.scope,input)).rejects.toThrow('forbidden');}
 await expect(configureBumblebeeSource(f.app,f.identities.author,{...f.scope,workspaceId:f.foreignWorkspace},input)).rejects.toThrow('forbidden');
 await expect(configureBumblebeeSource(f.app,f.identities.author,f.scope,{...input,evidenceIds:[randomUUID()]})).rejects.toThrow('bumblebee_not_found');
 await expect(configureBumblebeeSource(f.app,f.identities.author,f.scope,{...input,source:{...input.source,role:'admin'}} as never)).rejects.toThrow('bumblebee_invalid');
 await configureBumblebeeSource(f.app,f.identities.author,f.scope,input);
 await f.owner`UPDATE allura.workspace_grants SET active=false WHERE group_id=${f.scope.groupId} AND principal_id=${f.ids.author}::uuid`;
 try{await expect(configureBumblebeeSource(f.app,f.identities.author,f.scope,input)).rejects.toThrow('forbidden');await expect(readBumblebeeSource(f.app,f.identities.author,f.scope,input.source.sourceId)).rejects.toThrow('forbidden');}finally{await f.owner`UPDATE allura.workspace_grants SET active=true WHERE group_id=${f.scope.groupId} AND principal_id=${f.ids.author}::uuid`;}
});
test('Bumblebee catalog approval pins normalized provenance stable entries and explicit source binding',async()=>{
 const input=await request();await configureBumblebeeSource(f.app,f.identities.author,f.scope,input);const c=catalog(input.source.sourceId,input.evidenceIds),receipt=await approveBumblebeeCatalog(f.app,f.identities.author,f.scope,c);expect(await approveBumblebeeCatalog(f.app,f.identities.author,f.scope,c)).toBe(receipt);
 const parsed=parseBumblebeeCatalog(c,Date.now()),r=JSON.parse(receipt);expect(r.catalogDigest).toBe(createHash('sha256').update(JSON.stringify(parsed.catalog)).digest('hex'));expect(parsed.catalog.verificationRule).toBe('human-reviewed-sha256');expect(parsed.catalog.retention).toBe('append-only');
 await configureBumblebeeSource(f.app,f.identities.author,f.scope,{...input,expectedRevision:1,source:{...input.source,catalogRevisionId:c.revisionId},operationKey:randomUUID()});expect((await readBumblebeeSource(f.app,f.identities.author,f.scope,input.source.sourceId)).source.catalogRevisionId).toBe(c.revisionId);
 const changed={...c,revisionId:randomUUID(),entries:[{...c.entries[0]!,version:'9.9.9'}],operationKey:randomUUID()};await expect(approveBumblebeeCatalog(f.app,f.identities.author,f.scope,changed)).rejects.toThrow('bumblebee_conflict');
 const other=await request();await configureBumblebeeSource(f.app,f.identities.author,f.scope,other);await expect(configureBumblebeeSource(f.app,f.identities.author,f.scope,{...other,expectedRevision:1,source:{...other.source,catalogRevisionId:c.revisionId},operationKey:randomUUID()})).rejects.toThrow('bumblebee_not_found');
 await invalidateBumblebeeCatalog(f.app,f.identities.author,f.scope,{sourceId:input.source.sourceId,revisionId:c.revisionId,rationale:'Synthetic invalidation',evidenceIds:input.evidenceIds,operationKey:randomUUID()});expect((await readBumblebeeSource(f.app,f.identities.author,f.scope,input.source.sourceId)).catalogState).toBe('rejected');
 await expect(configureBumblebeeSource(f.app,f.identities.author,f.scope,{...input,expectedRevision:2,source:{...input.source,catalogRevisionId:c.revisionId},operationKey:randomUUID()})).rejects.toThrow('bumblebee_forbidden');
 // Disabling never activates the catalog and must remain available after invalidation.
 await configureBumblebeeSource(f.app,f.identities.author,f.scope,{...input,expectedRevision:2,enabled:false,source:{...input.source,catalogRevisionId:c.revisionId},operationKey:randomUUID()});expect((await readBumblebeeSource(f.app,f.identities.author,f.scope,input.source.sourceId)).enabled).toBe(false);
});
test('Bumblebee catalog rejects malformed provenance time authority and executable metadata',async()=>{
 const input=await request(),c=catalog(input.source.sourceId,input.evidenceIds),now=Date.now();
 for(const value of [{...c,sourceUrl:'http://catalog.invalid'},{...c,sourceUrl:'https://user:pass@catalog.invalid'},{...c,sourceUrl:'https://catalog.invalid/?token=x'},{...c,publishedAt:now+10000},{...c,expiresAt:now+8*86400000},{...c,fetchedAt:c.publishedAt-1},{...c,entries:[{...c.entries[0]!,command:'execute'}]},{...c,entries:Array(129).fill(c.entries[0])},{...c,entries:new Array(1)},{...c,entries:[{...c.entries[0]!,version:'^1.0.0'}]},{...c,classification:'public'},{...c,approved:true}]){expect(()=>parseBumblebeeCatalog(value,now)).toThrow('bumblebee_invalid');}
 await expect(approveBumblebeeCatalog(f.app,f.identities.author,f.scope,c)).rejects.toThrow('bumblebee_not_found');
 await configureBumblebeeSource(f.app,f.identities.author,f.scope,input);await expect(approveBumblebeeCatalog(f.app,f.identities.machine,f.scope,c)).rejects.toThrow('forbidden');
});
test('Bumblebee configuration audit failures roll back and private immutable tables reject direct writes',async()=>{
 const input=await request();await f.owner.unsafe("CREATE FUNCTION allura.bumblebee_config_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture failure'; END $$; CREATE CONSTRAINT TRIGGER bumblebee_config_test_fail AFTER INSERT ON allura.bumblebee_config_receipts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION allura.bumblebee_config_test_fail()");
 try{await expect(configureBumblebeeSource(f.app,f.identities.author,f.scope,input)).rejects.toThrow('bumblebee_unknown');}finally{await f.owner.unsafe('DROP TRIGGER bumblebee_config_test_fail ON allura.bumblebee_config_receipts; DROP FUNCTION allura.bumblebee_config_test_fail()');}
 for(const table of ['bumblebee_source_heads','bumblebee_source_revisions']){expect((await f.owner.unsafe(`SELECT count(*)::int AS n FROM allura.${table} WHERE group_id=$1 AND source_id=$2`,[f.scope.groupId,input.source.sourceId]))[0].n).toBe(0);await expect(f.app.unsafe(`SELECT * FROM allura.${table}`).execute()).rejects.toThrow();}
 await configureBumblebeeSource(f.app,f.identities.author,f.scope,input);
 for(const table of ['bumblebee_source_revisions','bumblebee_catalog_revisions','bumblebee_catalog_entries','bumblebee_config_receipts']){await expect(f.owner.unsafe(`TRUNCATE allura.${table} CASCADE`).execute()).rejects.toThrow('append-only');}
 await expect(f.owner`DELETE FROM allura.bumblebee_source_revisions WHERE source_id=${input.source.sourceId}::uuid`.execute()).rejects.toThrow('append-only');
 const [event]=await f.owner`SELECT count(*)::int AS n FROM allura.events WHERE group_id=${f.scope.groupId} AND kind='bumblebee_config' AND payload->>'sourceId'=${input.source.sourceId}`;expect(event.n).toBe(1);
});
test('Bumblebee catalog audit rollback preserves old trust and exact immutable history',async()=>{
 const input=await request();await configureBumblebeeSource(f.app,f.identities.author,f.scope,input);const c=catalog(input.source.sourceId,input.evidenceIds);
 const counts=async()=>Promise.all(['bumblebee_catalog_revisions','bumblebee_catalog_entries','bumblebee_catalog_state','bumblebee_config_receipts','events'].map(async table=>(await f.owner.unsafe(`SELECT count(*)::int AS n FROM allura.${table} WHERE group_id=$1`,[f.scope.groupId]))[0].n));
 const before=await counts();await f.owner.unsafe("CREATE FUNCTION allura.bumblebee_catalog_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture failure'; END $$; CREATE CONSTRAINT TRIGGER bumblebee_catalog_test_fail AFTER INSERT ON allura.bumblebee_config_receipts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION allura.bumblebee_catalog_test_fail()");
 try{await expect(approveBumblebeeCatalog(f.app,f.identities.author,f.scope,c)).rejects.toThrow('bumblebee_unknown');expect(await counts()).toEqual(before);}finally{await f.owner.unsafe('DROP TRIGGER bumblebee_catalog_test_fail ON allura.bumblebee_config_receipts; DROP FUNCTION allura.bumblebee_catalog_test_fail()');}
 const receipt=await approveBumblebeeCatalog(f.app,f.identities.author,f.scope,c);expect(await approveBumblebeeCatalog(f.app,f.identities.author,f.scope,c)).toBe(receipt);
 await configureBumblebeeSource(f.app,f.identities.author,f.scope,{...input,expectedRevision:1,source:{...input.source,catalogRevisionId:c.revisionId},operationKey:randomUUID()});
 await f.owner.unsafe("CREATE FUNCTION allura.bumblebee_catalog_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture failure'; END $$; CREATE CONSTRAINT TRIGGER bumblebee_catalog_test_fail AFTER INSERT ON allura.bumblebee_config_receipts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION allura.bumblebee_catalog_test_fail()");
 try{await expect(invalidateBumblebeeCatalog(f.app,f.identities.author,f.scope,{sourceId:input.source.sourceId,revisionId:c.revisionId,rationale:'Synthetic fail',evidenceIds:input.evidenceIds,operationKey:randomUUID()})).rejects.toThrow('bumblebee_unknown');expect((await readBumblebeeSource(f.app,f.identities.author,f.scope,input.source.sourceId)).catalogState).toBe('approved');}finally{await f.owner.unsafe('DROP TRIGGER bumblebee_catalog_test_fail ON allura.bumblebee_config_receipts; DROP FUNCTION allura.bumblebee_catalog_test_fail()');}
 const [original]=await f.owner`SELECT receipt_text FROM allura.bumblebee_config_receipts WHERE group_id=${f.scope.groupId} AND operation_key=${c.operationKey}`;expect(original.receipt_text).toBe(receipt);
});
test('Bumblebee configuration HTTP authenticates before payload and binds CSRF scope and strict commands',async()=>{
 const input=await request(),origin='https://bumblebee.fixture.invalid',gateway=createBumblebeeConfigurationGateway(f.app,f.humanConfig,origin),server=Bun.serve({hostname:'127.0.0.1',port:0,fetch:gateway});
 const url=(path:string,extra='')=>`http://127.0.0.1:${server.port}${path}?group_id=${f.scope.groupId}&workspace_id=${f.scope.workspaceId}${extra}`;
 const headers={'Cf-Access-Jwt-Assertion':f.jwt('author'),Origin:origin,'Sec-Fetch-Site':'same-origin','content-type':'application/json'};
 const send=(body:unknown,h=headers)=>fetch(url('/api/bumblebee/source/configure'),{method:'POST',headers:h,body:JSON.stringify(body)});
 try{
  expect((await fetch(url('/api/bumblebee/source/configure'),{method:'POST',headers:{'content-type':'application/json'},body:'malformed-private-marker'})).status).toBe(401);
  expect((await send(input,{...headers,Origin:'https://foreign.invalid'})).status).toBe(403);
  expect((await send(input,{...headers,'Cf-Access-Jwt-Assertion':f.jwt('org')})).status).toBe(403);
  expect((await send({...input,groupId:'foreign-private-marker'})).status).toBe(400);
  const first=await send(input);expect(first.status).toBe(200);const receipt=await first.json();expect(await (await send(input)).json()).toEqual(receipt);
  expect((await send({...input,rationale:'changed'})).status).toBe(409);
  const read=await fetch(url('/api/bumblebee/source',`&id=${input.source.sourceId}`),{headers});expect(read.status).toBe(200);expect((await read.json() as {revision:number}).revision).toBe(1);
  expect((await fetch(url('/api/bumblebee/source',`&id=${input.source.sourceId}&id=${input.source.sourceId}`),{headers})).status).toBe(400);
  expect((await fetch(url('/api/bumblebee/source',`&id=${randomUUID()}`),{headers})).status).toBe(404);
  const c=catalog(input.source.sourceId,input.evidenceIds);expect((await fetch(url('/api/bumblebee/catalog/approve'),{method:'POST',headers,body:JSON.stringify(c)})).status).toBe(200);
  expect((await fetch(url('/api/bumblebee/catalog/invalidate'),{method:'POST',headers,body:JSON.stringify({sourceId:input.source.sourceId,revisionId:c.revisionId,rationale:'Fixture invalidation',evidenceIds:input.evidenceIds,operationKey:randomUUID()})})).status).toBe(200);
  // No runner/ingest credential API has been implemented by this configuration slice.
  expect((await fetch(url('/api/bumblebee/lease'),{method:'POST',headers,body:'{}'})).status).toBe(404);
  await f.owner`UPDATE allura.workspace_grants SET active=false WHERE group_id=${f.scope.groupId} AND principal_id=${f.ids.author}::uuid`;
  try{expect((await fetch(url('/api/bumblebee/source',`&id=${input.source.sourceId}`),{headers})).status).toBe(403);}finally{await f.owner`UPDATE allura.workspace_grants SET active=true WHERE group_id=${f.scope.groupId} AND principal_id=${f.ids.author}::uuid`;}
 }finally{await server.stop(true);}
});
