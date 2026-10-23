import type { Pool } from "pg";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { drainPromotionOutbox } from "./promotion-outbox-worker";

const connections = vi.hoisted(() => ({ getAppPool: vi.fn(), getPool: vi.fn() }));
vi.mock("@/lib/postgres/connection", () => connections);
// withTenantTransaction is deliberately real. Only pool/client transport is fake.

const row = {
  id: "outbox-1", group_id: "allura-system", workspace_id: "workspace-a",
  proposal_id: "proposal-1", memory_id: "memory-1", attempts: 2,
  payload: { proposal_id: "proposal-1", memory_id: "memory-1" } as Record<string, unknown>,
};
const cleanup = ["cleanupGroup", "cleanupTenant", "cleanupPrincipal", "cleanupWorkspace"];
const context = ["begin", "contextGroup", "contextTenant", "contextPrincipal", "contextWorkspace"];

function stage(sql: string): string {
  if (sql === "BEGIN") return "begin";
  if (sql === "COMMIT") return "commit";
  if (sql === "ROLLBACK") return "rollback";
  if (sql === "SAVEPOINT promotion_delivery") return "savepoint";
  if (sql === "ROLLBACK TO SAVEPOINT promotion_delivery") return "rollbackTo";
  if (sql === "RELEASE SAVEPOINT promotion_delivery") return "releaseSavepoint";
  for (const [setting, label] of [
    ["app.current_group_id", "Group"], ["app.current_tenant", "Tenant"],
    ["app.current_principal", "Principal"], ["app.current_workspace_id", "Workspace"],
  ]) {
    if (sql.startsWith(`SET LOCAL ${setting} = `)) return `${sql.endsWith("= ''") ? "cleanup" : "context"}${label}`;
  }
  if (sql.includes("SET status='processing'")) return "claim";
  if (sql.includes("INSERT INTO events")) return "event";
  if (sql.includes("SET status='delivered'")) return "delivery";
  if (sql.includes("SET status=CASE")) return "failure";
  throw new Error(`Unexpected transport statement: ${sql}`);
}

type ClientOptions = {
  errors?: Record<string, unknown>;
  counts?: Partial<Record<"claim" | "delivery" | "failure", number>>;
  beforeCommit?: () => Promise<void>;
};

function clientDouble(options: ClientOptions = {}) {
  const query = vi.fn(async (sql: string, _params?: unknown[]) => {
    const point = stage(sql);
    if (point === "commit") await options.beforeCommit?.();
    if (options.errors && Object.hasOwn(options.errors, point)) throw options.errors[point];
    const count = options.counts?.[point as "claim" | "delivery" | "failure"] ?? 1;
    return { rows: ["claim", "delivery", "failure"].includes(point) ? Array.from({ length: count }, () => ({ id: row.id })) : [] };
  });
  return { query, release: vi.fn() };
}

type ClientDouble = ReturnType<typeof clientDouble>;

function harness(options: { rows?: typeof row[]; clients?: ClientDouble[]; backlog?: number; discoveryError?: Error; backlogError?: Error; connectError?: Error } = {}) {
  const clients = options.clients ?? [clientDouble()];
  let nextClient = 0;
  const app = {
    connect: vi.fn(async () => {
      if (options.connectError) throw options.connectError;
      const client = clients[nextClient++];
      if (!client) throw new Error("Unexpected extra app connection");
      return client;
    }),
    query: vi.fn(() => { throw new Error("Unscoped app query"); }),
  };
  const discovery = {
    query: vi.fn(async (sql: string, _params?: unknown[]) => {
      if (sql.startsWith("SELECT id,")) {
        if (options.discoveryError) throw options.discoveryError;
        return { rows: options.rows ?? [row] };
      }
      if (sql.startsWith("SELECT count(*)")) {
        if (options.backlogError) throw options.backlogError;
        return { rows: [{ count: options.backlog ?? 0 }] };
      }
      throw new Error(`Unexpected owner query: ${sql}`);
    }),
    connect: vi.fn(() => { throw new Error("Owner connection must not mutate rows"); }),
  };
  connections.getAppPool.mockReturnValue(app);
  return { app, discovery, clients, pool: discovery as unknown as Pool };
}

function stages(client: ClientDouble) { return client.query.mock.calls.map(([sql]) => stage(sql)); }
function statement(client: ClientDouble, point: string) {
  const calls = client.query.mock.calls.filter(([sql]) => stage(sql) === point);
  expect(calls).toHaveLength(1);
  return calls[0]!;
}
function expectRestricted(h: ReturnType<typeof harness>, count = 1) {
  expect(h.app.connect).toHaveBeenCalledTimes(count);
  expect(h.discovery.connect).not.toHaveBeenCalled();
  expect(h.app.query).not.toHaveBeenCalled();
  expect(connections.getPool).not.toHaveBeenCalled();
  for (const client of h.clients.slice(0, count)) expect(client.release).toHaveBeenCalledTimes(1);
}
function expectAbort(h: ReturnType<typeof harness>, client = h.clients[0]!) {
  expectRestricted(h);
  expect(stages(client).filter((point) => point === "rollback")).toHaveLength(1);
  expect(stages(client).slice(-4)).toEqual(cleanup);
  expect(h.discovery.query).toHaveBeenCalledTimes(1);
}
function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  connections.getAppPool.mockReset();
  connections.getPool.mockReset().mockImplementation(() => { throw new Error("Owner pool fallback forbidden"); });
});

describe("promotion outbox scoped transaction", () => {
  it("discovers only due eligible work and commits delivery through the actual restricted transaction helper", async () => {
    const h = harness();
    await expect(drainPromotionOutbox(h.pool)).resolves.toEqual({ delivered: 1, failed: 0, pending: 0 });
    const [discoverySql, discoveryParams] = h.discovery.query.mock.calls[0]!;
    expect(discoverySql).toContain("workspace_scope_state='workspace_scoped' AND workspace_id IS NOT NULL");
    expect(discoverySql).toContain("status IN('pending','failed') AND attempts<$1 AND available_at<=NOW()");
    expect(discoverySql).toContain("ORDER BY available_at,created_at LIMIT $2");
    expect(discoveryParams).toEqual([5, 50]);
    const client = h.clients[0]!;
    expect(stages(client)).toEqual([...context, "claim", "savepoint", "event", "delivery", "releaseSavepoint", "commit", ...cleanup]);
    expect(statement(client, "contextGroup")[0]).toBe("SET LOCAL app.current_group_id = 'allura-system'");
    expect(statement(client, "contextTenant")[0]).toBe("SET LOCAL app.current_tenant = 'allura-system'");
    expect(statement(client, "contextPrincipal")[0]).toBe("SET LOCAL app.current_principal = 'promotion-outbox-worker'");
    expect(statement(client, "contextWorkspace")[0]).toBe("SET LOCAL app.current_workspace_id = 'workspace-a'");
    const [claimSql, claimParams] = statement(client, "claim");
    expect(claimSql).toContain("id=$1 AND group_id=$2 AND workspace_id=$3");
    expect(claimSql).toContain("status IN('pending','failed') AND attempts<$4 AND available_at<=NOW()");
    expect(claimSql).toContain("RETURNING id");
    expect(claimParams).toEqual([row.id, row.group_id, row.workspace_id, 5]);
    const [deliverySql, deliveryParams] = statement(client, "delivery");
    expect(deliverySql).toContain("id=$1 AND group_id=$2 AND workspace_id=$3");
    expect(deliverySql).toContain("AND status='processing' RETURNING id");
    expect(deliveryParams).toEqual([row.id, row.group_id, row.workspace_id]);
    expectRestricted(h);
  });

  it("preserves authoritative payload scope and delivered metadata over conflicting payload fields", async () => {
    const h = harness({ rows: [{ ...row, payload: { extra: "retained", group_id: "allura-foreign", workspace_id: "foreign-workspace", outbox_id: "forged", delivered: false } }] });
    await drainPromotionOutbox(h.pool);
    const [sql, params] = statement(h.clients[0]!, "event");
    expect(sql).toContain("'canonical_memory_promoted','promotion-outbox-worker','completed'");
    expect(params?.slice(0, 2)).toEqual([row.group_id, row.workspace_id]);
    expect(JSON.parse(String(params?.[2]))).toEqual({ extra: "retained", group_id: row.group_id, workspace_id: row.workspace_id, outbox_id: row.id, delivered: true });
  });

  it("binds custom batch and attempt limits in discovery claim and backoff", async () => {
    const client = clientDouble({ errors: { event: new Error("delivery failed") } });
    const h = harness({ clients: [client] });
    await expect(drainPromotionOutbox(h.pool, { maxBatch: 3, maxAttempts: 7 })).resolves.toEqual({ delivered: 0, failed: 1, pending: 0 });
    expect(h.discovery.query.mock.calls[0]?.[1]).toEqual([7, 3]);
    expect(statement(client, "claim")[1]).toEqual([row.id, row.group_id, row.workspace_id, 7]);
    expect(statement(client, "failure")[1]).toEqual([row.id, row.group_id, row.workspace_id, 7, "delivery failed"]);
  });

  it("returns outstanding backlog for an empty eligible batch including future or exhausted work", async () => {
    const h = harness({ rows: [], clients: [], backlog: 9 });
    await expect(drainPromotionOutbox(h.pool)).resolves.toEqual({ delivered: 0, failed: 0, pending: 9 });
    const sql = h.discovery.query.mock.calls[1]![0];
    expect(sql).toContain("workspace_scope_state='workspace_scoped'");
    expect(sql).toContain("status IN('pending','failed','processing')");
    expect(sql).not.toMatch(/attempts|available_at/);
    expectRestricted(h, 0);
  });

  it("skips a lost claim without savepoint event transition or failure bookkeeping", async () => {
    const client = clientDouble({ counts: { claim: 0 } });
    const h = harness({ clients: [client], backlog: 1 });
    await expect(drainPromotionOutbox(h.pool)).resolves.toEqual({ delivered: 0, failed: 0, pending: 1 });
    expect(stages(client)).toEqual([...context, "claim", "commit", ...cleanup]);
    expectRestricted(h);
  });

  it("rejects an unexpected multiple-row claim before delivery", async () => {
    const client = clientDouble({ counts: { claim: 2 } });
    const h = harness({ clients: [client] });
    await expect(drainPromotionOutbox(h.pool)).rejects.toThrow("claim must transition exactly one row");
    expect(stages(client)).toEqual([...context, "claim", "rollback", ...cleanup]);
    expectAbort(h);
  });

  it("keeps a delivery failure and bounded backoff in the original claimed transaction", async () => {
    const client = clientDouble({ errors: { event: new Error("event failed") } });
    const h = harness({ clients: [client], rows: [{ ...row, attempts: 999 }] });
    await expect(drainPromotionOutbox(h.pool)).resolves.toEqual({ delivered: 0, failed: 1, pending: 0 });
    expect(stages(client)).toEqual([...context, "claim", "savepoint", "event", "rollbackTo", "failure", "releaseSavepoint", "commit", ...cleanup]);
    const [sql, params] = statement(client, "failure");
    expect(sql).toContain("CASE WHEN attempts+1 >= $4 THEN 'failed' ELSE 'pending' END");
    expect(sql).toContain("attempts=attempts+1,last_error=$5");
    expect(sql).toContain("available_at=NOW()+(INTERVAL '1 minute'*LEAST(attempts+1,10))");
    expect(sql).toContain("id=$1 AND group_id=$2 AND workspace_id=$3 AND status='processing' RETURNING id");
    expect(params).toEqual([row.id, row.group_id, row.workspace_id, 5, "event failed"]);
    expectRestricted(h);
  });

  it.each([0, 2])("recovers a delivered transition with %s returned rows inside the savepoint", async (count) => {
    const client = clientDouble({ counts: { delivery: count } });
    const h = harness({ clients: [client] });
    await expect(drainPromotionOutbox(h.pool)).resolves.toEqual({ delivered: 0, failed: 1, pending: 0 });
    expect(stages(client)).toEqual([...context, "claim", "savepoint", "event", "delivery", "rollbackTo", "failure", "releaseSavepoint", "commit", ...cleanup]);
    expect(statement(client, "failure")[1]?.[4]).toBe("Promotion outbox delivery must transition exactly one row");
    expectRestricted(h);
  });

  it("recovers a delivered-transition SQL error without opening a second transaction", async () => {
    const error = new Error("delivery SQL rejected");
    const client = clientDouble({ errors: { delivery: error } });
    const h = harness({ clients: [client] });
    await expect(drainPromotionOutbox(h.pool)).resolves.toEqual({ delivered: 0, failed: 1, pending: 0 });
    expect(statement(client, "failure")[1]?.[4]).toBe(error.message);
    expect(stages(client).indexOf("rollbackTo")).toBeGreaterThan(stages(client).indexOf("delivery"));
    expectRestricted(h);
  });

  it.each([
    { label: "Error", error: new Error("x".repeat(600)), expected: "x".repeat(500) },
    { label: "string", error: "y".repeat(600), expected: "y".repeat(500) },
    { label: "non-Error object", error: { reason: "failed" }, expected: "[object Object]" },
  ])("bounds $label failure text to the existing 500-character contract", async ({ error, expected }) => {
    const client = clientDouble({ errors: { event: error } });
    await drainPromotionOutbox(harness({ clients: [client] }).pool);
    expect(statement(client, "failure")[1]?.[4]).toBe(expected);
  });

  it.each([0, 2])("aborts when failure bookkeeping returns %s rows", async (count) => {
    const client = clientDouble({ errors: { event: new Error("event failed") }, counts: { failure: count } });
    const h = harness({ clients: [client] });
    await expect(drainPromotionOutbox(h.pool)).rejects.toThrow("failure must transition exactly one row");
    expect(stages(client)).toEqual([...context, "claim", "savepoint", "event", "rollbackTo", "failure", "rollback", ...cleanup]);
    expectAbort(h);
  });

  it.each([
    { point: "claim", deliveryFails: false },
    { point: "savepoint", deliveryFails: false },
    { point: "rollbackTo", deliveryFails: true },
    { point: "failure", deliveryFails: true },
    { point: "releaseSavepoint", deliveryFails: false },
    { point: "releaseSavepoint", deliveryFails: true },
  ])("propagates $point failure with deliveryFails=$deliveryFails without another transaction", async ({ point, deliveryFails }) => {
    const error = new Error(`${point} failed`);
    const client = clientDouble({ errors: { ...(deliveryFails ? { event: new Error("event failed") } : {}), [point]: error } });
    const h = harness({ clients: [client] });
    await expect(drainPromotionOutbox(h.pool)).rejects.toBe(error);
    expect(stages(client)).not.toContain("commit");
    expect(stages(client).filter((s) => s === point)).toHaveLength(1);
    if (point === "claim" || point === "savepoint") expect(stages(client)).not.toContain("event");
    if (point === "rollbackTo") expect(stages(client)).not.toContain("failure");
    if (point === "releaseSavepoint" && !deliveryFails) expect(stages(client)).not.toContain("failure");
    expectAbort(h);
  });

  it.each(["begin", "contextGroup", "contextTenant", "contextPrincipal", "contextWorkspace"])("propagates %s setup failure through the actual helper", async (point) => {
    const error = new Error(`${point} failed`);
    const client = clientDouble({ errors: { [point]: error } });
    const h = harness({ clients: [client] });
    await expect(drainPromotionOutbox(h.pool)).rejects.toBe(error);
    expect(stages(client)).not.toContain("claim");
    expect(stages(client)).not.toContain("commit");
    expectAbort(h);
  });

  it("propagates connection acquisition failure without a callback or retry", async () => {
    const error = new Error("connect failed");
    const h = harness({ connectError: error });
    await expect(drainPromotionOutbox(h.pool)).rejects.toBe(error);
    expect(h.app.connect).toHaveBeenCalledTimes(1);
    expect(h.clients[0]!.query).not.toHaveBeenCalled();
    expect(h.clients[0]!.release).not.toHaveBeenCalled();
    expect(h.discovery.query).toHaveBeenCalledTimes(1);
    expect(connections.getPool).not.toHaveBeenCalled();
  });

  it.each([false, true])("waits for outer commit acknowledgement before reporting deliveryFails=%s", async (deliveryFails) => {
    const entered = deferred(), ack = deferred();
    const client = clientDouble({ errors: deliveryFails ? { event: new Error("event failed") } : {}, beforeCommit: async () => { entered.resolve(); await ack.promise; } });
    const h = harness({ clients: [client] });
    let settled = false;
    const draining = drainPromotionOutbox(h.pool).then((result) => { settled = true; return result; });
    await entered.promise;
    expect(settled).toBe(false);
    expect(h.discovery.query).toHaveBeenCalledTimes(1);
    expect(client.release).not.toHaveBeenCalled();
    ack.resolve();
    await expect(draining).resolves.toEqual({ delivered: deliveryFails ? 0 : 1, failed: deliveryFails ? 1 : 0, pending: 0 });
    expectRestricted(h);
  });

  it.each([false, true])("propagates unknown commit after deliveryFails=%s without retry or new bookkeeping", async (deliveryFails) => {
    const error = new Error("commit acknowledgement lost");
    const client = clientDouble({ errors: { ...(deliveryFails ? { event: new Error("event failed") } : {}), commit: error } });
    const h = harness({ clients: [client] });
    await expect(drainPromotionOutbox(h.pool)).rejects.toBe(error);
    expect(stages(client).filter((s) => s === "failure")).toHaveLength(deliveryFails ? 1 : 0);
    expect(stages(client).slice(-6)).toEqual(["commit", "rollback", ...cleanup]);
    expectAbort(h);
  });

  it("preserves the original helper error when outer rollback also fails", async () => {
    const error = new Error("commit acknowledgement lost");
    const client = clientDouble({ errors: { commit: error, rollback: new Error("rollback rejected") } });
    const h = harness({ clients: [client] });
    await expect(drainPromotionOutbox(h.pool)).rejects.toBe(error);
    expectAbort(h);
  });

  it("releases the client after cleanup failures without replacing the acknowledged outcome", async () => {
    const client = clientDouble({ errors: Object.fromEntries(cleanup.map((point) => [point, new Error("cleanup failed")])) });
    const h = harness({ clients: [client] });
    await expect(drainPromotionOutbox(h.pool)).resolves.toEqual({ delivered: 1, failed: 0, pending: 0 });
    expectRestricted(h);
    expect(stages(client).slice(-4)).toEqual(cleanup);
  });

  it("handles duplicate discoveries as one successful claim and one skipped claim", async () => {
    const h = harness({ rows: [row, row], clients: [clientDouble(), clientDouble({ counts: { claim: 0 } })] });
    await expect(drainPromotionOutbox(h.pool)).resolves.toEqual({ delivered: 1, failed: 0, pending: 0 });
    expect(stages(h.clients[1]!)).toEqual([...context, "claim", "commit", ...cleanup]);
    expectRestricted(h, 2);
  });

  it("stops later rows and rejects the batch after an unknown outcome following an acknowledged row", async () => {
    const error = new Error("second commit unknown");
    const h = harness({ rows: [row, { ...row, id: "outbox-2" }, { ...row, id: "outbox-3" }], clients: [clientDouble(), clientDouble({ errors: { commit: error } }), clientDouble()] });
    await expect(drainPromotionOutbox(h.pool)).rejects.toBe(error);
    expect(stages(h.clients[0]!)).toContain("commit");
    expect(stages(h.clients[0]!)).not.toContain("rollback");
    expect(h.clients[2]!.query).not.toHaveBeenCalled();
    expect(h.clients[2]!.release).not.toHaveBeenCalled();
    expect(h.discovery.query).toHaveBeenCalledTimes(1);
    expectRestricted(h, 2);
  });

  it("propagates a final backlog-query failure after the acknowledged row commit", async () => {
    const error = new Error("backlog query failed");
    const h = harness({ backlogError: error });
    await expect(drainPromotionOutbox(h.pool)).rejects.toBe(error);
    expect(stages(h.clients[0]!)).toContain("commit");
    expect(stages(h.clients[0]!)).not.toContain("rollback");
    expect(h.discovery.query).toHaveBeenCalledTimes(2);
    expectRestricted(h);
  });

  it("propagates discovery failure before obtaining any app connection", async () => {
    const error = new Error("discovery failed");
    const h = harness({ discoveryError: error });
    await expect(drainPromotionOutbox(h.pool)).rejects.toBe(error);
    expect(connections.getAppPool).not.toHaveBeenCalled();
    expectRestricted(h, 0);
  });
});
