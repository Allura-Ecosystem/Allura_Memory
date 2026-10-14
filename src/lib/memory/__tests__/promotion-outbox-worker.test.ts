import type { Pool, PoolClient } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as connection from "@/lib/postgres/connection";
import { drainPromotionOutbox } from "../promotion-outbox-worker";

const row = {
  id: "outbox-regression",
  group_id: "allura-outbox-test",
  workspace_id: "workspace-regression",
  proposal_id: "proposal-regression",
  memory_id: "memory-regression",
  payload: { memory_id: "memory-regression", group_id: "untrusted-payload-group" },
  attempts: 0,
};
const key = [row.id, row.group_id, row.workspace_id];
type Query = { sql: string; values: unknown[] };
const result = (rows: Record<string, unknown>[] = []) => ({ rows, rowCount: rows.length });
const savepoint = "SAVEPOINT promotion_delivery";
const rollbackTo = "ROLLBACK TO SAVEPOINT promotion_delivery";
const releaseSavepoint = "RELEASE SAVEPOINT promotion_delivery";

/** Mock transport ONLY: records real worker/helper calls; no SQL engine, locks,
 * RLS, transaction-abort state or durability simulation. The disposable fixture
 * supplies database proof separately. */
function scriptedClient(options: {
  deliveryError?: Error;
  updateError?: Error;
  deliveredRows?: number;
  lostClaim?: boolean;
  commitError?: Error;
  controlError?: { sql: string; error: Error };
  bookkeepingError?: Error;
  bookkeepingRows?: number;
  beforeCommit?: () => Promise<void>;
} = {}) {
  const queries: Query[] = [];
  const release = vi.fn();
  const client = {
    release,
    async query(text: string, values: unknown[] = []) {
      const sql = text.replace(/\s+/g, " ").trim();
      queries.push({ sql, values });
      if (sql === options.controlError?.sql) throw options.controlError.error;
      if (sql === "COMMIT") {
        await options.beforeCommit?.();
        if (options.commitError) throw options.commitError;
        return result();
      }
      if (["BEGIN", "ROLLBACK", savepoint, rollbackTo, releaseSavepoint].includes(sql) || sql.startsWith("SET LOCAL ")) return result();
      if (sql.startsWith("UPDATE promotion_outbox SET status='processing'")) {
        return result(options.lostClaim ? [] : [{ id: row.id }]);
      }
      if (sql.startsWith("INSERT INTO events")) {
        if (options.deliveryError) throw options.deliveryError;
        return result();
      }
      if (sql.startsWith("UPDATE promotion_outbox SET status='delivered'")) {
        if (options.updateError) throw options.updateError;
        return result(Array.from({ length: options.deliveredRows ?? 1 }, () => ({ id: row.id })));
      }
      if (sql.startsWith("UPDATE promotion_outbox SET status=CASE")) {
        if (options.bookkeepingError) throw options.bookkeepingError;
        return result(Array.from({ length: options.bookkeepingRows ?? 1 }, () => ({ id: row.id })));
      }
      throw new Error(`Unexpected scripted-client query: ${sql}`);
    },
  };
  return { client: client as unknown as PoolClient, queries, release };
}

function scriptedDiscovery(pendingCount: number) {
  const queries: Query[] = [];
  const pool = {
    async query(text: string, values: unknown[] = []) {
      const sql = text.replace(/\s+/g, " ").trim();
      queries.push({ sql, values });
      if (sql.startsWith("SELECT id,group_id,workspace_id")) return result([row]);
      if (sql.startsWith("SELECT count(*)::int")) return result([{ count: pendingCount }]);
      throw new Error(`Unexpected discovery query: ${sql}`);
    },
  };
  return { pool: pool as unknown as Pool, queries };
}

function useClients(...scripts: ReturnType<typeof scriptedClient>[]) {
  let next = 0;
  const connect = vi.fn(async () => {
    const script = scripts[next++];
    if (!script) throw new Error("Unexpected extra transaction");
    return script.client;
  });
  vi.spyOn(connection, "getAppPool").mockReturnValue({ connect } as unknown as Pool);
  vi.spyOn(connection, "getPool").mockImplementation(() => {
    throw new Error("Owner-backed transaction pool must not be used");
  });
  return { connect };
}

const operations = (script: ReturnType<typeof scriptedClient>) => script.queries
  .filter(({ sql }) => !sql.startsWith("SET LOCAL ")).map(({ sql }) => sql);
const failureWrites = (script: ReturnType<typeof scriptedClient>) => script.queries
  .filter(({ sql }) => sql.startsWith("UPDATE promotion_outbox SET status=CASE"));

afterEach(() => vi.restoreAllMocks());

describe("promotion outbox failure boundary (real worker/helper; mocked transport)", () => {
  it.each(["event", "delivered transition"])("recovers %s SQL failure within the claimed transaction before acknowledging failure", async (stage) => {
    const error = new Error("synthetic delivery failure");
    const attempt = scriptedClient(stage === "event" ? { deliveryError: error } : { updateError: error });
    const forbiddenSecond = scriptedClient();
    const { connect } = useClients(attempt, forbiddenSecond);
    await expect(drainPromotionOutbox(scriptedDiscovery(1).pool)).resolves.toEqual({ delivered: 0, failed: 1, pending: 1 });
    expect(connect).toHaveBeenCalledOnce();
    expect(forbiddenSecond.queries).toEqual([]);
    expect(operations(attempt)).toEqual([
      "BEGIN", expect.stringContaining("SET status='processing'"), savepoint,
      expect.stringContaining("INSERT INTO events"),
      ...(stage === "event" ? [] : [expect.stringContaining("SET status='delivered'")]),
      rollbackTo, expect.stringContaining("SET status=CASE"), releaseSavepoint, "COMMIT",
    ]);
    const [failure] = failureWrites(attempt);
    expect(failure.values).toEqual([...key, 5, error.message]);
    // Assert the positive scoped processing fence, not an exact unfenced SQL
    // string whose absence could pass after an irrelevant whitespace edit.
    expect(failure.sql).toMatch(/WHERE id=\$1 AND group_id=\$2 AND workspace_id=\$3 AND status='processing'/);
    expect(failure.sql).toContain("attempts=attempts+1");
    expect(failure.sql).toContain("CASE WHEN attempts+1 >= $4 THEN 'failed' ELSE 'pending' END");
    expect(failure.sql).toContain("NOW()+(INTERVAL '1 minute'*LEAST(attempts+1,10))");
    expect(attempt.release).toHaveBeenCalledOnce();
  });

  it.each([0, 2])("requires exactly one delivered RETURNING row (got %i)", async (deliveredRows) => {
    const attempt = scriptedClient({ deliveredRows });
    useClients(attempt);
    await expect(drainPromotionOutbox(scriptedDiscovery(1).pool)).resolves.toEqual({ delivered: 0, failed: 1, pending: 1 });
    expect(operations(attempt)).toContain(rollbackTo);
    expect(failureWrites(attempt)).toHaveLength(1);
    expect(operations(attempt).at(-1)).toBe("COMMIT");
  });

  it.each(["delivery", "failure bookkeeping"])("rejects lost COMMIT acknowledgement after %s without bookkeeping/retry", async (stage) => {
    const commitError = new Error("synthetic COMMIT acknowledgement lost; outcome unknown");
    const attempt = scriptedClient({ commitError, ...(stage === "delivery" ? {} : { deliveryError: new Error("event failed") }) });
    const forbiddenSecond = scriptedClient();
    const { connect } = useClients(attempt, forbiddenSecond);
    const discovery = scriptedDiscovery(1);
    await expect(drainPromotionOutbox(discovery.pool)).rejects.toBe(commitError);
    expect(connect).toHaveBeenCalledOnce();
    expect(forbiddenSecond.queries).toEqual([]);
    expect(operations(attempt).slice(-2)).toEqual(["COMMIT", "ROLLBACK"]);
    expect(failureWrites(attempt)).toHaveLength(stage === "delivery" ? 0 : 1);
    expect(discovery.queries).toHaveLength(1); // no successful summary after unknown outcome
    expect(attempt.release).toHaveBeenCalledOnce();
  });

  it.each(["BEGIN", savepoint, rollbackTo, releaseSavepoint])("propagates control failure at %s without a second transaction", async (sql) => {
    const error = new Error(`synthetic control failure: ${sql}`);
    const attempt = scriptedClient({ controlError: { sql, error }, ...(sql === rollbackTo ? { deliveryError: new Error("event failed") } : {}) });
    const forbiddenSecond = scriptedClient();
    const { connect } = useClients(attempt, forbiddenSecond);
    await expect(drainPromotionOutbox(scriptedDiscovery(1).pool)).rejects.toBe(error);
    expect(connect).toHaveBeenCalledOnce();
    expect(forbiddenSecond.queries).toEqual([]);
    expect(failureWrites(attempt)).toEqual([]);
    expect(operations(attempt)).not.toContain("COMMIT");
    expect(operations(attempt).at(-1)).toBe("ROLLBACK");
    expect(attempt.release).toHaveBeenCalledOnce();
  });

  it.each([0, 2])("rejects bookkeeping cardinality %i and rolls back instead of reporting a failure count", async (bookkeepingRows) => {
    const attempt = scriptedClient({ deliveryError: new Error("event failed"), bookkeepingRows });
    const { connect } = useClients(attempt);
    await expect(drainPromotionOutbox(scriptedDiscovery(1).pool)).rejects.toThrow("Promotion outbox failure must transition exactly one row");
    expect(connect).toHaveBeenCalledOnce();
    expect(failureWrites(attempt)).toHaveLength(1);
    expect(failureWrites(attempt)[0].sql).toContain("RETURNING id");
    expect(operations(attempt).at(-1)).toBe("ROLLBACK");
    expect(operations(attempt)).not.toContain("COMMIT");
  });

  it("propagates failed bookkeeping rather than returning a committed failure count", async () => {
    const error = new Error("synthetic bookkeeping failure");
    const attempt = scriptedClient({ deliveryError: new Error("event failed"), bookkeepingError: error });
    const { connect } = useClients(attempt);
    await expect(drainPromotionOutbox(scriptedDiscovery(1).pool)).rejects.toBe(error);
    expect(connect).toHaveBeenCalledOnce();
    expect(operations(attempt).at(-1)).toBe("ROLLBACK");
    expect(operations(attempt)).not.toContain("COMMIT");
  });

  it.each([false, true])("waits for outer COMMIT acknowledgement before resolving counters (failure=%s)", async (fails) => {
    let acknowledge!: () => void;
    let entered!: () => void;
    const committing = new Promise<void>((resolve) => { entered = resolve; });
    const acknowledgement = new Promise<void>((resolve) => { acknowledge = resolve; });
    const attempt = scriptedClient({
      ...(fails ? { deliveryError: new Error("event failed") } : {}),
      beforeCommit: async () => { entered(); await acknowledgement; },
    });
    useClients(attempt);
    const discovery = scriptedDiscovery(7);
    let settled = false;
    const drain = drainPromotionOutbox(discovery.pool).finally(() => { settled = true; });
    try {
      await Promise.race([
        committing,
        drain.then(() => { throw new Error("Drain settled without reaching the claimed transaction COMMIT"); }),
      ]);
      expect(settled).toBe(false);
      expect(discovery.queries).toHaveLength(1);
    } finally { acknowledge(); }
    await expect(drain).resolves.toEqual({ delivered: fails ? 0 : 1, failed: fails ? 1 : 0, pending: 7 });
  });

  it("skips a lost claim without delivery or failure writes", async () => {
    const attempt = scriptedClient({ lostClaim: true });
    const { connect } = useClients(attempt);
    await expect(drainPromotionOutbox(scriptedDiscovery(4).pool)).resolves.toEqual({ delivered: 0, failed: 0, pending: 4 });
    expect(connect).toHaveBeenCalledOnce();
    expect(operations(attempt)).toEqual(["BEGIN", expect.stringContaining("SET status='processing'"), "COMMIT"]);
  });

  it("preserves custom limits and truncates the failed attempt error to 500 characters", async () => {
    const attempt = scriptedClient({ deliveryError: new Error("x".repeat(600)) });
    useClients(attempt);
    const discovery = scriptedDiscovery(3);
    await expect(drainPromotionOutbox(discovery.pool, { maxBatch: 2, maxAttempts: 3 })).resolves.toEqual({ delivered: 0, failed: 1, pending: 3 });
    expect(discovery.queries[0].values).toEqual([3, 2]);
    expect(attempt.queries.find(({ sql }) => sql.includes("SET status='processing'"))?.values).toEqual([...key, 3]);
    expect(failureWrites(attempt)[0].values).toEqual([...key, 3, "x".repeat(500)]);
  });

  it("keeps happy delivery scoped to the restricted app transaction with unchanged payload/counters", async () => {
    const delivery = scriptedClient();
    const { connect } = useClients(delivery);
    const discovery = scriptedDiscovery(0);
    await expect(drainPromotionOutbox(discovery.pool)).resolves.toEqual({ delivered: 1, failed: 0, pending: 0 });
    expect(connect).toHaveBeenCalledOnce();
    expect(connection.getPool).not.toHaveBeenCalled();
    expect(discovery.queries).toHaveLength(2);
    expect(discovery.queries[0].values).toEqual([5, 50]);
    expect(discovery.queries[0].sql).toContain("attempts<$1 AND available_at<=NOW()");
    expect(delivery.queries.slice(0, 5).map(({ sql }) => sql)).toEqual([
      "BEGIN",
      `SET LOCAL app.current_group_id = '${row.group_id}'`,
      `SET LOCAL app.current_tenant = '${row.group_id}'`,
      "SET LOCAL app.current_principal = 'promotion-outbox-worker'",
      `SET LOCAL app.current_workspace_id = '${row.workspace_id}'`,
    ]);
    expect(operations(delivery)).toEqual([
      "BEGIN", expect.stringContaining("SET status='processing'"), savepoint,
      expect.stringContaining("INSERT INTO events"), expect.stringContaining("SET status='delivered'"), releaseSavepoint, "COMMIT",
    ]);
    const writes = delivery.queries.filter(({ sql }) => /^(UPDATE|INSERT) /.test(sql));
    expect(writes).toHaveLength(3);
    expect(writes[0].values).toEqual([...key, 5]);
    expect(writes[0].sql).toContain("AND status IN('pending','failed') AND attempts<$4 AND available_at<=NOW()");
    expect(writes[1].sql).toContain("'canonical_memory_promoted','promotion-outbox-worker','completed'");
    expect(writes[1].values.slice(0, 2)).toEqual([row.group_id, row.workspace_id]);
    expect(JSON.parse(writes[1].values[2] as string)).toEqual({
      ...row.payload, group_id: row.group_id, workspace_id: row.workspace_id, outbox_id: row.id, delivered: true,
    });
    expect(writes[2].values).toEqual(key);
    expect(writes[2].sql).toContain("AND status='processing' RETURNING id");
    expect(delivery.queries.slice(-5).map(({ sql }) => sql)).toEqual([
      "COMMIT", "SET LOCAL app.current_group_id = ''", "SET LOCAL app.current_tenant = ''",
      "SET LOCAL app.current_principal = ''", "SET LOCAL app.current_workspace_id = ''",
    ]);
    expect(delivery.release).toHaveBeenCalledOnce();
  });
});
