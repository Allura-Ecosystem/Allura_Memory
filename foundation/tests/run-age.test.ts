import { test, expect, beforeAll, afterAll } from 'bun:test';
import { SQL } from 'bun';
import { createHash, randomUUID } from 'node:crypto';
import { fixture } from './lifecycle-fixture.ts';
import { startRun } from '../src/runs.ts';
import { scopedTransaction } from '../src/persistence.ts';
import { runDefinition } from '../src/run-contract.ts';
import { finishPreparation, type PreparationClaim } from '../src/run-execution.ts';
import { type Scope } from '../src/authority.ts';

let f: Awaited<ReturnType<typeof fixture>>;
beforeAll(async () => { f = await fixture(`allura-run-age-${randomUUID()}`); });
afterAll(async () => { await f?.close(); });
const tables = ['run_definitions', 'run_records', 'run_state', 'run_steps', 'run_journal', 'run_operation_receipts', 'run_effect_receipts', 'run_approval_requests', 'run_approval_decisions', 'run_handoff_links'];
async function workspace() {
  const scope = { ...f.scope, workspaceId: randomUUID() };
  await f.owner`INSERT INTO allura.workspaces(group_id,id,display_name,created_by) VALUES(${scope.groupId},${scope.workspaceId}::uuid,'Run age fixture',${f.ids.author}::uuid)`;
  for (const id of [f.ids.author, f.ids.reviewer]) { await f.owner`INSERT INTO allura.workspace_grants(group_id,workspace_id,principal_id,role,issuer) VALUES(${scope.groupId},${scope.workspaceId}::uuid,${id}::uuid,'workspace_admin',${f.ids.author}::uuid)`; }
  return scope;
}
async function started(scope: Scope) {
  const text = 'Synthetic run age evidence';
  const input = { operationKey: randomUUID(), definitionId: 'local-evidence-handoff', definitionRevision: 9, goal: 'Independent run age', reviewerPrincipalId: f.ids.reviewer, artifact: { text, expectedSha256: createHash('sha256').update(text).digest('hex'), sourceRevision: null } };
  const receipt = await startRun(f.app, f.identities.author, scope, input);
  return { input, receipt, command: { runId: JSON.parse(receipt).runId as string, expectedRevision: 1, operationKey: randomUUID() } };
}
async function snapshot(scope: Scope) {
  return Object.fromEntries(await Promise.all(tables.map(async table => [table, [...await f.owner.unsafe(`SELECT to_jsonb(t)::text AS row FROM allura.${table} t WHERE group_id=$1 AND workspace_id=$2::uuid ORDER BY 1`, [scope.groupId, scope.workspaceId])]])));
}
async function domain() {
  return Promise.all(['events', 'semantic_versions', 'proposal_state'].map(async table => [...await f.owner.unsafe(`SELECT to_jsonb(t)::text AS row FROM allura.${table} t WHERE group_id=$1 ORDER BY 1`, [f.scope.groupId])]));
}
async function definitions() {
  return {
    functions: [...await f.owner`SELECT p.oid::regprocedure::text AS identity,pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='allura' ORDER BY 1`],
    triggers: [...await f.owner`SELECT t.tgrelid::regclass::text AS relation,t.tgname,pg_get_triggerdef(t.oid) AS definition,t.tgenabled FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='allura' AND NOT t.tgisinternal ORDER BY 1,2`],
  };
}
async function timing(runId: string) {
  return (await f.owner`SELECT clock_timestamp()::text AS observed_at,r.created_at::text,r.expires_at::text,r.expires_at-r.created_at=interval '24 hours' AS exact_interval,clock_timestamp()<r.expires_at AS age_valid,clock_timestamp()<st.lease_until AS lease_valid,st.lease_until::text,extract(epoch FROM (r.expires_at-clock_timestamp()))*1000 AS remaining_ms FROM allura.run_records r JOIN allura.run_steps st ON st.run_id=r.id AND st.step_id='prepare' WHERE r.id=${runId}::uuid`)[0]!;
}

// Both barriers enter after the early age check; only the final guard rejects.
async function preparationBarrier(deferred: boolean) {
  const normal = await workspace(), accelerated = await workspace(), foreign = await workspace();
  const foreignRun = await started(foreign), foreignBefore = await snapshot(foreign), domainBefore = await domain();
  const sqlBefore = await definitions();
  try {
    // Accelerated INSERT-time historical timestamp fixture, not naturally elapsed
    // 24 hours. Production admission/receipt time, clocks and policy stay real.
    await f.owner.unsafe(`CREATE FUNCTION allura.run_age_insert_fixture() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.workspace_id='${accelerated.workspaceId}'::uuid THEN
        IF NEW.expires_at-NEW.created_at IS DISTINCT FROM interval '24 hours' THEN RAISE EXCEPTION 'incoming age interval changed'; END IF;
        NEW.expires_at:=NEW.created_at+interval '1500 milliseconds';
        NEW.created_at:=NEW.expires_at-interval '24 hours';
      END IF; RETURN NEW; END $$;
      CREATE TRIGGER run_age_insert_fixture BEFORE INSERT ON allura.run_records FOR EACH ROW EXECUTE FUNCTION allura.run_age_insert_fixture()`);
    for (const [scope, expire] of [[normal, false], [accelerated, true]] as const) {
      const h = await started(scope), runId = h.command.runId;
      const [admission] = await f.owner`SELECT r.created_at::text,r.expires_at::text,o.accepted_at::text AS admitted_at,r.expires_at-r.created_at=interval '24 hours' AS exact_interval,r.expires_at=o.accepted_at+interval '1500 milliseconds' AS accelerated,r.created_at=o.accepted_at AS natural,abs(extract(epoch FROM ((o.receipt_text::jsonb->>'acceptedAt')::timestamptz-o.accepted_at)))<0.001 AS receipt_time_matches,o.receipt_text FROM allura.run_records r JOIN allura.run_operation_receipts o ON o.run_id=r.id AND o.command='start' WHERE r.id=${runId}::uuid`;
      expect(admission.exact_interval).toBe(true); expect(admission.accelerated).toBe(expire); expect(admission.natural).toBe(!expire);
      expect(admission.receipt_time_matches).toBe(true); expect(admission.receipt_text).toBe(h.receipt);
      const d = await runDefinition();
      const claimed = await scopedTransaction(f.app, f.identities.author, scope, 'workspace:grants:manage', async tx => (await tx`SELECT allura.claim_run_prepare(${scope.groupId},${scope.workspaceId}::uuid,${h.command}::jsonb,${d}::jsonb,${randomUUID()}::uuid) AS result`)[0].result as { receipt: string; claim: PreparationClaim | null });
      expect(claimed.claim).not.toBeNull(); expect(JSON.parse(claimed.receipt).phaseAtAcceptance).toBe('running');
      const before = await snapshot(scope), initial = await timing(runId);
      expect(initial.age_valid).toBe(true); expect(initial.lease_valid).toBe(true);
      expect(before.run_effect_receipts).toEqual([]); expect(before.run_approval_requests).toEqual([]); expect(before.run_approval_decisions).toEqual([]);
      const app = new SQL(f.appUrl, { max: 1 }), gate = new SQL(process.env.ALLURA_DISPOSABLE_DB_URL!, { max: 1 });
      let release = () => {}, holding: Promise<unknown> | undefined, pending: Promise<{ result: string; elapsedMs: number }> | undefined;
      try {
        const pid = (await app`SELECT pg_backend_pid() AS pid`)[0].pid as number, gatePid = (await gate`SELECT pg_backend_pid() AS pid`)[0].pid as number;
        expect(pid).not.toBe(gatePid);
        expect((await app`SELECT rolname,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user`)[0]).toEqual({ rolname: 'allura_app', rolsuper: false, rolbypassrls: false });
        await f.owner.unsafe(`CREATE FUNCTION allura.run_age_deferred_fixture() RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN IF NEW.run_id='${runId}'::uuid THEN
            IF clock_timestamp()>='${initial.expires_at}'::timestamptz THEN RAISE EXCEPTION 'age expired before deferred barrier entry'; END IF;
            PERFORM pg_advisory_xact_lock(120053);
          END IF; RETURN NEW; END $$;
          CREATE ${deferred ? 'CONSTRAINT ' : ''}TRIGGER run_age_deferred_fixture AFTER INSERT ON allura.run_effect_receipts ${deferred ? 'DEFERRABLE INITIALLY DEFERRED' : ''} FOR EACH ROW EXECUTE FUNCTION allura.run_age_deferred_fixture()`);
        let ready = () => {}; const entered = new Promise<void>(r => { ready = r; }), wait = new Promise<void>(r => { release = r; });
        holding = gate.begin(async tx => { await tx`SELECT pg_advisory_xact_lock(120053)`; ready(); await wait; }); await entered;
        const began = performance.now();
        pending = finishPreparation(app, f.identities.author, scope, claimed.claim!).then(() => ({ result: 'committed', elapsedMs: performance.now() - began }), error => ({ result: (error as Error).message, elapsedMs: performance.now() - began }));
        let observed = false;
        for (let i = 0; i < 100; i++) {
          const [activity] = await f.owner`SELECT ${gatePid}::int=ANY(pg_blocking_pids(${pid}::int)) AS blocked,query,wait_event_type,wait_event FROM pg_stat_activity WHERE pid=${pid}::int`;
          if (activity?.blocked) {
            expect(activity.query).toMatch(/^SELECT allura\.finish_run_prepare\(/);
            expect(activity.wait_event_type).toBe('Lock'); expect(activity.wait_event).toBe('advisory');
            const atBarrier = await timing(runId); expect(atBarrier.age_valid).toBe(true); expect(atBarrier.lease_valid).toBe(true);
            console.log(JSON.stringify({ runAgeDeferredBarrier: { deferred, expire, runId, waiter: pid, blocker: gatePid, activity, timing: atBarrier } }));
            observed = true; break;
          }
          await Bun.sleep(5);
        }
        expect(observed).toBe(true);
        if (expire) {
          let expired = false;
          for (let i = 0; i < 350; i++) { if (!(await timing(runId)).age_valid) { expired = true; break; } await Bun.sleep(5); }
          expect(expired).toBe(true);
        } else { await Bun.sleep(1500); }
        const atRelease = await timing(runId);
        expect(atRelease.age_valid).toBe(!expire); expect(atRelease.lease_valid).toBe(true); expect(atRelease.exact_interval).toBe(true);
        expect(performance.now() - began).toBeLessThan(2000);
        release(); await holding;
        const outcome = await pending, after = await snapshot(scope);
        const [settled] = await f.owner`SELECT clock_timestamp()::text AS observed_at,clock_timestamp()>=expires_at AS expired,clock_timestamp()<${initial.lease_until}::timestamptz AS original_lease_valid FROM allura.run_records WHERE id=${runId}::uuid`;
        console.log(JSON.stringify({ runAgeDeferredOutcome: { deferred, expire, admission, initial, atRelease, settled, outcome, changedTables: tables.filter(table => JSON.stringify(before[table]) !== JSON.stringify(after[table])), before, after } }));
        expect(outcome.elapsedMs).toBeLessThan(2000); expect(settled.original_lease_valid).toBe(true); expect(settled.expired).toBe(expire);
        expect(await snapshot(foreign)).toEqual(foreignBefore); expect(await domain()).toEqual(domainBefore);
        expect(await startRun(f.app, f.identities.author, foreign, foreignRun.input)).toBe(foreignRun.receipt);
        if (expire) {
          expect(outcome.result).toBe('conflict');
          expect(after).toEqual(before);
        } else {
          expect(outcome.result).toBe('committed');
          expect(after.run_effect_receipts).toHaveLength(1); expect(after.run_approval_requests).toHaveLength(1);
          expect((await f.owner`SELECT phase FROM allura.run_state WHERE run_id=${runId}::uuid`)[0].phase).toBe('paused_approval');
        }
      } finally {
        release(); await Promise.allSettled([holding, pending]);
        if (pending) { console.log(JSON.stringify({ runAgeSettledOperation: { runId, outcome: await pending } })); }
        await app.close(); await gate.close();
        await f.owner.unsafe('DROP TRIGGER IF EXISTS run_age_deferred_fixture ON allura.run_effect_receipts; DROP FUNCTION IF EXISTS allura.run_age_deferred_fixture()');
        const [cleanup] = await f.owner`SELECT NOT EXISTS(SELECT FROM pg_trigger WHERE tgname='run_age_deferred_fixture') AND to_regprocedure('allura.run_age_deferred_fixture()') IS NULL AS removed`;
        expect(cleanup.removed).toBe(true); console.log(JSON.stringify({ runAgeDeferredCleanup: { runId, removed: cleanup.removed } }));
      }
    }
  } finally {
    await f.owner.unsafe('DROP TRIGGER IF EXISTS run_age_insert_fixture ON allura.run_records; DROP FUNCTION IF EXISTS allura.run_age_insert_fixture()');
    expect(await definitions()).toEqual(sqlBefore);
    expect(await snapshot(foreign)).toEqual(foreignBefore); expect(await domain()).toEqual(domainBefore);
    console.log(JSON.stringify({ runAgeFinalCleanup: { exactFunctionAndTriggerDefinitionsRestored: true, foreignTenTableSnapshotPreserved: true, semanticSnapshotPreserved: true } }));
  }
}

test('run age expiry during deferred preparation constraints cannot commit expired effects', async () => {
  await preparationBarrier(true);
}, 15000);
test('run age expiry during nondeferred preparation writes cannot commit expired effects', async () => {
  await preparationBarrier(false);
}, 15000);

async function expiredPreparation(claimBeforeExpiry: boolean) {
  const normal = await workspace(), accelerated = await workspace(), foreign = await workspace();
  const foreignRun = await started(foreign), foreignBefore = await snapshot(foreign), domainBefore = await domain(), sqlBefore = await definitions();
  try {
    await f.owner.unsafe(`CREATE FUNCTION allura.run_age_insert_fixture() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.workspace_id='${accelerated.workspaceId}'::uuid THEN
        IF NEW.expires_at-NEW.created_at IS DISTINCT FROM interval '24 hours' THEN RAISE EXCEPTION 'incoming age interval changed'; END IF;
        NEW.expires_at:=NEW.created_at+interval '1500 milliseconds';
        NEW.created_at:=NEW.expires_at-interval '24 hours';
      END IF; RETURN NEW; END $$;
      CREATE TRIGGER run_age_insert_fixture BEFORE INSERT ON allura.run_records FOR EACH ROW EXECUTE FUNCTION allura.run_age_insert_fixture()`);
    const d = await runDefinition();
    for (const [scope, expire] of [[normal, false], [accelerated, true]] as const) {
      const h = await started(scope), runId = h.command.runId;
      const initial = await timing(runId); expect(initial.age_valid).toBe(true); expect(initial.exact_interval).toBe(true);
      const [admission] = await f.owner`SELECT r.created_at=o.accepted_at AS natural,r.expires_at=o.accepted_at+interval '1500 milliseconds' AS accelerated FROM allura.run_records r JOIN allura.run_operation_receipts o ON o.run_id=r.id AND o.command='start' WHERE r.id=${runId}::uuid`;
      expect(admission.natural).toBe(!expire); expect(admission.accelerated).toBe(expire);
      const claim = () => scopedTransaction(f.app, f.identities.author, scope, 'workspace:grants:manage', async tx => (await tx`SELECT allura.claim_run_prepare(${scope.groupId},${scope.workspaceId}::uuid,${h.command}::jsonb,${d}::jsonb,${randomUUID()}::uuid) AS result`)[0].result as { receipt: string; claim: PreparationClaim | null });
      let c: Awaited<ReturnType<typeof claim>> | undefined;
      if (claimBeforeExpiry) { c = await claim(); expect(c.claim).not.toBeNull(); expect((await timing(runId)).lease_valid).toBe(true); }
      const before = await snapshot(scope);
      expect(before.run_effect_receipts).toEqual([]); expect(before.run_approval_requests).toEqual([]); expect(before.run_approval_decisions).toEqual([]);
      if (expire) {
        let expired = false;
        for (let i = 0; i < 350; i++) { if (!(await timing(runId)).age_valid) { expired = true; break; } await Bun.sleep(5); }
        expect(expired).toBe(true);
      }
      const atEntry = await timing(runId); expect(atEntry.age_valid).toBe(!expire);
      const began = performance.now();
      if (claimBeforeExpiry) {
        expect(atEntry.lease_valid).toBe(true);
        if (expire) { await expect(finishPreparation(f.app, f.identities.author, scope, c!.claim!)).rejects.toThrow('conflict'); expect(await snapshot(scope)).toEqual(before); }
        else { await finishPreparation(f.app, f.identities.author, scope, c!.claim!); }
        expect((await f.owner`SELECT clock_timestamp()<${atEntry.lease_until}::timestamptz AS valid`)[0].valid).toBe(true);
      } else {
        c = await claim();
        expect(c.claim === null).toBe(expire);
        expect(JSON.parse(c.receipt).phaseAtAcceptance).toBe(expire ? 'terminal' : 'running');
        if (!expire) { await finishPreparation(f.app, f.identities.author, scope, c.claim!); }
      }
      const elapsedMs = performance.now()-began; expect(elapsedMs).toBeLessThan(2000);
      const after = await snapshot(scope), [state] = await f.owner`SELECT phase,outcome,reason FROM allura.run_state WHERE run_id=${runId}::uuid`;
      if (expire && !claimBeforeExpiry) {
        expect(state).toEqual({ phase: 'terminal', outcome: 'failed', reason: 'deadline' });
        for (const table of ['run_definitions','run_records','run_effect_receipts','run_approval_requests','run_approval_decisions','run_handoff_links']) { expect(after[table]).toEqual(before[table]); }
        expect(after.run_journal!.length).toBe(before.run_journal!.length+1); expect(after.run_operation_receipts!.length).toBe(before.run_operation_receipts!.length+1);
        expect((await f.owner`SELECT attempts,lease_id,invocation_id,lease_until,due_at FROM allura.run_steps WHERE run_id=${runId}::uuid AND step_id='prepare'`)[0]).toEqual({ attempts: 0, lease_id: null, invocation_id: null, lease_until: null, due_at: null });
      } else if (!expire) { expect(state.phase).toBe('paused_approval'); expect(after.run_effect_receipts).toHaveLength(1); expect(after.run_approval_requests).toHaveLength(1); }
      expect(await startRun(f.app, f.identities.author, scope, h.input)).toBe(h.receipt);
      expect(await snapshot(scope)).toEqual(after);
      expect(await snapshot(foreign)).toEqual(foreignBefore); expect(await domain()).toEqual(domainBefore);
      console.log(JSON.stringify({ runAgeEntryBoundary: { claimBeforeExpiry, expire, admission, initial, atEntry, elapsedMs, state, before, after } }));
    }
    expect(await startRun(f.app, f.identities.author, foreign, foreignRun.input)).toBe(foreignRun.receipt);
  } finally {
    await f.owner.unsafe('DROP TRIGGER IF EXISTS run_age_insert_fixture ON allura.run_records; DROP FUNCTION IF EXISTS allura.run_age_insert_fixture()');
    expect(await definitions()).toEqual(sqlBefore); expect(await snapshot(foreign)).toEqual(foreignBefore); expect(await domain()).toEqual(domainBefore);
  }
}
test('run age expired fresh preparation claim terminates without effects', async () => {
  await expiredPreparation(false);
}, 15000);
test('run age expired preparation finish rolls back while original lease remains valid', async () => {
  await expiredPreparation(true);
}, 15000);
