// Bundled only by smoke-promotion-outbox.ts into an isolated disposable database test.
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { drainPromotionOutbox } from "../src/lib/memory/promotion-outbox-worker";
import { closePool } from "../src/lib/postgres/connection";

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
  const retry = await seed();
  await owner.query(`CREATE FUNCTION sep_reject_delivery() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.metadata->>'outbox_id'='${retry.id}' THEN RAISE EXCEPTION 'synthetic delivery failure'; END IF; RETURN NEW; END $$`);
  await owner.query("CREATE TRIGGER sep_reject_delivery BEFORE INSERT ON events FOR EACH ROW EXECUTE FUNCTION sep_reject_delivery()");
  const failed = await drainPromotionOutbox(owner);
  assert.equal(failed.failed, 1); assert.equal(failed.delivered, 0);
  const delayed = (await owner.query("SELECT status,attempts,available_at>NOW() AS delayed FROM promotion_outbox WHERE id=$1", [retry.id])).rows[0];
  assert.deepEqual(delayed, { status: "pending", attempts: 1, delayed: true });
  assert.equal((await owner.query("SELECT count(*)::int AS n FROM events WHERE metadata->>'outbox_id'=$1", [retry.id])).rows[0].n, 0);
  assert.equal((await drainPromotionOutbox(owner)).failed, 0, "Backoff must prevent immediate retry");
  await owner.query("DROP TRIGGER sep_reject_delivery ON events");
  await owner.query("UPDATE promotion_outbox SET available_at=NOW()-INTERVAL '1 second' WHERE id=$1", [retry.id]);
  assert.equal((await drainPromotionOutbox(owner)).delivered, 1);
  assert.equal((await drainPromotionOutbox(owner)).delivered, 0);
  console.log("PASS: failed event rolls back; persisted backoff suppresses retry until due; subsequent delivery once");
  const concurrent = await seed();
  // Both snapshots must contain the same row before either caller can claim it.
  let arrivals = 0;
  let release = () => {};
  let barrierTimer: ReturnType<typeof setTimeout> | undefined;
  const barrier = new Promise<void>((resolve, reject) => {
    release = resolve;
    barrierTimer = setTimeout(() => reject(new Error("Concurrent discovery barrier timed out")), 5000);
  });
  const simultaneousDiscovery = { query: async (sql: string, values: unknown[]) => {
    const result = await owner.query(sql, values);
    if (sql.startsWith("SELECT id,")) {
      assert(result.rows.some(row => row.id === concurrent.id));
      if (++arrivals === 2) release();
      await barrier;
    }
    return result;
  } } as unknown as pg.Pool;
  let pair;
  try { pair = await Promise.all([drainPromotionOutbox(simultaneousDiscovery), drainPromotionOutbox(simultaneousDiscovery)]); }
  finally { clearTimeout(barrierTimer); }
  assert.equal(arrivals, 2);
  assert.equal(pair.reduce((sum, result) => sum + result.delivered, 0), 1);
  assert.equal((await owner.query("SELECT count(*)::int AS n FROM events WHERE metadata->>'outbox_id'=$1", [concurrent.id])).rows[0].n, 1);
  assert.equal((await owner.query("SELECT status FROM canonical_proposals WHERE id=$1", [unapproved])).rows[0].status, "pending");
  for (const row of [future, exhausted, quarantine, ...due, retry, concurrent]) {
    assert.equal((await owner.query("SELECT status FROM canonical_proposals WHERE id=$1", [row.proposal])).rows[0].status, "approved");
    assert.equal((await owner.query("SELECT content FROM graph_memories WHERE id=$1", [row.memory])).rows[0].content, "synthetic committed fixture");
  }
  console.log("PASS: concurrent successful drains emit once; committed memory/approval and pending proposal unchanged");
  await closePool();
  delete process.env.POSTGRES_APP_PASSWORD;
  await assert.rejects(drainPromotionOutbox(owner), /POSTGRES_APP_USER and POSTGRES_APP_PASSWORD are required/);
  console.log("PASS: missing application authority refused; no owner fallback");
  console.log("LIMIT: retry eligibility regression only; no continuous-service, failure-race fencing, real approval, deployment or full pilot acceptance");
} finally { await closePool(); await owner.end(); }
