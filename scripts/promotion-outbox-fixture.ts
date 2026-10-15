// Bundled only by smoke-promotion-outbox.ts into an isolated disposable database test.
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { drainPromotionOutbox } from "../src/lib/memory/promotion-outbox-worker";
import { closePool, getAppPool } from "../src/lib/postgres/connection";

assert.notEqual(process.getuid?.(), 0);
const { password, migrations } = JSON.parse(await Bun.stdin.text());
assert(/^[a-f0-9]{64}$/.test(password));
const appPassword = randomBytes(32).toString("hex");
Object.assign(process.env, {
  POSTGRES_HOST: "127.0.0.1", POSTGRES_PORT: "5432", POSTGRES_DB: "memory",
  POSTGRES_USER: "sep_owner", POSTGRES_PASSWORD: password,
  POSTGRES_APP_USER: "allura_app", POSTGRES_APP_PASSWORD: appPassword,
});
const owner = new pg.Pool({ host: "127.0.0.1", database: "memory", user: "sep_owner", password,
  connectionTimeoutMillis: 1000, statement_timeout: 10000 });
try {
  for (let attempt = 0; ; attempt++) {
    try { await owner.query("SELECT 1"); break; }
    catch (error) { if (attempt >= 80) throw error; await Bun.sleep(200); }
  }
  assert.equal((await owner.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'")).rows[0].n, 0);
  for (const { sql } of migrations) await owner.query(sql);
  await owner.query(`ALTER ROLE allura_app PASSWORD '${appPassword}'`);
  assert.deepEqual((await owner.query("SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname='allura_app'")).rows[0], { rolsuper: false, rolbypassrls: false });
  console.log(`PASS: ${migrations.length} migrations; restricted app role on fresh database`);
  const scopes = [["allura-outbox-a", "outbox-a1"], ["allura-outbox-a", "outbox-a2"], ["allura-outbox-b", "outbox-b1"]];
  for (const [group, workspace] of scopes) await owner.query("INSERT INTO workspaces(workspace_id,group_id,name) VALUES($1,$2,$1)", [workspace, group]);
  // Seed committed fixtures, not an approval-service or human-approval test.
  async function seed(index = 0, delay = "-1 minute", attempts = 0, quarantine = false) {
    const [group, workspace] = scopes[index];
    const proposal = randomUUID(), memory = randomUUID(), id = randomUUID();
    await owner.query("INSERT INTO canonical_proposals(id,group_id,workspace_id,content,score,tier,status,approved_memory_id,decided_by) VALUES($1,$2,$3,'synthetic committed fixture',0.9,'mainstream','approved',$4,'fixture-curator')", [proposal, group, workspace, memory]);
    await owner.query("INSERT INTO graph_memories(id,group_id,workspace_id,content) VALUES($1,$2,$3,'synthetic committed fixture')", [memory, group, workspace]);
    await owner.query("INSERT INTO promotion_outbox(id,group_id,workspace_id,workspace_scope_state,proposal_id,memory_id,payload,available_at,attempts) VALUES($1,$2,$3,$4,$5,$6,$7,NOW()+$8::interval,$9)",
      [id, group, quarantine ? null : workspace, quarantine ? "legacy_quarantined" : "workspace_scoped", proposal, memory, JSON.stringify({ memory_id: memory, group_id: "forged", workspace_id: "forged" }), delay, attempts]);
    return { id, proposal, memory, group, workspace };
  }
  const future = await seed(0, "1 day");
  await owner.query("UPDATE promotion_outbox SET status='failed' WHERE id=$1", [future.id]);
  const exhausted = await seed(0, "-1 minute", 5);
  const quarantine = await seed(0, "-1 minute", 0, true);
  const unapproved = randomUUID();
  await owner.query("INSERT INTO canonical_proposals(id,group_id,workspace_id,content,score,tier,status) VALUES($1,$2,$3,'synthetic pending fixture',0.9,'mainstream','pending')", [unapproved, ...scopes[0]]);
  assert.deepEqual(await drainPromotionOutbox(owner), { delivered: 0, failed: 0, pending: 2 }, "Future/exhausted/quarantined records must not deliver");
  console.log("PASS: future, exhausted and quarantined rows excluded; pending count includes future/exhausted scoped rows");
  const due = [await seed(0), await seed(1), await seed(2)];
  await owner.query("UPDATE promotion_outbox SET status='failed' WHERE id=$1", [due[0].id]);
  assert.deepEqual(await drainPromotionOutbox(owner), { delivered: 3, failed: 0, pending: 2 });
  assert.deepEqual(await drainPromotionOutbox(owner), { delivered: 0, failed: 0, pending: 2 });
  for (const row of due) {
    const events = await owner.query("SELECT group_id,workspace_id,metadata FROM events WHERE event_type='canonical_memory_promoted' AND metadata->>'outbox_id'=$1", [row.id]);
    assert.equal(events.rows.length, 1);
    assert.equal(events.rows[0].group_id, row.group);
    assert.equal(events.rows[0].workspace_id, row.workspace);
    assert.equal(events.rows[0].metadata.group_id, row.group);
    assert.equal(events.rows[0].metadata.workspace_id, row.workspace);
  }
  console.log("PASS: exactly one scoped delivery each across three workspaces/two tenants; payload cannot override scope");
  // Deterministically change eligibility after discovery but before the scoped claim.
  for (const change of ["available_at=NOW()+INTERVAL '1 day'", "attempts=5"]) {
    const row = await seed();
    const discovery = { query: async (sql: string, values: unknown[]) => {
      const result = await owner.query(sql, values);
      if (sql.startsWith("SELECT id,")) await owner.query(`UPDATE promotion_outbox SET ${change} WHERE id=$1`, [row.id]);
      return result;
    } } as unknown as pg.Pool;
    assert.equal((await drainPromotionOutbox(discovery)).delivered, 0, `Stale discovery must recheck ${change}`);
    assert.equal((await owner.query("SELECT count(*)::int AS n FROM events WHERE metadata->>'outbox_id'=$1", [row.id])).rows[0].n, 0);
  }
  console.log("PASS: scoped claim rechecks retry time and attempt budget after stale discovery");
  async function simultaneousDrains(id: string) {
    // Fixture-only owner lock makes BOTH real app-role claims wait. Combined
    // with the discovery barrier this avoids a timing/sleep-only race test.
    const blocker = await owner.connect();
    let arrivals = 0;
    let release = () => {};
    let barrierTimer: ReturnType<typeof setTimeout> | undefined;
    const barrier = new Promise<void>((resolve, reject) => {
      release = resolve;
      barrierTimer = setTimeout(() => reject(new Error("Concurrent discovery barrier timed out")), 5000);
    });
    const discovery = { query: async (sql: string, values: unknown[]) => {
      const result = await owner.query(sql, values);
      if (sql.startsWith("SELECT id,")) {
        assert(result.rows.some(row => row.id === id));
        if (++arrivals === 2) release();
        await barrier;
      }
      return result;
    } } as unknown as pg.Pool;
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT id FROM promotion_outbox WHERE id=$1 FOR UPDATE", [id]);
      // Attach rejection handling immediately, including while observing locks.
      const pair = Promise.all([drainPromotionOutbox(discovery), drainPromotionOutbox(discovery)])
        .then(value => ({ value }), (error: unknown) => ({ error }));
      try {
        for (let poll = 0; ; poll++) {
          const waiting = await owner.query(`SELECT count(*)::int AS n FROM pg_stat_activity
            WHERE datname=current_database() AND usename='allura_app'
              AND query LIKE 'UPDATE promotion_outbox SET status=''processing''%'
              AND cardinality(pg_blocking_pids(pid))>0`);
          if (waiting.rows[0].n === 2) break;
          assert(poll < 400, "Both app-role claims must be observed waiting before release");
          await Bun.sleep(10);
        }
      } finally { await blocker.query("ROLLBACK"); }
      const outcome = await pair;
      if ("error" in outcome) throw outcome.error;
      assert.equal(arrivals, 2);
      return outcome.value;
    } finally {
      clearTimeout(barrierTimer);
      await blocker.query("ROLLBACK");
      blocker.release();
    }
  }
  const retry = await seed();
  await owner.query(`CREATE FUNCTION sep_reject_delivery() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.metadata->>'outbox_id'='${retry.id}' THEN RAISE EXCEPTION 'synthetic delivery failure'; END IF; RETURN NEW; END $$`);
  await owner.query("CREATE TRIGGER sep_reject_delivery BEFORE INSERT ON events FOR EACH ROW EXECUTE FUNCTION sep_reject_delivery()");
  const failures = await simultaneousDrains(retry.id);
  assert.equal(failures.reduce((sum, result) => sum + result.failed, 0), 1);
  assert.equal(failures.reduce((sum, result) => sum + result.delivered, 0), 0);
  const delayed = (await owner.query("SELECT status,attempts,available_at>NOW() AS delayed,last_error,delivered_at FROM promotion_outbox WHERE id=$1", [retry.id])).rows[0];
  assert.deepEqual(delayed, { status: "pending", attempts: 1, delayed: true, last_error: "synthetic delivery failure", delivered_at: null });
  assert.equal((await owner.query("SELECT count(*)::int AS n FROM events WHERE metadata->>'outbox_id'=$1", [retry.id])).rows[0].n, 0);
  const backedOff = await drainPromotionOutbox(owner);
  assert.equal(backedOff.failed, 0, "Backoff must prevent immediate retry");
  assert.equal(backedOff.delivered, 0);
  await owner.query("DROP TRIGGER sep_reject_delivery ON events");
  await owner.query("UPDATE promotion_outbox SET available_at=NOW()-INTERVAL '1 second' WHERE id=$1", [retry.id]);
  const retries = await simultaneousDrains(retry.id);
  assert.equal(retries.reduce((sum, result) => sum + result.delivered, 0), 1);
  assert.equal(retries.reduce((sum, result) => sum + result.failed, 0), 0);
  assert.deepEqual((await owner.query("SELECT status,attempts FROM promotion_outbox WHERE id=$1", [retry.id])).rows[0], { status: "delivered", attempts: 1 });
  assert.equal((await owner.query("SELECT count(*)::int AS n FROM events WHERE metadata->>'outbox_id'=$1", [retry.id])).rows[0].n, 1);
  assert.equal((await drainPromotionOutbox(owner)).delivered, 0);
  console.log("PASS: simultaneous failed drains commit one failed attempt/backoff and zero events; concurrent due retry emits exactly once");
  const concurrent = await seed();
  const pair = await simultaneousDrains(concurrent.id);
  assert.equal(pair.reduce((sum, result) => sum + result.delivered, 0), 1);
  assert.equal(pair.reduce((sum, result) => sum + result.failed, 0), 0);
  assert.equal((await owner.query("SELECT count(*)::int AS n FROM events WHERE metadata->>'outbox_id'=$1", [concurrent.id])).rows[0].n, 1);

  // Inject transport acknowledgement loss AFTER a real COMMIT. This is not a
  // real network fault or an unknown-outcome recovery/replay procedure.
  const uncertain = await seed();
  const app = getAppPool();
  const acknowledgementError = new Error("synthetic acknowledgement loss after real COMMIT");
  let injected = 0;
  let restoreQuery = () => {};
  const intercept = (client: pg.PoolClient) => {
    const original = client.query;
    restoreQuery = () => { client.query = original; };
    client.query = new Proxy(original, {
      apply(target, thisArg, args) {
        const result = Reflect.apply(target, thisArg, args);
        if (args[0] === "COMMIT" && injected === 0) {
          return Promise.resolve(result).then(() => { injected++; throw acknowledgementError; });
        }
        return result;
      },
    });
  };
  app.once("acquire", intercept);
  try { await assert.rejects(drainPromotionOutbox(owner), error => error === acknowledgementError); }
  finally { app.removeListener("acquire", intercept); restoreQuery(); }
  assert.equal(injected, 1);
  assert.deepEqual((await owner.query("SELECT status,attempts,last_error FROM promotion_outbox WHERE id=$1", [uncertain.id])).rows[0], { status: "delivered", attempts: 0, last_error: null });
  assert.equal((await owner.query("SELECT count(*)::int AS n FROM events WHERE metadata->>'outbox_id'=$1", [uncertain.id])).rows[0].n, 1);
  const afterUnknown = await drainPromotionOutbox(owner);
  assert.equal(afterUnknown.delivered, 0); assert.equal(afterUnknown.failed, 0);
  assert.equal((await owner.query("SELECT count(*)::int AS n FROM events WHERE metadata->>'outbox_id'=$1", [uncertain.id])).rows[0].n, 1);
  console.log("PASS: injected lost acknowledgement after real COMMIT rejects; delivered row/event persist; ordinary subsequent drain does not duplicate");
  assert.equal((await owner.query("SELECT status FROM canonical_proposals WHERE id=$1", [unapproved])).rows[0].status, "pending");
  for (const row of [future, exhausted, quarantine, ...due, retry, concurrent, uncertain]) {
    assert.equal((await owner.query("SELECT status FROM canonical_proposals WHERE id=$1", [row.proposal])).rows[0].status, "approved");
    assert.equal((await owner.query("SELECT content FROM graph_memories WHERE id=$1", [row.memory])).rows[0].content, "synthetic committed fixture");
  }
  console.log("PASS: concurrent successful drains emit once; committed memory/approval and pending proposal unchanged");
  await closePool();
  delete process.env.POSTGRES_APP_PASSWORD;
  await assert.rejects(drainPromotionOutbox(owner), /POSTGRES_APP_USER and POSTGRES_APP_PASSWORD are required/);
  console.log("PASS: missing application authority refused; no owner fallback");
  console.log("LIMIT: bounded synthetic SQL concurrency and injected acknowledgement-loss checks only; no real network fault, unknown-outcome recovery, continuous-service, real approval, deployment or full pilot acceptance");
} finally { await closePool(); await owner.end(); }
