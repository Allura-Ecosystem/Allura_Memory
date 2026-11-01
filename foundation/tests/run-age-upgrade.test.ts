import { test, expect } from 'bun:test';
import { SQL } from 'bun';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { authenticateHuman } from '../src/authentication.ts';
import { migrate, scopedTransaction } from '../src/persistence.ts';
import { runDefinition } from '../src/run-contract.ts';
import * as current from '../src/runs.ts';
import { type PreparationClaim } from '../src/run-execution.ts';

const pin = '2741aea93b27c29b12822070f448cb8610a4f9be';
test('run revision seven expiry repair preserves genuine revision six histories and refuses old execution',async () => {
  const target=process.env.ALLURA_DISPOSABLE_DB_URL;
  if(!target||new URL(target).hostname!=='127.0.0.1'||process.env.ALLURA_DISPOSABLE_DB!=='owned-test-container') {throw new Error('Requires owned disposable runner');}
  const root=new URL('../../',import.meta.url).pathname,exported=await mkdtemp(join(tmpdir(),'allura-age-upgrade-')),hashes:Record<string,string>={};
  const admin=new SQL(target,{max:1}),database=`run_age_upgrade_${randomUUID().replaceAll('-','')}`;
  let f:Awaited<ReturnType<typeof import('./lifecycle-fixture.ts').fixture>>|undefined,created=false;
  try {
    const archive=Bun.spawnSync(['git','archive',pin,'foundation'],{cwd:root});expect(archive.exitCode).toBe(0);expect(Bun.spawnSync(['tar','-x','-C',exported],{stdin:archive.stdout}).exitCode).toBe(0);
    const files=Bun.spawnSync(['git','ls-tree','-r','--name-only',pin,'foundation'],{cwd:root});expect(files.exitCode).toBe(0);
    for(const path of files.stdout.toString().trim().split('\n')) {const original=Bun.spawnSync(['git','show',`${pin}:${path}`],{cwd:root});expect(original.exitCode).toBe(0);const bytes=Buffer.from(await Bun.file(join(exported,path)).arrayBuffer());expect(bytes.equals(original.stdout)).toBe(true);hashes[path]=createHash('sha256').update(bytes).digest('hex');}
    console.log(JSON.stringify({revisionSixExport:exported,pin,archiveSha256:createHash('sha256').update(archive.stdout).digest('hex'),hashes}));
    await symlink(join(root,'foundation/node_modules'),join(exported,'foundation/node_modules'));
    await admin.unsafe(`CREATE DATABASE ${database}`);created=true;const url=new URL(target);url.pathname=`/${database}`;
    const legacy=await import(join(exported,'foundation/src/runs.ts')) as typeof current;
    const fixture=await import(join(exported,'foundation/tests/lifecycle-fixture.ts')) as typeof import('./lifecycle-fixture.ts');
    const persistence=await import(join(exported,'foundation/src/persistence.ts')) as typeof import('../src/persistence.ts');
    const contract=await import(join(exported,'foundation/src/run-contract.ts')) as typeof import('../src/run-contract.ts');
    const executor=await import(join(exported,'foundation/src/run-execution.ts')) as typeof import('../src/run-execution.ts');
    f=await fixture.fixture(`allura-age-upgrade-${randomUUID()}`,url.toString());const fx=f;
    await f.owner`UPDATE allura.workspace_grants SET role='workspace_admin' WHERE group_id=${f.scope.groupId} AND principal_id IN (${f.ids.reviewer}::uuid,${f.ids.curator}::uuid)`;
    expect((await f.owner`SELECT count(*)::int AS n FROM allura.schema_migrations`)[0].n).toBe(30);
    const text='Genuine accepted revision6 evidence',base={operationKey:randomUUID(),definitionId:'local-evidence-handoff',definitionRevision:6,goal:'Historical cancellation',reviewerPrincipalId:f.ids.reviewer,artifact:{text,expectedSha256:createHash('sha256').update(text).digest('hex'),sourceRevision:null}};
    const history:{mode:string;input:typeof base;start:string;runId:string;advanceCommand:{runId:string;expectedRevision:number;operationKey:string};advance?:string;cancelCommand?:{runId:string;expectedRevision:number;operationKey:string};cancel?:string;decisionCommand?:object;decision?:string;resumeCommand?:{runId:string;expectedRevision:number;operationKey:string};resume?:string;claim?:PreparationClaim}[]=[];
    for(const mode of ['ready','paused','cancelled','approved','complete','admitted','expired-prepare','expired-handoff','valid-prepare','valid-handoff']) {
      const input={...base,operationKey:randomUUID()},start=await legacy.startRun(f.app,f.identities.author,f.scope,input),runId=JSON.parse(start).runId as string,advanceCommand={runId,expectedRevision:1,operationKey:randomUUID()};
      const h:typeof history[number]={mode,input,start,runId,advanceCommand};
      if(mode.endsWith('prepare')) {
        const result=await persistence.scopedTransaction(f.app,f.identities.author,f.scope,'workspace:grants:manage',async tx=>(await tx`SELECT allura.claim_run_prepare(${fx.scope.groupId},${fx.scope.workspaceId}::uuid,${advanceCommand}::jsonb,${await contract.runDefinition()}::jsonb,${randomUUID()}::uuid) AS result`)[0].result);h.advance=result.receipt;h.claim=result.claim;
      } else if(mode!=='ready') {
        h.advance=await legacy.advanceRun(f.app,f.identities.author,f.scope,advanceCommand);
        if(mode==='cancelled') {h.cancelCommand={runId,expectedRevision:3,operationKey:randomUUID()};h.cancel=await legacy.cancelRun(f.app,f.identities.curator,f.scope,h.cancelCommand);}
        if(mode!=='paused' && mode!=='cancelled') {
          const a=JSON.parse((await f.owner`SELECT request_text FROM allura.run_approval_requests WHERE run_id=${runId}::uuid`)[0].request_text);
          h.decisionCommand={runId,expectedRevision:3,operationKey:randomUUID(),approvalRequestId:a.id,reviewedEvidenceDigest:a.evidenceDigest,decision:'approve',rationale:'Original accepted6 review'};
          h.decision=await legacy.decideRun(f.app,f.identities.reviewer,f.scope,h.decisionCommand);
          if(mode!=='approved') {
            h.resumeCommand={runId,expectedRevision:4,operationKey:randomUUID()};
            h.resume=await persistence.scopedTransaction(f.app,f.identities.author,f.scope,'workspace:grants:manage',async tx=>(await tx`SELECT allura.resume_run(${fx.scope.groupId},${fx.scope.workspaceId}::uuid,${h.resumeCommand}::jsonb,${await contract.runDefinition()}::jsonb) AS receipt`)[0].receipt as string);
            if(mode!=='admitted') {
              h.claim=await persistence.scopedTransaction(f.app,f.identities.author,f.scope,'workspace:grants:manage',async tx=>(await tx`SELECT allura.claim_run_handoff(${fx.scope.groupId},${fx.scope.workspaceId}::uuid,${runId}::uuid,${JSON.parse(h.resume!).id}::uuid,${await contract.runDefinition()}::jsonb,${randomUUID()}::uuid) AS claim`)[0].claim as PreparationClaim);
              if(mode==='complete') {await executor.finishHandoff(f.app,f.identities.author,f.scope,h.claim);}
            }
          }
        }
      }
      history.push(h);
    }
    const tables=['run_definitions','run_records','run_state','run_steps','run_journal','run_operation_receipts','run_effect_receipts','run_approval_requests','run_approval_decisions','run_handoff_links'];
    async function snapshot() {return Promise.all(tables.map(async t=>[...await fx.owner.unsafe(`SELECT to_jsonb(t)::text AS row FROM allura.${t} t ORDER BY 1`)]));}
    const semantics = async () => Promise.all(['events','semantic_versions','proposal_state'].map(async t => [...await fx.owner.unsafe(`SELECT to_jsonb(t)::text AS row FROM allura.${t} t ORDER BY 1`)]));
    const semanticBefore = await semantics();
    const before=await snapshot();await migrate(f.owner);expect(await snapshot()).toEqual(before);
    expect((await f.owner`SELECT count(*)::int AS n FROM allura.schema_migrations`)[0].n).toBe(33);
    console.log(JSON.stringify({revisionSixMigration:{pin,tables,before,after:await snapshot()}}));
    const identity=authenticateHuman({assertion:f.jwt('author')},f.humanConfig),reviewer=authenticateHuman({assertion:f.jwt('reviewer')},f.humanConfig),canceller=authenticateHuman({assertion:f.jwt('curator')},f.humanConfig);
    for(const h of history) {
      expect(await current.startRun(f.app,identity,f.scope,h.input)).toBe(h.start);expect(await snapshot()).toEqual(before);
      await expect(current.startRun(f.app,identity,f.scope,{...h.input,goal:h.input.goal+' changed'})).rejects.toThrow('conflict');expect(await snapshot()).toEqual(before);
      if(h.advance) {expect(await current.advanceRun(f.app,identity,f.scope,h.advanceCommand)).toBe(h.advance);expect(await snapshot()).toEqual(before);}
      if(h.decision) {expect(await current.decideRun(f.app,reviewer,f.scope,h.decisionCommand)).toBe(h.decision);expect(await snapshot()).toEqual(before);}
      if(h.resume) {expect(await current.resumeRun(f.app,identity,f.scope,h.resumeCommand)).toBe(h.resume);expect(await snapshot()).toEqual(before);}
    }
    for(const h of history.filter(h=>h.cancel)) {
      expect(await current.cancelRun(f.app,canceller,f.scope,h.cancelCommand)).toBe(h.cancel!);expect(await snapshot()).toEqual(before);
      await f.owner`UPDATE allura.workspace_grants SET active=false WHERE group_id=${f.scope.groupId} AND workspace_id=${f.scope.workspaceId}::uuid AND principal_id=${f.ids.curator}::uuid`;
      try{await expect(current.cancelRun(f.app,canceller,f.scope,h.cancelCommand)).rejects.toThrow('forbidden');expect(await snapshot()).toEqual(before);}finally{await f.owner`UPDATE allura.workspace_grants SET active=true WHERE group_id=${f.scope.groupId} AND workspace_id=${f.scope.workspaceId}::uuid AND principal_id=${f.ids.curator}::uuid`;}
    }
    expect(await snapshot()).toEqual(before);
    for(const h of history) {
      const query=new URLSearchParams({group_id:fx.scope.groupId,workspace_id:fx.scope.workspaceId,run_id:h.runId,limit:'1'});
      const view=await current.inspectRun(f.app,canceller,f.scope,query);
      expect(view.record.definition.revision).toBe(6); expect(view.doctor).toContain('definition_drift');
      expect(view.completionVerified).toBe(h.mode==='complete'); expect(await snapshot()).toEqual(before);
    }
    // Original code/definition and original leases, all still valid: expiry or
    // changed-source mismatch must not mask the explicit historical guard.
    for(const h of history.filter(h=>h.mode.startsWith('valid-'))) {
      const [st]=await f.owner`SELECT lease_until,lease_until>clock_timestamp() AS valid FROM allura.run_steps WHERE run_id=${h.runId}::uuid AND state='leased'`;expect(st.valid).toBe(true);
      if(h.mode==='valid-prepare') {await executor.finishPreparation(f.app,f.identities.author,f.scope,h.claim!);expect((await f.owner`SELECT reason FROM allura.run_state WHERE run_id=${h.runId}::uuid`)[0].reason).toBe('definition_drift');}
      else {const stable=await snapshot();await expect(executor.finishHandoff(f.app,f.identities.author,f.scope,h.claim!)).rejects.toThrow('conflict');expect(await snapshot()).toEqual(stable);}
      expect((await f.owner`SELECT ${st.lease_until}::timestamptz>clock_timestamp() AS valid`)[0].valid).toBe(true);
      expect(await f.owner`SELECT id FROM allura.run_effect_receipts WHERE run_id=${h.runId}::uuid AND step_id=${h.mode==='valid-prepare'?'prepare':'handoff'}`).toHaveLength(0);
      console.log(JSON.stringify({revisionSixOriginalWorker:{pin,mode:h.mode,validBeforeAndAfter:true}}));
    }
    // Current full tracer in the same populated workspace, with no old evidence rewrite.
    const freshInput={...base,operationKey:randomUUID(),definitionRevision:8};
    const fresh=await current.startRun(f.app,identity,f.scope,freshInput);expect(JSON.parse(fresh).phaseAtAcceptance).toBe('ready');
    const freshId=JSON.parse(fresh).runId as string;
    await current.advanceRun(f.app,identity,f.scope,{runId:freshId,expectedRevision:1,operationKey:randomUUID()});
    const approval=JSON.parse((await f.owner`SELECT request_text FROM allura.run_approval_requests WHERE run_id=${freshId}::uuid`)[0].request_text);
    await current.decideRun(f.app,reviewer,f.scope,{runId:freshId,expectedRevision:3,operationKey:randomUUID(),approvalRequestId:approval.id,reviewedEvidenceDigest:approval.evidenceDigest,decision:'approve',rationale:'Current7 exact approval'});
    await current.resumeRun(f.app,identity,f.scope,{runId:freshId,expectedRevision:4,operationKey:randomUUID()});
    const currentView=await current.inspectRun(f.app,canceller,f.scope,new URLSearchParams({group_id:fx.scope.groupId,workspace_id:fx.scope.workspaceId,run_id:freshId}));
    expect(currentView.record.definition.revision).toBe(8);expect(currentView.completionVerified).toBe(true);expect(currentView.doctor).not.toContain('definition_drift');
    expect(currentView.effects).toHaveLength(2);expect(currentView.runtime.outcome).toBe('succeeded');
    console.log(JSON.stringify({revisionSevenTracer:currentView}));
    const ready=history.find(h=>h.mode==='ready')!,paused=history.find(h=>h.mode==='paused')!,approved=history.find(h=>h.mode==='approved')!;
    const blocked=await current.advanceRun(f.app,identity,f.scope,ready.advanceCommand);expect(JSON.parse(blocked).phaseAtAcceptance).toBe('blocked');
    expect((await f.owner`SELECT reason FROM allura.run_state WHERE run_id=${ready.runId}::uuid`)[0].reason).toBe('definition_drift');
    const pausedBefore=await snapshot(),oldApproval=JSON.parse((await f.owner`SELECT request_text FROM allura.run_approval_requests WHERE run_id=${paused.runId}::uuid`)[0].request_text);
    await expect(current.decideRun(f.app,reviewer,f.scope,{runId:paused.runId,expectedRevision:3,operationKey:randomUUID(),approvalRequestId:oldApproval.id,reviewedEvidenceDigest:oldApproval.evidenceDigest,decision:'approve',rationale:'Unsupported old pending approval'})).rejects.toThrow('conflict');expect(await snapshot()).toEqual(pausedBefore);
    const oldResume=await current.resumeRun(f.app,identity,f.scope,{runId:approved.runId,expectedRevision:4,operationKey:randomUUID()});expect(JSON.parse(oldResume).phaseAtAcceptance).toBe('blocked');
    expect((await f.owner`SELECT reason FROM allura.run_state WHERE run_id=${approved.runId}::uuid`)[0].reason).toBe('definition_drift');
    await expect(current.startRun(f.app,identity,f.scope,{...base,operationKey:randomUUID()})).rejects.toThrow('conflict');
    const [timing]=await f.owner`SELECT greatest(0,ceil(extract(epoch FROM(max(due_at)-clock_timestamp()))*1000))::int AS ms FROM allura.run_steps WHERE group_id=${f.scope.groupId}`;
    await Bun.sleep(timing.ms+10);
    for(const h of history.filter(h=>h.mode.startsWith('expired-'))) {
      expect((await f.owner`SELECT lease_until<=clock_timestamp() AS expired,due_at<=clock_timestamp() AS due FROM allura.run_steps WHERE run_id=${h.runId}::uuid AND state='leased'`)[0]).toEqual({expired:true,due:true});
      const stable=await snapshot();expect(await current.advanceRun(f.app,identity,f.scope,h.advanceCommand)).toBe(h.advance!);
      const prepareReplay=await scopedTransaction(f.app,identity,f.scope,'workspace:grants:manage',async tx=>(await tx`SELECT allura.claim_run_prepare(${fx.scope.groupId},${fx.scope.workspaceId}::uuid,${h.advanceCommand}::jsonb,${await runDefinition()}::jsonb,${randomUUID()}::uuid) AS result`)[0].result);
      expect(prepareReplay).toEqual({receipt:h.advance,claim:null});
      if(h.resume) {
        expect(await current.resumeRun(f.app,identity,f.scope,h.resumeCommand)).toBe(h.resume);
        const result=await scopedTransaction(f.app,identity,f.scope,'workspace:grants:manage',async tx=>(await tx`SELECT allura.claim_run_handoff(${fx.scope.groupId},${fx.scope.workspaceId}::uuid,${h.runId}::uuid,${JSON.parse(h.resume!).id}::uuid,${await runDefinition()}::jsonb,${randomUUID()}::uuid) AS claim`)[0].claim);expect(result).toBeNull();
      }
      expect(await snapshot()).toEqual(stable);console.log(JSON.stringify({revisionSixExpiredReplay:{mode:h.mode,completeSnapshotUnchanged:true}}));
    }
    // Control-plane cancellation works on every supported nonterminal old state
    // without requiring the old participants or installed handler definition.
    async function participantGrants() {return [...await fx.owner`SELECT to_jsonb(g)::text AS row FROM allura.workspace_grants g WHERE group_id=${fx.scope.groupId} AND workspace_id=${fx.scope.workspaceId}::uuid AND principal_id IN (${fx.ids.author}::uuid,${fx.ids.reviewer}::uuid) ORDER BY 1`];}
    const originalGrants=await participantGrants();
    await f.owner`UPDATE allura.workspace_grants SET active=false WHERE group_id=${f.scope.groupId} AND workspace_id=${f.scope.workspaceId}::uuid AND principal_id IN (${f.ids.author}::uuid,${f.ids.reviewer}::uuid)`;
    const revokedGrants=await participantGrants();
    for(const h of history) {
      const stable=await snapshot();
      const view=await current.inspectRun(f.app,canceller,f.scope,new URLSearchParams({group_id:fx.scope.groupId,workspace_id:fx.scope.workspaceId,run_id:h.runId}));
      expect(view.record.runId).toBe(h.runId); expect(view.doctor).toContain('definition_drift'); expect(await snapshot()).toEqual(stable);
    }
    for(const h of history) {
      const [s]=await f.owner`SELECT revision FROM allura.run_state WHERE run_id=${h.runId}::uuid`,command={runId:h.runId,expectedRevision:s.revision,operationKey:randomUUID()},stable=await snapshot();
      if(h.mode==='complete'||h.mode==='cancelled') {await expect(current.cancelRun(f.app,canceller,f.scope,command)).rejects.toThrow('conflict');expect(await snapshot()).toEqual(stable);continue;}
      const receipt=await current.cancelRun(f.app,canceller,f.scope,command);expect(await current.cancelRun(f.app,canceller,f.scope,command)).toBe(receipt);
      expect((await f.owner`SELECT phase,outcome,reason FROM allura.run_state WHERE run_id=${h.runId}::uuid`)[0]).toEqual({phase:'terminal',outcome:h.mode==='ready'||h.mode.endsWith('prepare')?'failed':'partial',reason:'cancelled'});
      const after=await snapshot();for(const i of [0,1,6,7,8,9]) {expect(after[i]).toEqual(stable[i]);}
      // The accepted6 receipts above come from the verified original export, not
      // reconstructed rows. Reconcile every available command AFTER cancellation
      // through current services, first denied and then with exact original grants.
      const replays:{command:string;original:string;invoke:()=>Promise<string>}[]=[{command:'start',original:h.start,invoke:()=>current.startRun(fx.app,identity,fx.scope,h.input)}];
      if(h.advance) {replays.push({command:'advance',original:h.advance,invoke:()=>current.advanceRun(fx.app,identity,fx.scope,h.advanceCommand)});}
      if(h.decision) {replays.push({command:'decision',original:h.decision,invoke:()=>current.decideRun(fx.app,reviewer,fx.scope,h.decisionCommand)});}
      if(h.resume) {replays.push({command:'resume',original:h.resume,invoke:()=>current.resumeRun(fx.app,identity,fx.scope,h.resumeCommand)});}
      for(const replay of replays) {
        await expect(replay.invoke()).rejects.toThrow('forbidden');
        expect(await snapshot()).toEqual(after);
      }
      expect(await participantGrants()).toEqual(revokedGrants);
      await f.owner`UPDATE allura.workspace_grants SET active=true WHERE group_id=${f.scope.groupId} AND workspace_id=${f.scope.workspaceId}::uuid AND principal_id IN (${f.ids.author}::uuid,${f.ids.reviewer}::uuid)`;
      try {
        expect(await participantGrants()).toEqual(originalGrants);
        expect(await snapshot()).toEqual(after);
        const receipts:{command:string;originalSha256:string;replayedSha256:string}[]=[];
        for(const replay of replays) {
          const replayed=await replay.invoke();
          expect(replayed).toBe(replay.original);
          expect(Buffer.from(replayed).equals(Buffer.from(replay.original))).toBe(true);
          expect(await snapshot()).toEqual(after);
          receipts.push({command:replay.command,originalSha256:createHash('sha256').update(replay.original).digest('hex'),replayedSha256:createHash('sha256').update(replayed).digest('hex')});
        }
        // In addition to unchanged persisted claim/effect/history rows, prove the
        // guarded historical recovery paths cannot return a transient new claim.
        if(h.advance) {
          const result=await scopedTransaction(f.app,identity,f.scope,'workspace:grants:manage',async tx=>(await tx`SELECT allura.claim_run_prepare(${fx.scope.groupId},${fx.scope.workspaceId}::uuid,${h.advanceCommand}::jsonb,${await runDefinition()}::jsonb,${randomUUID()}::uuid) AS result`)[0].result);
          expect(result).toEqual({receipt:h.advance,claim:null});
          expect(await snapshot()).toEqual(after);
        }
        if(h.resume) {
          const resumeReceipt=h.resume;
          const claim=await scopedTransaction(f.app,identity,f.scope,'workspace:grants:manage',async tx=>(await tx`SELECT allura.claim_run_handoff(${fx.scope.groupId},${fx.scope.workspaceId}::uuid,${h.runId}::uuid,${JSON.parse(resumeReceipt).id}::uuid,${await runDefinition()}::jsonb,${randomUUID()}::uuid) AS claim`)[0].claim);
          expect(claim).toBeNull();
          expect(await snapshot()).toEqual(after);
        }
        console.log(JSON.stringify({revisionSixPostCancelReplay:{pin,mode:h.mode,receipts,revokedCommandsDenied:replays.map(r=>r.command),exactOriginalGrantsRestored:true,completeSnapshotUnchanged:true,snapshotTables:tables,snapshotSha256:createHash('sha256').update(JSON.stringify(after)).digest('hex'),prepareClaim:h.advance?'null':'not-available',handoffClaim:h.resume?'null':'not-available'}}));
      } finally {
        await f.owner`UPDATE allura.workspace_grants SET active=false WHERE group_id=${f.scope.groupId} AND workspace_id=${f.scope.workspaceId}::uuid AND principal_id IN (${f.ids.author}::uuid,${f.ids.reviewer}::uuid)`;
      }
      expect(await participantGrants()).toEqual(revokedGrants);
      expect(await snapshot()).toEqual(after);
    }
    expect(await semantics()).toEqual(semanticBefore);
  } finally {
    await f?.close();try {if(created) {await admin.unsafe(`DROP DATABASE ${database} WITH (FORCE)`);expect(await admin`SELECT datname FROM pg_database WHERE datname=${database}`).toHaveLength(0);}}finally{await admin.close();}
    for(const [path,hash] of Object.entries(hashes)) {expect(createHash('sha256').update(new Uint8Array(await Bun.file(join(exported,path)).arrayBuffer())).digest('hex')).toBe(hash);}
    await rm(exported,{recursive:true,force:true});expect(await Bun.file(join(exported,'foundation/src/runs.ts')).exists()).toBe(false);console.log(JSON.stringify({revisionSixExportRemoved:exported}));
  }
},30000);
