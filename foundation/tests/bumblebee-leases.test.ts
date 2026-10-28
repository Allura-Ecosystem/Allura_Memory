import {test,expect,beforeAll,afterAll} from 'bun:test';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fixture} from './lifecycle-fixture.ts';
import {capture} from '../src/capture.ts';
import {configureBumblebeeSource,approveBumblebeeCatalog,invalidateBumblebeeCatalog} from '../src/bumblebee-configuration.ts';
import {createBumblebeeLeases,issueBumblebeeRunner,revokeBumblebeeRunner} from '../src/bumblebee-leases.ts';
import {authenticateMachine} from '../src/authentication.ts';
import {DatabaseStore} from '../src/persistence.ts';
import {createBumblebeeLeaseGateway} from '../src/bumblebee-lease-api.ts';
import {createBumblebeeConfigurationGateway} from '../src/bumblebee-configuration-api.ts';
let f:Awaited<ReturnType<typeof fixture>>;
const key=randomBytes(32),keyRevision='fixture-lease-1';
beforeAll(async()=>{f=await fixture('allura-bumblebee-leases');});afterAll(async()=>{await f?.close();});
async function source(withCatalog=false){
 const evidenceIds=[JSON.parse(await capture(f.app,f.identities.machine,f.scope,{idempotency_key:randomUUID(),content:'Synthetic scanner authorization'})).event_id as string];
 const input={source:{sourceId:randomUUID(),endpointId:randomUUID(),profile:'project' as const,roots:[{digest:'a'.repeat(64),kind:'project_root' as const}],ecosystems:['npm'] as const,catalogRevisionId:null as string|null},expectedRevision:0,enabled:true,rationale:'Synthetic explicit source',evidenceIds,operationKey:randomUUID()};
 await configureBumblebeeSource(f.app,f.identities.author,f.scope,input);let revision=1;
 if(withCatalog){const now=Date.now(),catalog={sourceId:input.source.sourceId,revisionId:randomUUID(),publisher:'fixture',sourceUrl:'https://catalog.example.invalid/reviewed',publishedAt:now-2000,fetchedAt:now-1000,expiresAt:now+600000,entries:[{id:randomUUID(),ecosystem:'npm',name:'example-pkg',version:'1.2.3',severity:'high'}],rationale:'Synthetic reviewed catalog',evidenceIds,operationKey:randomUUID()};await approveBumblebeeCatalog(f.app,f.identities.author,f.scope,catalog);input.source.catalogRevisionId=catalog.revisionId;await configureBumblebeeSource(f.app,f.identities.author,f.scope,{...input,expectedRevision:1,operationKey:randomUUID()});revision=2;}
 const enrollment={sourceId:input.source.sourceId,sourceRevision:revision,rationale:'Synthetic runner issuance',evidenceIds,operationKey:randomUUID()};
 return {input,revision,enrollment};
}
const service=()=>createBumblebeeLeases(f.app,{leaseKey:key,keyRevision});
test('Bumblebee real HTTPS delivers bound credentials with certificate verification and no proxy trust',async()=>{
 const s=await source(),directory=await mkdtemp(join(tmpdir(),'bumblebee-tls-')),cert=join(directory,'cert.pem'),keyFile=join(directory,'key.pem');let server:ReturnType<typeof Bun.serve>|undefined;
 try{
  expect(Bun.spawnSync(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-keyout',keyFile,'-out',cert,'-days','1','-subj','/CN=127.0.0.1','-addext','subjectAltName=IP:127.0.0.1'],{stdout:'pipe',stderr:'pipe'}).exitCode).toBe(0);
  let handler:(r:Request)=>Promise<Response>=async()=>new Response(null,{status:503});server=Bun.serve({hostname:'127.0.0.1',port:0,tls:{cert:Bun.file(cert),key:Bun.file(keyFile)},fetch:r=>handler(r)});
  const origin=`https://127.0.0.1:${server.port}`,human=createBumblebeeConfigurationGateway(f.app,f.humanConfig,origin),lease=createBumblebeeLeaseGateway(f.app,{leaseKey:key,keyRevision});handler=r=>new URL(r.url).pathname==='/api/bumblebee/lease'?lease(r):human(r);
  const tls={ca:await Bun.file(cert).text(),rejectUnauthorized:true},headers={'Cf-Access-Jwt-Assertion':f.jwt('author'),Origin:origin,'Sec-Fetch-Site':'same-origin','content-type':'application/json'},path=`/api/bumblebee/runner/issue?group_id=${f.scope.groupId}&workspace_id=${f.scope.workspaceId}`;
  const issued=await fetch(`${origin}${path}`,{method:'POST',headers,body:JSON.stringify(s.enrollment),tls});expect(issued.status).toBe(200);const runner=await issued.json() as {token:string};
  const response=await fetch(`${origin}/api/bumblebee/lease`,{method:'POST',headers:{Authorization:`Bearer ${runner.token}`,'content-type':'application/json'},body:JSON.stringify({sourceRevision:1,operationKey:randomUUID()}),tls});expect(response.status).toBe(200);const l=await response.json() as {artifactSha256:string;sourceId:string};expect(l.sourceId).toBe(s.input.source.sourceId);expect(l.artifactSha256).toBe('3b46f98ab8fa6345a5d39c7483ff37c51b2ee7699aabe51f2a54133f357f6c7a');
  expect((await human(new Request(`http://127.0.0.1${path}`,{method:'POST',headers:{...headers,'x-forwarded-proto':'https'},body:JSON.stringify(s.enrollment)}))).status).toBe(403);
 }finally{await server?.stop(true);await rm(directory,{recursive:true,force:true});}
});
test('Bumblebee lease current authority locks bound revocation and cancelled reads cannot mint leases',async()=>{
 const s=await source(),runner=await issueBumblebeeRunner(f.app,f.identities.author,f.scope,s.enrollment),leases=service(),request={sourceRevision:1,operationKey:randomUUID()};
 let entered!:()=>void,release!:()=>void;const started=new Promise<void>(r=>{entered=r;}),wait=new Promise<void>(r=>{release=r;});
 const acquiring=leases.acquireFrom(runner.token!,async()=>{entered();await wait;return request;});await started;
 let revoked=false;const revocation=f.owner`UPDATE allura.workspace_grants SET active=false WHERE group_id=${f.scope.groupId} AND principal_id=${f.ids.author}::uuid`.execute().then(()=>{revoked=true;});
 try{await Bun.sleep(50);expect(revoked).toBe(false);release();expect((await acquiring).generation).toBe(1);await revocation;expect(revoked).toBe(true);await expect(leases.acquire(runner.token!,request)).rejects.toThrow('bumblebee_forbidden');}finally{release();await revocation;await f.owner`UPDATE allura.workspace_grants SET active=true WHERE group_id=${f.scope.groupId} AND principal_id=${f.ids.author}::uuid`;}
 const controller=new AbortController();await expect(leases.acquireFrom(runner.token!,async()=>{controller.abort();return {...request,operationKey:randomUUID()};},controller.signal)).rejects.toThrow('bumblebee_unknown');
 expect((await leases.acquire(runner.token!,{...request,operationKey:randomUUID()})).generation).toBe(2);
 for(let i=0;i<7;i++){expect((await issueBumblebeeRunner(f.app,f.identities.author,f.scope,{...s.enrollment,operationKey:randomUUID()})).token).toBeString();}await expect(issueBumblebeeRunner(f.app,f.identities.author,f.scope,{...s.enrollment,operationKey:randomUUID()})).rejects.toThrow('bumblebee_conflict');
 await configureBumblebeeSource(f.app,f.identities.author,f.scope,{...s.input,expectedRevision:1,operationKey:randomUUID()});await expect(leases.acquire(runner.token!,request)).rejects.toThrow('bumblebee_forbidden');
});
test('Bumblebee lease HTTP authenticates before body rejects mixed audiences and cancels bounded reads',async()=>{
 const s=await source(),origin='https://scanner.fixture.invalid',human=createBumblebeeConfigurationGateway(f.app,f.humanConfig,origin,{allowLoopbackFixture:true}),leases=createBumblebeeLeaseGateway(f.app,{leaseKey:key,keyRevision,allowLoopbackFixture:true}),server=Bun.serve({hostname:'127.0.0.1',port:0,fetch:r=>new URL(r.url).pathname==='/api/bumblebee/lease'?leases(r):human(r)});
 const base=`http://127.0.0.1:${server.port}`,url=`${base}/api/bumblebee/runner/issue?group_id=${f.scope.groupId}&workspace_id=${f.scope.workspaceId}`,headers={'Cf-Access-Jwt-Assertion':f.jwt('author'),Origin:origin,'Sec-Fetch-Site':'same-origin','content-type':'application/json'};
 try{
  expect((await fetch(url,{method:'POST',headers:{...headers,Origin:'https://other.invalid'},body:JSON.stringify(s.enrollment)})).status).toBe(403);
  const enrolled=await fetch(url,{method:'POST',headers,body:JSON.stringify(s.enrollment)});expect(enrolled.status).toBe(200);expect(enrolled.headers.get('cache-control')).toBe('no-store');const runner=await enrolled.json() as {token:string;receipt:{credentialId:string}};
  const req={sourceRevision:1,operationKey:randomUUID()},leaseHeaders={Authorization:`Bearer ${runner.token}`,'content-type':'application/json'},post=(body:string,h:Record<string,string>=leaseHeaders,suffix='')=>fetch(`${base}/api/bumblebee/lease${suffix}`,{method:'POST',headers:h,body});
  expect((await post('private-malformed',{...leaseHeaders,Authorization:'Bearer unknown'})).status).toBe(403);
  expect((await post(JSON.stringify(req),{...leaseHeaders,'Cf-Access-Jwt-Assertion':f.jwt('author')})).status).toBe(403);
  expect((await post(JSON.stringify(req),{...leaseHeaders,'content-encoding':'gzip'})).status).toBe(400);
  expect((await post(JSON.stringify(req),leaseHeaders,'?group_id=foreign')).status).toBe(400);
  expect((await post('x'.repeat(4097))).status).toBe(400);
  const response=await post(JSON.stringify(req));expect(response.status).toBe(200);const accepted=await response.json() as {leaseId:string;ingestToken:string};expect(accepted.leaseId).toBeString();expect(await (await post(JSON.stringify(req))).json()).toEqual(accepted);
  expect((await post(JSON.stringify(req),{...leaseHeaders,Authorization:`Bearer ${accepted.ingestToken}`})).status).toBe(403);
  expect((await fetch(url,{method:'POST',headers:{'content-type':'application/json',Authorization:`Bearer ${runner.token}`},body:'{}'})).status).toBe(401);
  const secure=createBumblebeeLeaseGateway(f.app,{leaseKey:key,keyRevision});expect((await secure(new Request(`${base}/api/bumblebee/lease`,{method:'POST',headers:{...leaseHeaders,'x-forwarded-proto':'https'},body:JSON.stringify(req)}))).status).toBe(403);
  let touched=0;const deniedBody=new ReadableStream<Uint8Array>({pull(){touched++;throw new Error('private body accessed');}},{highWaterMark:0});expect((await leases(new Request('http://127.0.0.1/api/bumblebee/lease',{method:'POST',headers:{Authorization:'Bearer unknown','content-type':'application/json'},body:deniedBody}))).status).toBe(403);expect(touched).toBe(0);
  const bounded=createBumblebeeLeaseGateway(f.app,{leaseKey:key,keyRevision,allowLoopbackFixture:true,timeoutMs:100});let cancelled=false;const stalled=new ReadableStream<Uint8Array>({cancel(){cancelled=true;}},{highWaterMark:0});expect((await bounded(new Request('http://127.0.0.1/api/bumblebee/lease',{method:'POST',headers:leaseHeaders,body:stalled}))).status).toBe(504);await Bun.sleep(50);expect(cancelled).toBe(true);
  const revokeUrl=`${base}/api/bumblebee/runner/revoke?group_id=${f.scope.groupId}&workspace_id=${f.scope.workspaceId}`;expect((await fetch(revokeUrl,{method:'POST',headers,body:JSON.stringify({sourceId:s.input.source.sourceId,credentialId:runner.receipt.credentialId,rationale:'Fixture revoke',evidenceIds:s.input.evidenceIds,operationKey:randomUUID()})})).status).toBe(200);expect((await post(JSON.stringify(req))).status).toBe(403);
 }finally{await server.stop(true);}
});
test('Bumblebee runner issuance is explicit source bound hash only and one time with safe replay',async()=>{
 const s=await source();for(const identity of [f.identities.machine,f.identities.org,f.identities.curator]){await expect(issueBumblebeeRunner(f.app,identity,f.scope,s.enrollment)).rejects.toThrow('forbidden');}
 const issued=await issueBumblebeeRunner(f.app,f.identities.author,f.scope,s.enrollment);expect(issued.token).toMatch(/^bbr1\.[A-Za-z0-9_-]{43}$/);expect(issued.receipt.sourceId).toBe(s.input.source.sourceId);
 const replay=await issueBumblebeeRunner(f.app,f.identities.author,f.scope,s.enrollment);expect(replay.token).toBeNull();expect(replay.receipt).toEqual(issued.receipt);
 await expect(issueBumblebeeRunner(f.app,f.identities.author,f.scope,{...s.enrollment,rationale:'changed'})).rejects.toThrow('bumblebee_conflict');
 await expect(authenticateMachine(issued.token!,d=>new DatabaseStore(f.app).lookupMachine(d))).rejects.toThrow('unauthenticated');
 const [row]=await f.owner`SELECT row_to_json(c)::text AS stored FROM allura.bumblebee_runners c WHERE group_id=${f.scope.groupId} AND source_id=${s.input.source.sourceId}::uuid`;expect(row.stored).not.toContain(issued.token!);expect(row.stored).toContain(createHash('sha256').update(issued.token!).digest('hex'));
 const [events]=await f.owner`SELECT jsonb_agg(payload)::text AS stored FROM allura.events WHERE group_id=${f.scope.groupId}`;expect(events.stored).not.toContain(issued.token!);
 await expect(f.app`SELECT * FROM allura.bumblebee_runners`.execute()).rejects.toThrow();
});
test('Bumblebee leases serialize monotonic generations and exact credential scoped replay without plaintext',async()=>{
 const s=await source(true),issued=await issueBumblebeeRunner(f.app,f.identities.author,f.scope,s.enrollment),leases=service(),request={sourceRevision:s.revision,operationKey:randomUUID()};
 const [a,b]=await Promise.all([leases.acquire(issued.token!,request),leases.acquire(issued.token!,request)]);expect(a).toEqual(b);expect(a!.generation).toBe(1);expect(a!.source).toEqual(s.input.source);expect(a!.catalogDigest).toMatch(/^[a-f0-9]{64}$/);expect(a!.ingestToken).toMatch(/^bbi1\.[A-Za-z0-9_-]{43}$/);expect(a!.expiresAt-a!.issuedAt).toBe(600000);
 const next=await Promise.all([1,2].map(()=>leases.acquire(issued.token!,{...request,operationKey:randomUUID()})));expect(next.map(v=>v.generation).sort()).toEqual([2,3]);
 await expect(leases.acquire(issued.token!,{...request,sourceRevision:1})).rejects.toThrow('bumblebee_conflict');
 await expect(leases.acquire(a!.ingestToken,request)).rejects.toThrow('bumblebee_forbidden');
 await expect(leases.acquire(issued.token!,{...request,sourceId:s.input.source.sourceId})).rejects.toThrow('bumblebee_invalid');
 await expect(authenticateMachine(a!.ingestToken,d=>new DatabaseStore(f.app).lookupMachine(d))).rejects.toThrow('unauthenticated');
 const [rows]=await f.owner`SELECT jsonb_agg(to_jsonb(l))::text AS stored FROM allura.bumblebee_leases l WHERE group_id=${f.scope.groupId} AND source_id=${s.input.source.sourceId}::uuid`;expect(rows.stored).not.toContain(a!.ingestToken);expect(rows.stored).not.toContain(issued.token!);expect(rows.stored).toContain(createHash('sha256').update(a!.ingestToken).digest('hex'));
 const rotated=createBumblebeeLeases(f.app,{leaseKey:randomBytes(32),keyRevision});await expect(rotated.acquire(issued.token!,request)).rejects.toThrow('bumblebee_unknown');
 await expect(createBumblebeeLeases(f.app,{leaseKey:key,keyRevision:'rotated'}).acquire(issued.token!,request)).rejects.toThrow('bumblebee_unknown');
 expect(await leases.acquire(issued.token!,request)).toEqual(a!);
});
test('Bumblebee leases recheck owner source catalog revocation and expiry before replay',async()=>{
 const s=await source(true),issued=await issueBumblebeeRunner(f.app,f.identities.author,f.scope,s.enrollment),leases=service(),request={sourceRevision:s.revision,operationKey:randomUUID()};await leases.acquire(issued.token!,request);
 for(const table of ['principals','memberships','workspace_grants','identity_bindings']){
  const where=table==='principals'?'id': 'principal_id';await f.owner.unsafe(`UPDATE allura.${table} SET active=false WHERE ${where}=$1`,[f.ids.author]);
  try{await expect(leases.acquire(issued.token!,request)).rejects.toThrow('bumblebee_forbidden');}finally{await f.owner.unsafe(`UPDATE allura.${table} SET active=true WHERE ${where}=$1`,[f.ids.author]);}
 }
 await invalidateBumblebeeCatalog(f.app,f.identities.author,f.scope,{sourceId:s.input.source.sourceId,revisionId:s.input.source.catalogRevisionId,rationale:'Fixture invalidation',evidenceIds:s.input.evidenceIds,operationKey:randomUUID()});await expect(leases.acquire(issued.token!,request)).rejects.toThrow('bumblebee_forbidden');
 const t=await source(),other=await issueBumblebeeRunner(f.app,f.identities.author,f.scope,t.enrollment),req={sourceRevision:1,operationKey:randomUUID()};await leases.acquire(other.token!,req);
 await configureBumblebeeSource(f.app,f.identities.author,f.scope,{...t.input,expectedRevision:1,enabled:false,operationKey:randomUUID()});await expect(leases.acquire(other.token!,req)).rejects.toThrow('bumblebee_forbidden');
 const u=await source(),runner=await issueBumblebeeRunner(f.app,f.identities.author,f.scope,u.enrollment);await leases.acquire(runner.token!,req);
 const revoke={sourceId:u.input.source.sourceId,credentialId:runner.receipt.credentialId,rationale:'Synthetic revoke',evidenceIds:u.input.evidenceIds,operationKey:randomUUID()};expect(await revokeBumblebeeRunner(f.app,f.identities.author,f.scope,revoke)).toEqual(await revokeBumblebeeRunner(f.app,f.identities.author,f.scope,revoke));await expect(leases.acquire(runner.token!,req)).rejects.toThrow('bumblebee_forbidden');
 const v=await source(),expired=await issueBumblebeeRunner(f.app,f.identities.author,f.scope,v.enrollment),l=await leases.acquire(expired.token!,req);await f.owner`UPDATE allura.bumblebee_lease_state SET revoked=true WHERE group_id=${f.scope.groupId} AND lease_id=${l.leaseId}::uuid`;await expect(leases.acquire(expired.token!,req)).rejects.toThrow('bumblebee_forbidden');
 // Append expired fixture rows; never mutate immutable production-style history.
 const expiredId=randomUUID(),expiredKey=randomUUID();await f.owner`INSERT INTO allura.bumblebee_leases SELECT group_id,workspace_id,source_id,${expiredId}::uuid,credential_id,source_revision,${expiredKey},100,population_digest,catalog_id,catalog_digest,issued_at-interval '1 hour',expires_at-interval '1 hour',${createHash('sha256').update(randomBytes(32)).digest('hex')},key_revision,event_id FROM allura.bumblebee_leases WHERE group_id=${f.scope.groupId} AND id=${l.leaseId}::uuid`;
 await f.owner`INSERT INTO allura.bumblebee_lease_state VALUES(${f.scope.groupId},${f.scope.workspaceId}::uuid,${v.input.source.sourceId}::uuid,${expiredId}::uuid,false)`;await expect(leases.acquire(expired.token!,{sourceRevision:1,operationKey:expiredKey})).rejects.toThrow('bumblebee_forbidden');
 const expiredRunnerId=randomUUID(),expiredToken=`bbr1.${randomBytes(32).toString('base64url')}`;await f.owner`INSERT INTO allura.bumblebee_runners SELECT group_id,workspace_id,source_id,${expiredRunnerId}::uuid,source_revision,${createHash('sha256').update(expiredToken).digest('hex')},owner_id,created_at-interval '2 days',expires_at-interval '2 days',event_id FROM allura.bumblebee_runners WHERE group_id=${f.scope.groupId} AND id=${expired.receipt.credentialId}::uuid`;
 await f.owner`INSERT INTO allura.bumblebee_runner_state VALUES(${f.scope.groupId},${f.scope.workspaceId}::uuid,${v.input.source.sourceId}::uuid,${expiredRunnerId}::uuid,false)`;await expect(leases.acquire(expiredToken,req)).rejects.toThrow('bumblebee_forbidden');
});
test('Bumblebee lease and enrollment deferred audit faults roll back counters credentials and immutable history',async()=>{
 const s=await source(),before=async()=>{const [r]=await f.owner`SELECT count(*)::int AS n FROM allura.bumblebee_runners WHERE group_id=${f.scope.groupId}`;return r.n;},n=await before();
 await f.owner.unsafe("CREATE FUNCTION allura.bumblebee_lease_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.kind='bumblebee_config' THEN RAISE EXCEPTION 'fixture private failure'; END IF; RETURN NEW; END $$; CREATE CONSTRAINT TRIGGER bumblebee_lease_test_fail AFTER INSERT ON allura.events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION allura.bumblebee_lease_test_fail()");
 try{await expect(issueBumblebeeRunner(f.app,f.identities.author,f.scope,s.enrollment)).rejects.toThrow('bumblebee_unknown');expect(await before()).toBe(n);}finally{await f.owner.unsafe('DROP TRIGGER bumblebee_lease_test_fail ON allura.events; DROP FUNCTION allura.bumblebee_lease_test_fail()');}
 const runner=await issueBumblebeeRunner(f.app,f.identities.author,f.scope,s.enrollment),leases=service(),request={sourceRevision:1,operationKey:randomUUID()};
 await f.owner.unsafe("CREATE FUNCTION allura.bumblebee_lease_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture private failure'; END $$; CREATE CONSTRAINT TRIGGER bumblebee_lease_test_fail AFTER INSERT ON allura.bumblebee_leases DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION allura.bumblebee_lease_test_fail()");
 try{await expect(leases.acquire(runner.token!,request)).rejects.toThrow('bumblebee_unknown');const [r]=await f.owner`SELECT count(*)::int AS n FROM allura.bumblebee_leases WHERE group_id=${f.scope.groupId} AND source_id=${s.input.source.sourceId}::uuid`;expect(r.n).toBe(0);}finally{await f.owner.unsafe('DROP TRIGGER bumblebee_lease_test_fail ON allura.bumblebee_leases; DROP FUNCTION allura.bumblebee_lease_test_fail()');}
 expect((await leases.acquire(runner.token!,request)).generation).toBe(1);
 for(const table of ['bumblebee_runners','bumblebee_leases','bumblebee_runner_receipts']){await expect(f.owner.unsafe(`TRUNCATE allura.${table} CASCADE`).execute()).rejects.toThrow('append-only');await expect(f.app.unsafe(`SELECT * FROM allura.${table}`).execute()).rejects.toThrow();}
});
