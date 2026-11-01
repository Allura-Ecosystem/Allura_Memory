import { SQL } from 'bun';
import { authenticateMachine } from '../src/authentication.ts';
import { scopedTransaction } from '../src/persistence.ts';
import { runDefinition } from '../src/run-contract.ts';
import { test, expect, beforeAll, afterAll } from 'bun:test';
import { createHash, randomUUID } from 'node:crypto';
import { type RunInspection } from '../src/run-contract.ts';
import { fixture } from './lifecycle-fixture.ts';
import { startRun, advanceRun, decideRun, resumeRun, inspectRun } from '../src/runs.ts';
import { createCoreGateway } from '../src/core-api.ts';
import { EMBEDDING } from '../src/embedding.ts';

let f: Awaited<ReturnType<typeof fixture>>;
beforeAll(async () => {
  f = await fixture(`allura-inspection-${randomUUID()}`);
  await f.owner`UPDATE allura.workspace_grants SET role='workspace_admin' WHERE group_id=${f.scope.groupId} AND principal_id IN (${f.ids.reviewer}::uuid,${f.ids.curator}::uuid)`;
});
afterAll(async () => { await f?.close(); });
const tables = ['run_definitions','run_records','run_state','run_steps','run_journal','run_operation_receipts','run_effect_receipts','run_approval_requests','run_approval_decisions','run_handoff_links','events','semantic_versions','proposal_state','proposal_versions','proposal_evidence','proposal_audit'];
async function snapshot() { return Promise.all(tables.map(async table => [...await f.owner.unsafe(`SELECT to_jsonb(t)::text AS row FROM allura.${table} t ORDER BY 1`)])); }
async function setup(mode = 'ready') {
  const text = 'Private inspection artifact', input = { operationKey: randomUUID(), definitionId: 'local-evidence-handoff', definitionRevision: 9, goal: 'Private scoped goal', reviewerPrincipalId: f.ids.reviewer, artifact: { text, expectedSha256: createHash('sha256').update(text).digest('hex'), sourceRevision: null } };
  if (mode === 'failed') { input.artifact.expectedSha256 = 'a'.repeat(64); }
  const start = await startRun(f.app, f.identities.author, f.scope, input), runId = JSON.parse(start).runId as string;
  if (mode !== 'ready') { await advanceRun(f.app, f.identities.author, f.scope, { runId, expectedRevision: 1, operationKey: randomUUID() }); }
  if (mode === 'completed') {
    const a = JSON.parse((await f.owner`SELECT request_text FROM allura.run_approval_requests WHERE run_id=${runId}::uuid`)[0].request_text);
    await decideRun(f.app, f.identities.reviewer, f.scope, { runId, expectedRevision: 3, operationKey: randomUUID(), approvalRequestId: a.id, reviewedEvidenceDigest: a.evidenceDigest, decision: 'approve', rationale: 'Private exact review' });
    await resumeRun(f.app, f.identities.author, f.scope, { runId, expectedRevision: 4, operationKey: randomUUID() });
  }
  return { runId, input, start };
}
function query(runId: string, extra = '') { return new URLSearchParams(`group_id=${f.scope.groupId}&workspace_id=${f.scope.workspaceId}&run_id=${runId}${extra}`); }
function gateway() { return createCoreGateway(f.app, f.humanConfig, 'https://inspect.invalid', new Uint8Array(32).fill(7), { identity: EMBEDDING, embed: async (): Promise<number[]> => { throw new Error('no embedding'); } }); }
async function get(runId: string, extra = '', actor: 'author' | 'reviewer' | 'curator' | 'viewer' | 'org' = 'curator') {
  const before = await snapshot();
  const response = await gateway()(new Request(`https://inspect.invalid/api/runs/inspect?${query(runId, extra)}`, { headers: { 'Cf-Access-Jwt-Assertion': f.jwt(actor) } }));
  expect(await snapshot()).toEqual(before); return response;
}

test('run inspection exposes exact pinned complete evidence and page independent doctor without mutation', async () => {
  for (const mode of ['ready', 'paused', 'completed', 'failed']) {
    const h = await setup(mode), response = await get(h.runId, '&limit=1'); expect(response.status).toBe(200);
    const view = await response.json() as RunInspection;
    const [def] = await f.owner`SELECT definition,definition_digest,policy_digest,handler_digest FROM allura.run_definitions WHERE group_id=${f.scope.groupId} AND workspace_id=${f.scope.workspaceId}::uuid AND revision=9`;
    expect(view.definition).toEqual(def.definition); expect(view.policy).toEqual(def.definition.policy);
    expect(view.record.definition.digest).toBe(def.definition_digest); expect(view.record.policyDigest).toBe(def.policy_digest); expect(view.handlerBundleDigest).toBe(def.handler_digest);
    expect(view.steps).toHaveLength(3); expect(view.operations[0]!.id).toBe(JSON.parse(h.start).id);
    expect(view.journal.map((j: { seq: number }) => j.seq)).toEqual([1]); expect(view.afterSeq).toBe(1);
    expect(view.hasMore).toBe(mode !== 'ready');
    if (mode === 'paused') { expect(view.doctor).toContain('approval_required'); expect(view.approval!.preparedReceiptId).toBe(view.effects[0]!.id); }
    if (mode === 'completed') {
      expect(view.runtime.outcome).toBe('succeeded'); expect(view.completionVerified).toBe(true); expect(view.doctor).toEqual([]);
      const handoff = view.effects.find((e: { stepId: string }) => e.stepId === 'handoff');
      expect(handoff!.approvalRequestId).toBe(view.approval!.id); expect(handoff!.approvalDecisionId).toBe(view.decision!.id); expect(handoff!.preparedReceiptId).toBe(view.approval!.preparedReceiptId);
    }
    const complete = await (await get(h.runId, '&limit=100')).json() as RunInspection; expect(complete.doctor).toEqual(view.doctor);
    expect(complete.completionVerified).toBe(mode === 'completed');
    if (mode === 'failed') { expect(complete.doctor).toContain('gate_failed'); expect(complete.journal.at(-1)!.measurement).toMatchObject({ expectedSha256: h.input.artifact.expectedSha256, artifactBytes: Buffer.byteLength(h.input.artifact.text), measuredGates: [{ id: 'artifact_nonempty', passed: true }, { id: 'artifact_digest_match', passed: false }] }); }
    const stored = [...await f.owner`SELECT seq,receipt_id,effect_receipt_id,approval_request_id,approval_decision_id FROM allura.run_journal WHERE run_id=${h.runId}::uuid ORDER BY seq`];
    expect(complete.journal.map((j: { seq: number; receiptId: string; effectReceiptId: string | null; approvalRequestId: string | null; approvalDecisionId: string | null }) => ({ seq: j.seq, receipt_id: j.receiptId, effect_receipt_id: j.effectReceiptId, approval_request_id: j.approvalRequestId, approval_decision_id: j.approvalDecisionId }))).toEqual(stored);
    const serialized = JSON.stringify(complete);
    for (const privateValue of [h.input.artifact.text, 'owner_issuer', 'owner_subject', 'leaseId', 'lease_id', 'invocationId', 'invocation_id']) { expect(serialized).not.toContain(privateValue); }
    let cursor = 0; const sequences: number[] = [];
    do { const page = await (await get(h.runId, `&after_seq=${cursor}&limit=1`)).json() as RunInspection; sequences.push(...page.journal.map((j: { seq: number }) => j.seq)); expect(page.doctor).toEqual(view.doctor); cursor = page.afterSeq; if (!page.hasMore) { break; } } while (cursor < 128);
    expect(sequences).toEqual(stored.map(j => j.seq));
    const empty = await (await get(h.runId, '&after_seq=9007199254740991&limit=100')).json() as RunInspection; expect(empty.journal).toEqual([]); expect(empty.afterSeq).toBe(9007199254740991); expect(empty.hasMore).toBe(false); expect(empty.doctor).toEqual(view.doctor);
    expect(await inspectRun(f.app, f.identities.curator, f.scope, query(h.runId))).toMatchObject({ record: { runId: h.runId } });
  }
});

test('run inspection strict selectors and independent current human authority preserve foreign privacy', async () => {
  const h = await setup('paused');
  for (const suffix of ['&actor=forged','&limit=0','&limit=101','&limit=1.0','&limit=1e1','&limit=+1','&limit=','&after_seq=-1','&after_seq=1.0','&after_seq=1e1','&after_seq=9007199254740992','&after_seq=NaN','&after_seq=','&after_seq=1%0A','&limit=1&limit=2','&after_seq=0&after_seq=0',`&run_id=${h.runId}`,`&group_id=${f.scope.groupId}`,`&workspace_id=${f.scope.workspaceId}`]) { expect((await get(h.runId, suffix)).status).toBe(400); }
  for (const key of ['group_id','workspace_id','run_id']) {
    const q = query(h.runId); q.delete(key); const before = await snapshot();
    const response = await gateway()(new Request(`https://inspect.invalid/api/runs/inspect?${q}`, { headers: { 'Cf-Access-Jwt-Assertion': f.jwt('curator') } }));
    expect(response.status).toBe(400); expect(await snapshot()).toEqual(before);
  }
  for (const who of ['viewer','org'] as const) { expect((await get(h.runId,'',who)).status).toBe(403); }
  await expect(inspectRun(f.app, {...f.identities.curator}, f.scope, query(h.runId))).rejects.toThrow('unauthenticated');
  await expect(inspectRun(f.app, f.identities.machine, f.scope, query(h.runId))).rejects.toThrow('forbidden');
  // Issued, not plain-object, nonhuman identities exercise the service's early
  // kind guard independently of database lookup or unrelated entitlement denial.
  for (const kind of ['device','worker','service'] as const) {
    const identity = await authenticateMachine('x'.repeat(43), async () => ({ kind, principalId: f.ids.machine, groupId: f.scope.groupId, workspaceId: f.scope.workspaceId, actions: ['audit:read'], expiresAt: Math.floor(Date.now()/1000)+600, revoked: false, ...(kind==='service'?{selected:true as const,oauthClientId:'inspection-fixture',oauthResource:'https://inspect.invalid/mcp'}:{}) }));
    await expect(inspectRun(f.app, identity, f.scope, query(h.runId))).rejects.toThrow('forbidden');
  }
  for (const headers of [{}, {'Cf-Access-Jwt-Assertion':'forged'}, {'Cf-Access-Jwt-Assertion':f.jwt('curator'),Authorization:'Bearer synthetic-invalid'}, {Cookie:`CF_Authorization=${f.jwt('curator')}`,Authorization:'Bearer synthetic-invalid'}]) {
    const before=await snapshot(); const response=await gateway()(new Request(`https://inspect.invalid/api/runs/inspect?${query(h.runId)}`,{headers})); expect(response.status).toBe(401); expect(await response.text()).not.toContain(h.runId); expect(await snapshot()).toEqual(before);
  }
  await expect(f.app`SELECT allura.inspect_run(${f.scope.groupId},${f.scope.workspaceId}::uuid,${h.runId}::uuid,0,20,NULL)`.execute()).rejects.toThrow('forbidden');
  for (const kind of ['service','device','worker']) {
    await expect(scopedTransaction(f.app,f.identities.curator,f.scope,'audit:read',async tx=>{ await tx`SELECT set_config('allura.kind',${kind},true)`; return tx`SELECT allura.inspect_run(${f.scope.groupId},${f.scope.workspaceId}::uuid,${h.runId}::uuid,0,20,NULL)`; })).rejects.toThrow('forbidden');
  }
  const foreignGroup=`allura-inspection-foreign-${randomUUID()}`, foreignScope={groupId:foreignGroup,workspaceId:randomUUID()};
  await f.owner`INSERT INTO allura.tenants(group_id) VALUES(${foreignGroup})`;
  for (const id of [f.ids.author,f.ids.reviewer,f.ids.curator]) { await f.owner`INSERT INTO allura.memberships(group_id,principal_id) VALUES(${foreignGroup},${id}::uuid)`; }
  for (const scope of [{...f.scope,workspaceId:f.foreignWorkspace},foreignScope]) {
    if(scope.groupId===foreignGroup) { await f.owner`INSERT INTO allura.workspaces(group_id,id,display_name,created_by) VALUES(${scope.groupId},${scope.workspaceId}::uuid,'Populated foreign sentinel',${f.ids.author}::uuid)`; }
    for (const id of [f.ids.author,f.ids.reviewer,f.ids.curator]) { await f.owner`INSERT INTO allura.workspace_grants(group_id,workspace_id,principal_id,role,issuer) VALUES(${scope.groupId},${scope.workspaceId}::uuid,${id}::uuid,'workspace_admin',${f.ids.author}::uuid)`; }
    const receipt=await startRun(f.app,f.identities.author,scope,{...h.input,operationKey:randomUUID(),goal:'Foreign private sentinel'}), foreignId=JSON.parse(receipt).runId as string;
    const absent=await get(randomUUID()),hidden=await get(foreignId);expect(hidden.status).toBe(404);expect(await hidden.text()).toBe(await absent.text());
    const before=await snapshot(); await expect(inspectRun(f.app,f.identities.curator,scope,new URLSearchParams({group_id:scope.groupId,workspace_id:scope.workspaceId,run_id:h.runId}))).rejects.toThrow('not_found');expect(await snapshot()).toEqual(before);
  }
  const before=await snapshot();
  await f.owner`UPDATE allura.workspace_grants SET active=false WHERE group_id=${f.scope.groupId} AND workspace_id=${f.scope.workspaceId}::uuid AND principal_id IN (${f.ids.author}::uuid,${f.ids.reviewer}::uuid)`;
  try { expect((await get(h.runId)).status).toBe(200); } finally { await f.owner`UPDATE allura.workspace_grants SET active=true WHERE group_id=${f.scope.groupId} AND workspace_id=${f.scope.workspaceId}::uuid AND principal_id IN (${f.ids.author}::uuid,${f.ids.reviewer}::uuid)`; }
  expect(await snapshot()).toEqual(before);
  for (const [off,on] of [
    [`UPDATE allura.workspace_grants SET active=false WHERE principal_id='${f.ids.curator}'`,`UPDATE allura.workspace_grants SET active=true WHERE principal_id='${f.ids.curator}'`],
    [`UPDATE allura.memberships SET active=false WHERE principal_id='${f.ids.curator}'`,`UPDATE allura.memberships SET active=true WHERE principal_id='${f.ids.curator}'`],
    [`UPDATE allura.identity_bindings SET active=false WHERE principal_id='${f.ids.curator}'`,`UPDATE allura.identity_bindings SET active=true WHERE principal_id='${f.ids.curator}'`],
  ]) { await f.owner.unsafe(off!);try { expect((await get(h.runId)).status).toBe(403); }finally { await f.owner.unsafe(on!); } }
  expect(await snapshot()).toEqual(before);
});

async function waits(waiter: number, blocker: number) {
  for (let attempt=0;attempt<100;attempt++) {
    const [row]=await f.owner`SELECT ${blocker}::integer=ANY(pg_blocking_pids(${waiter}::integer)) AS blocked`;
    if(row.blocked) { console.log(JSON.stringify({inspectionLockWitness:{waiter,blocker}})); return; }
    await Bun.sleep(5);
  }
  throw new Error('Expected attributable inspection lock wait');
}
async function inspectionDefinition() { return (await f.owner`SELECT pg_get_functiondef('allura.inspect_run(text,uuid,uuid,bigint,integer,jsonb)'::regprocedure) AS source`)[0].source as string; }

test('run inspection current inspector revocation serializes both attributable database orders', async () => {
  const h=await setup(),before=await snapshot(),original=await inspectionDefinition();
  for(const first of ['inspect','revoke']) {
    const reader=new SQL(f.appUrl,{max:1}),revoker=new SQL(process.env.ALLURA_DISPOSABLE_DB_URL!,{max:1}),gate=new SQL(process.env.ALLURA_DISPOSABLE_DB_URL!,{max:1});
    const readerPid=(await reader`SELECT pg_backend_pid() AS pid`)[0].pid as number,revokerPid=(await revoker`SELECT pg_backend_pid() AS pid`)[0].pid as number,gatePid=(await gate`SELECT pg_backend_pid() AS pid`)[0].pid as number;
    let release=()=>{}; const barrier=new Promise<void>(r=>{release=r;}); let entered=()=>{};const ready=new Promise<void>(r=>{entered=r;});
    let hold:Promise<unknown>|undefined,read:Promise<RunInspection>|undefined,revoke:Promise<unknown>|undefined;
    try {
      if(first==='inspect') {
        await f.owner.unsafe(original.replace(' WITH r AS MATERIALIZED', ' PERFORM pg_advisory_xact_lock(120306);\n WITH r AS MATERIALIZED'));
        hold=gate.begin(async tx=>{await tx`SELECT pg_advisory_xact_lock(120306)`;entered();await barrier;}); await ready;
        read=inspectRun(reader,f.identities.curator,f.scope,query(h.runId)); await waits(readerPid,gatePid);
        revoke=revoker`UPDATE allura.workspace_grants SET active=false WHERE group_id=${f.scope.groupId} AND workspace_id=${f.scope.workspaceId}::uuid AND principal_id=${f.ids.curator}::uuid`.execute(); await waits(revokerPid,readerPid);
        release(); await hold;expect((await read).record.runId).toBe(h.runId);await revoke;
      } else {
        hold=revoker.begin(async tx=>{await tx`UPDATE allura.workspace_grants SET active=false WHERE group_id=${f.scope.groupId} AND workspace_id=${f.scope.workspaceId}::uuid AND principal_id=${f.ids.curator}::uuid`;entered();await barrier;});await ready;
        read=inspectRun(reader,f.identities.curator,f.scope,query(h.runId));const denied=read.then(()=> 'accepted',e=>(e as Error).message);await waits(readerPid,revokerPid);release();await hold;expect(await denied).toBe('forbidden');
      }
      expect((await get(h.runId)).status).toBe(403);expect(await snapshot()).toEqual(before);
      console.log(JSON.stringify({inspectionRevocationOrder:{first,readerPid,revokerPid,gatePid,unchanged:true}}));
    } finally {
      release();await Promise.allSettled([hold,read,revoke].filter(Boolean));await f.owner.unsafe(original);
      await f.owner`UPDATE allura.workspace_grants SET active=true WHERE group_id=${f.scope.groupId} AND workspace_id=${f.scope.workspaceId}::uuid AND principal_id=${f.ids.curator}::uuid`;
      await reader.close();await revoker.close();await gate.close();
    }
  }
});

test('run inspection coherent snapshot never mixes a concurrent committed cancellation', async () => {
  const h=await setup('paused'),original=await inspectionDefinition();
  const reader=new SQL(f.appUrl,{max:1}),gate=new SQL(process.env.ALLURA_DISPOSABLE_DB_URL!,{max:1});
  const readerPid=(await reader`SELECT pg_backend_pid() AS pid`)[0].pid as number,gatePid=(await gate`SELECT pg_backend_pid() AS pid`)[0].pid as number;
  let release=()=>{};const barrier=new Promise<void>(r=>{release=r;});let entered=()=>{};const ready=new Promise<void>(r=>{entered=r;});let hold:Promise<unknown>|undefined,read:Promise<RunInspection>|undefined;
  try {
    await f.owner.unsafe(`CREATE FUNCTION allura.inspection_snapshot_barrier() RETURNS timestamptz LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(120307); RETURN statement_timestamp(); END $$`);
    await f.owner.unsafe(original.replace("'observedAt',statement_timestamp()","'observedAt',allura.inspection_snapshot_barrier()"));
    hold=gate.begin(async tx=>{await tx`SELECT pg_advisory_xact_lock(120307)`;entered();await barrier;});await ready;
    read=inspectRun(reader,f.identities.curator,f.scope,query(h.runId));await waits(readerPid,gatePid);
    const {cancelRun}=await import('../src/runs.ts');await cancelRun(f.app,f.identities.author,f.scope,{runId:h.runId,expectedRevision:3,operationKey:randomUUID()});
    const afterCancel=await snapshot();release();await hold;const view=await read;
    expect(view.runtime.phase).toBe('paused_approval');expect(view.runtime.checkpointSeq).toBe(4);expect(view.journal.map(j=>j.seq)).toEqual([1,2,3,4]);expect(view.doctor).toEqual(['approval_required']);expect(await snapshot()).toEqual(afterCancel);
  } finally { release();await Promise.allSettled([hold,read].filter(Boolean));await f.owner.unsafe(original);await f.owner.unsafe('DROP FUNCTION IF EXISTS allura.inspection_snapshot_barrier()');await reader.close();await gate.close(); }
  const latest=await (await get(h.runId)).json() as RunInspection;expect(latest.runtime.reason).toBe('cancelled');expect(latest.doctor).toContain('cancelled');expect(latest.journal.at(-1)!.seq).toBe(latest.runtime.checkpointSeq);
});

test('run inspection query outages are unknown while authority store outages remain forbidden', async () => {
  const h=await setup(),before=await snapshot(),original=await inspectionDefinition();
  try {
    await f.owner.unsafe(original.replace(' WITH r AS MATERIALIZED'," RAISE EXCEPTION 'PRIVATE query failure';\n WITH r AS MATERIALIZED"));
    const response=await get(h.runId);expect(response.status).toBe(503);expect(await response.json()).toEqual({outcome:'unknown'});
  }finally{await f.owner.unsafe(original);}
  const [authority]=await f.owner`SELECT oid::regprocedure::text AS signature FROM pg_proc WHERE pronamespace='allura'::regnamespace AND proname='resolve_authority'`;
  await f.owner.unsafe(`REVOKE EXECUTE ON FUNCTION ${authority.signature} FROM allura_app`);
  try {const response=await get(h.runId);expect(response.status).toBe(403);expect(await response.json()).toEqual({outcome:'forbidden'});}finally{await f.owner.unsafe(`GRANT EXECUTE ON FUNCTION ${authority.signature} TO allura_app`);}
  expect(await snapshot()).toEqual(before);expect((await get(h.runId)).status).toBe(200);
});

test('run inspection reports inconsistent handoff links with a guard sensitive restored control', async () => {
  const h=await setup('completed'),original=await inspectionDefinition();
  const [effect]=await f.owner`SELECT id,receipt_text FROM allura.run_effect_receipts WHERE run_id=${h.runId}::uuid AND step_id='handoff'`;
  const baseline=await snapshot();
  try {
    await f.owner.unsafe('ALTER TABLE allura.run_effect_receipts DISABLE TRIGGER immutable');
    await f.owner`UPDATE allura.run_effect_receipts SET receipt_text=jsonb_set(receipt_text::jsonb,'{approvalRequestId}',to_jsonb(${randomUUID()}::text))::text WHERE id=${effect.id}::uuid`;
    await f.owner.unsafe('ALTER TABLE allura.run_effect_receipts ENABLE TRIGGER immutable');
    const corrupted=await snapshot();
    const view=await (await get(h.runId,'&after_seq=100')).json() as RunInspection;
    expect(view.runtime.outcome).toBe('succeeded');expect(view.completionVerified).toBe(false);expect(view.doctor).toContain('inconsistent_evidence');expect(view.journal).toEqual([]);
    const guard="AND e.value->>'approvalRequestId'=a.id::text";expect(original.split(guard)).toHaveLength(2);
    await f.owner.unsafe(original.replace(guard,''));
    const mutant=await (await get(h.runId)).json() as RunInspection;expect(mutant.completionVerified).toBe(true);expect(mutant.doctor).not.toContain('inconsistent_evidence');
    await f.owner.unsafe(original);
    const restored=await (await get(h.runId)).json() as RunInspection;expect(restored.completionVerified).toBe(false);expect(restored.doctor).toContain('inconsistent_evidence');expect(await snapshot()).toEqual(corrupted);
    console.log(JSON.stringify({inspectionIntegritySensitivity:{predicate:'handoff approvalRequestId exact link',mutantVerified:true,restoredVerified:false}}));
  }finally{
    await f.owner.unsafe(original);await f.owner.unsafe('ALTER TABLE allura.run_effect_receipts DISABLE TRIGGER immutable');
    try{await f.owner`UPDATE allura.run_effect_receipts SET receipt_text=${effect.receipt_text} WHERE id=${effect.id}::uuid`;}finally{await f.owner.unsafe('ALTER TABLE allura.run_effect_receipts ENABLE TRIGGER immutable');}
  }
  expect(await snapshot()).toEqual(baseline);expect((await (await get(h.runId)).json() as RunInspection).completionVerified).toBe(true);
});

test('run inspection validates every projected approval decision and effect field against authoritative evidence', async () => {
  const h = await setup('completed'), baseline = await snapshot();
  const response = await get(h.runId, '&after_seq=100'); expect(response.status).toBe(200);
  const control = await response.json() as RunInspection;
  expect(control.completionVerified).toBe(true); expect(control.doctor).toEqual([]); expect(control.journal).toEqual([]);
  const observed: { table: string; field: string; completionVerified: boolean; inconsistent: boolean }[] = [];
  // Only the owned synthetic fixture owner can bypass immutable evidence. This
  // is corruption diagnosis, not a claim that ordinary clients can write it.
  for (const [table, column] of [
    ['run_approval_decisions', 'decision_text'],
    ['run_approval_requests', 'request_text'],
    ['run_effect_receipts', 'receipt_text'],
  ] as const) {
    const rows = [...await f.owner.unsafe(`SELECT id,${column} AS original FROM allura.${table} WHERE run_id=$1::uuid ORDER BY id`, [h.runId])];
    for (const row of rows) {
      const original = JSON.parse(row.original) as Record<string, unknown>;
      // Include absent prepare approvalRequestId: the public projection emits null.
      const fields = Object.keys(original); if (table === 'run_effect_receipts' && !fields.includes('approvalRequestId')) { fields.push('approvalRequestId'); }
      for (const field of fields) {
        const changed = { ...original, [field]: typeof original[field] === 'number' ? (original[field] as number) + 1 : field.endsWith('Digest') || field === 'artifactSha256' ? (original[field] === '0'.repeat(64) ? '1' : '0').repeat(64) : field.endsWith('Id') || field === 'id' || original[field] === null || original[field] === undefined ? randomUUID() : 'corrupted-synthetic-evidence' };
        try {
          await f.owner.begin(async tx => {
            await tx.unsafe(`ALTER TABLE allura.${table} DISABLE TRIGGER immutable`);
            await tx.unsafe(`UPDATE allura.${table} SET ${column}=$1 WHERE id=$2::uuid`, [JSON.stringify(changed), row.id]);
            await tx.unsafe(`ALTER TABLE allura.${table} ENABLE TRIGGER immutable`);
          });
          const damaged = await get(h.runId, '&after_seq=100'); expect(damaged.status).toBe(200);
          const view = await damaged.json() as RunInspection;
          expect(view.runtime.outcome).toBe('succeeded'); expect(view.journal).toEqual([]);
          const projection = table === 'run_approval_decisions' ? view.decision : table === 'run_approval_requests' ? view.approval : view.effects.find(e => e.id === changed.id);
          expect((projection as unknown as Record<string, unknown>)[field]).toEqual(changed[field]);
          observed.push({ table, field, completionVerified: view.completionVerified, inconsistent: view.doctor.includes('inconsistent_evidence') });
          console.log(JSON.stringify({ inspectionProjectionCorruption: observed.at(-1) }));
        } finally {
          await f.owner.begin(async tx => {
            await tx.unsafe(`ALTER TABLE allura.${table} DISABLE TRIGGER immutable`);
            await tx.unsafe(`UPDATE allura.${table} SET ${column}=$1 WHERE id=$2::uuid`, [row.original, row.id]);
            await tx.unsafe(`ALTER TABLE allura.${table} ENABLE TRIGGER immutable`);
          });
        }
        expect(await snapshot()).toEqual(baseline);
        const restored = await (await get(h.runId, '&after_seq=100')).json() as RunInspection;
        expect(restored.completionVerified).toBe(true); expect(restored.doctor).toEqual([]); expect(restored.journal).toEqual([]);
        console.log(JSON.stringify({ inspectionProjectionRestored: { table, field, completionVerified: restored.completionVerified, unchanged: true } }));
      }
    }
  }
  expect(observed.length).toBeGreaterThan(0);
  expect(observed.filter(o => o.completionVerified || !o.inconsistent)).toEqual([]);
}, 20000);

test('run inspection database time observes lease retry attempts approval and deadline without repair', async () => {
  const h=await setup();
  await scopedTransaction(f.app,f.identities.author,f.scope,'workspace:grants:manage',async tx=>tx`SELECT allura.claim_run_prepare(${f.scope.groupId},${f.scope.workspaceId}::uuid,${{runId:h.runId,expectedRevision:1,operationKey:randomUUID()}}::jsonb,${await runDefinition()}::jsonb,${randomUUID()}::uuid)`);
  const [time]=await f.owner`SELECT greatest(0,ceil(extract(epoch FROM(due_at-clock_timestamp()))*1000))::int AS ms FROM allura.run_steps WHERE run_id=${h.runId}::uuid AND step_id='prepare'`;
  await Bun.sleep(time.ms+10);
  expect((await f.owner`SELECT lease_until<=clock_timestamp() AS expired,due_at<=clock_timestamp() AS due FROM allura.run_steps WHERE run_id=${h.runId}::uuid AND step_id='prepare'`)[0]).toEqual({expired:true,due:true});
  const before=await snapshot(),view=await (await get(h.runId,'&after_seq=100')).json() as RunInspection;
  expect(view.doctor).toContain('lease_expired');expect(view.doctor).toContain('retry_due');expect(view.runtime.phase).toBe('running');expect(view.journal).toEqual([]);expect(await snapshot()).toEqual(before);
  await f.owner`UPDATE allura.run_steps SET attempts=3 WHERE run_id=${h.runId}::uuid AND step_id='prepare'`;
  expect((await (await get(h.runId)).json() as RunInspection).doctor).toContain('attempts_exhausted');
  const paused=await setup('paused');
  // Deliberate backdated owned fixture: an observational DB-time expiry witness,
  // not a claim that a natural24h retention acceptance was performed.
  const [approval]=await f.owner`SELECT created_at,expires_at,request_text FROM allura.run_approval_requests WHERE run_id=${paused.runId}::uuid`;
  const [record]=await f.owner`SELECT created_at,expires_at FROM allura.run_records WHERE id=${paused.runId}::uuid`;
  try {
    await f.owner.unsafe('ALTER TABLE allura.run_approval_requests DISABLE TRIGGER immutable; ALTER TABLE allura.run_records DISABLE TRIGGER immutable');
    await f.owner`UPDATE allura.run_approval_requests SET created_at=created_at-interval '2 days',expires_at=expires_at-interval '2 days' WHERE run_id=${paused.runId}::uuid`;
    await f.owner`UPDATE allura.run_records SET created_at=created_at-interval '2 days',expires_at=expires_at-interval '2 days' WHERE id=${paused.runId}::uuid`;
    await f.owner.unsafe('ALTER TABLE allura.run_approval_requests ENABLE TRIGGER immutable; ALTER TABLE allura.run_records ENABLE TRIGGER immutable');
    const expired=await (await get(paused.runId,'&limit=1')).json() as RunInspection;expect(expired.doctor).toContain('approval_expired');expect(expired.doctor).toContain('deadline');expect(expired.runtime.phase).toBe('paused_approval');
  }finally{
    await f.owner.unsafe('ALTER TABLE allura.run_approval_requests DISABLE TRIGGER immutable; ALTER TABLE allura.run_records DISABLE TRIGGER immutable');
    try{await f.owner`UPDATE allura.run_approval_requests SET created_at=${approval.created_at},expires_at=${approval.expires_at},request_text=${approval.request_text} WHERE run_id=${paused.runId}::uuid`;await f.owner`UPDATE allura.run_records SET created_at=${record.created_at},expires_at=${record.expires_at} WHERE id=${paused.runId}::uuid`;}finally{await f.owner.unsafe('ALTER TABLE allura.run_approval_requests ENABLE TRIGGER immutable; ALTER TABLE allura.run_records ENABLE TRIGGER immutable');}
  }
},20000);

test('run inspection missing and changed installed source preserves authorized pinned history', async () => {
  const {mkdtemp,cp,symlink,rm,writeFile,readFile}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
  const h=await setup('completed'),before=await snapshot(),root=new URL('../../foundation/',import.meta.url).pathname,dir=await mkdtemp(join(tmpdir(),'inspection-source-'));
  try {
    await cp(join(root,'src'),join(dir,'src'),{recursive:true});await cp(join(root,'migrations'),join(dir,'migrations'),{recursive:true});await symlink(join(root,'node_modules'),join(dir,'node_modules'));
    const service=await import(join(dir,'src/runs.ts')) as typeof import('../src/runs.ts'),auth=await import(join(dir,'src/authentication.ts')) as typeof import('../src/authentication.ts');
    const identity=auth.authenticateHuman({assertion:f.jwt('curator')},f.humanConfig);
    const control=await service.inspectRun(f.app,identity,f.scope,query(h.runId));expect(control.doctor).toEqual([]);
    const source=join(dir,'src/gateway.ts'),bytes=await readFile(source);await writeFile(source,Buffer.concat([bytes,Buffer.from('\n// owned source drift probe\n')]));
    const drift=await service.inspectRun(f.app,identity,f.scope,query(h.runId));expect(drift.doctor).toContain('definition_drift');expect(drift.definition).toEqual(control.definition);expect(drift.completionVerified).toBe(true);expect(drift.installedDefinitionAvailable).toBe(true);
    await rm(source);const missing=await service.inspectRun(f.app,identity,f.scope,query(h.runId));expect(missing.doctor).toContain('definition_drift');expect(missing.definition).toEqual(control.definition);expect(missing.installedDefinitionAvailable).toBe(false);expect(await snapshot()).toEqual(before);
  }finally{await rm(dir,{recursive:true,force:true});expect(await Bun.file(join(dir,'src/runs.ts')).exists()).toBe(false);}
});

test('run inspection missing committed success journal approval links cannot verify completion', async () => {
  const h=await setup('completed'),before=await snapshot();
  const rows=[...await f.owner`SELECT seq,approval_request_id FROM allura.run_journal WHERE run_id=${h.runId}::uuid AND step_id='handoff' AND kind IN ('effect_committed','terminated')`];expect(rows).toHaveLength(2);
  try {
    await f.owner.unsafe('ALTER TABLE allura.run_journal DISABLE TRIGGER immutable');
    await f.owner`UPDATE allura.run_journal SET approval_request_id=NULL WHERE run_id=${h.runId}::uuid AND step_id='handoff' AND kind IN ('effect_committed','terminated')`;
    await f.owner.unsafe('ALTER TABLE allura.run_journal ENABLE TRIGGER immutable');
    const view=await (await get(h.runId,'&limit=1')).json() as RunInspection;
    expect(view.runtime.outcome).toBe('succeeded');expect(view.completionVerified).toBe(false);expect(view.doctor).toContain('inconsistent_evidence');
  }finally{
    await f.owner.unsafe('ALTER TABLE allura.run_journal DISABLE TRIGGER immutable');
    try{for(const row of rows){await f.owner`UPDATE allura.run_journal SET approval_request_id=${row.approval_request_id}::uuid WHERE run_id=${h.runId}::uuid AND seq=${row.seq}`;}}finally{await f.owner.unsafe('ALTER TABLE allura.run_journal ENABLE TRIGGER immutable');}
  }
  expect(await snapshot()).toEqual(before);
});
