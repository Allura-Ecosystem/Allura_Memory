import { afterEach, describe, expect, it, vi } from "vitest";

const { poolConstructor } = vi.hoisted(() => ({
  poolConstructor: vi.fn(),
}));

vi.mock("pg", () => ({
  Pool: class {
    constructor(config: unknown) {
      return poolConstructor(config);
    }
  },
}));

const scope = {
  tenantId: "allura-system",
  workspaceId: "workspace-watchdog",
  principalId: "watchdog-service",
};

function makePool() {
  const client = {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    release: vi.fn(),
  };
  return {
    connect: vi.fn().mockResolvedValue(client),
    end: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    client,
  };
}

describe("managed application-role pool", () => {
  const originalEnvironment = {
    password: process.env.POSTGRES_PASSWORD,
    appUser: process.env.POSTGRES_APP_USER,
    appPassword: process.env.POSTGRES_APP_PASSWORD,
    appOptions: process.env.POSTGRES_APP_OPTIONS,
    nodeEnv: process.env.NODE_ENV,
    localDb: process.env.ALLURA_EPIC30_LOCAL_DB,
    runId: process.env.ALLURA_EPIC30_RUN_ID,
    host: process.env.POSTGRES_HOST,
    port: process.env.POSTGRES_PORT,
    database: process.env.POSTGRES_DB,
    receiptUser: process.env.POSTGRES_RECEIPT_USER,
    receiptPassword: process.env.POSTGRES_RECEIPT_PASSWORD,
  };

  afterEach(async () => {
    const { closePool } = await import("./connection");
    await closePool();
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.clearAllMocks();

    const restore: Record<string, string | undefined> = {
      POSTGRES_PASSWORD: originalEnvironment.password,
      POSTGRES_APP_USER: originalEnvironment.appUser,
      POSTGRES_APP_PASSWORD: originalEnvironment.appPassword,
      POSTGRES_APP_OPTIONS: originalEnvironment.appOptions,
      NODE_ENV: originalEnvironment.nodeEnv,
      ALLURA_EPIC30_LOCAL_DB: originalEnvironment.localDb,
      ALLURA_EPIC30_RUN_ID: originalEnvironment.runId,
      POSTGRES_HOST: originalEnvironment.host,
      POSTGRES_PORT: originalEnvironment.port,
      POSTGRES_DB: originalEnvironment.database,
      POSTGRES_RECEIPT_USER: originalEnvironment.receiptUser,
      POSTGRES_RECEIPT_PASSWORD: originalEnvironment.receiptPassword,
    };
    for (const [key, value] of Object.entries(restore)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("ignores a forged owner pool and unconditionally binds workspace work to the managed app pool", async () => {
    process.env.POSTGRES_PASSWORD = "owner-password";
    process.env.POSTGRES_APP_USER = "allura_app";
    process.env.POSTGRES_APP_PASSWORD = "app-password";
    const forgedOwnerPool = makePool();
    const appPool = makePool();
    poolConstructor.mockReturnValue(appPool);

    const { withWorkspaceTransaction } = await import("../db/tenant-transaction");
    await (withWorkspaceTransaction as unknown as (
      targetScope: typeof scope,
      callback: (client: typeof appPool.client) => Promise<unknown>,
      forgedPool: typeof forgedOwnerPool,
    ) => Promise<unknown>)(scope, (client) => client.query("SELECT 1"), forgedOwnerPool);

    expect(forgedOwnerPool.connect).not.toHaveBeenCalled();
    expect(appPool.connect).toHaveBeenCalledTimes(1);
  });

  it("reuses one strict app-role pool for every qualified watchdog proposal write", async () => {
    process.env.POSTGRES_PASSWORD = "owner-password";
    process.env.POSTGRES_APP_USER = "allura_app";
    process.env.POSTGRES_APP_PASSWORD = "app-password";

    const appPool = makePool();
    poolConstructor.mockReturnValue(appPool);

    const { withWorkspaceTransaction } = await import("../db/tenant-transaction");

    for (let index = 0; index < 50; index += 1) {
      await withWorkspaceTransaction(scope, (client) => client.query("INSERT INTO canonical_proposals DEFAULT VALUES"));
    }

    expect(poolConstructor).toHaveBeenCalledTimes(1);
    expect(poolConstructor).toHaveBeenCalledWith(expect.objectContaining({
      user: "allura_app",
      password: "app-password",
    }));
    expect(appPool.connect).toHaveBeenCalledTimes(50);
  });

  it("passes explicitly configured PostgreSQL startup options to the managed app pool", async () => {
    process.env.POSTGRES_PASSWORD = "owner-password";
    process.env.POSTGRES_APP_USER = "owner-user";
    process.env.POSTGRES_APP_PASSWORD = "owner-password";
    process.env.POSTGRES_APP_OPTIONS = "-c role=allura_app";
    const appPool = makePool();
    poolConstructor.mockReturnValue(appPool);

    const { getAppPool } = await import("./connection");
    expect(getAppPool()).toBe(appPool);

    expect(poolConstructor).toHaveBeenCalledWith(expect.objectContaining({
      user: "owner-user",
      password: "owner-password",
      options: "-c role=allura_app",
    }));
  });

  it("preserves the legacy owner-backed getPool default while workspace boundaries opt into getAppPool", async () => {
    process.env.POSTGRES_PASSWORD = "owner-password";
    process.env.POSTGRES_APP_USER = "allura_app";
    process.env.POSTGRES_APP_PASSWORD = "app-password";

    const ownerPool = makePool();
    const appPool = makePool();
    const replacementOwnerPool = makePool();
    poolConstructor
      .mockReturnValueOnce(ownerPool)
      .mockReturnValueOnce(appPool)
      .mockReturnValueOnce(replacementOwnerPool);

    const { closePool, getAppPool, getOwnerPool, getPool } = await import("./connection");
    expect(getPool()).toBe(ownerPool);
    expect(getOwnerPool()).toBe(ownerPool);
    expect(getAppPool()).toBe(appPool);

    await closePool();

    expect(ownerPool.end).toHaveBeenCalledTimes(1);
    expect(appPool.end).toHaveBeenCalledTimes(1);
    expect(getPool()).toBe(replacementOwnerPool);
    expect(poolConstructor).toHaveBeenCalledTimes(3);
  });

  it("requires a separate per-run receipt login and never falls back to app or owner credentials", async () => {
    const run = "a".repeat(32);
    vi.stubEnv("NODE_ENV", "test");
    process.env.ALLURA_EPIC30_LOCAL_DB = "enabled";
    process.env.ALLURA_EPIC30_RUN_ID = run;
    process.env.POSTGRES_HOST = "127.0.0.1";
    process.env.POSTGRES_PORT = "5444";
    process.env.POSTGRES_DB = `allura_epic30_read_${run}`;
    process.env.POSTGRES_PASSWORD = "owner-password";
    process.env.POSTGRES_APP_USER = "allura_app";
    process.env.POSTGRES_APP_PASSWORD = "app-password";
    delete process.env.POSTGRES_RECEIPT_USER;
    delete process.env.POSTGRES_RECEIPT_PASSWORD;
    const { getEpic30ReceiptPool } = await import("./connection");
    expect(() => getEpic30ReceiptPool()).toThrow(/receipt writer configuration refused/);
    expect(poolConstructor).not.toHaveBeenCalled();

    process.env.POSTGRES_RECEIPT_USER = `allura_epic30_receipt_${run}`;
    process.env.POSTGRES_RECEIPT_PASSWORD = "distinct-receipt-password";
    const receiptPool = makePool();
    poolConstructor.mockReturnValue(receiptPool);
    expect(getEpic30ReceiptPool()).toBe(receiptPool);
    expect(poolConstructor).toHaveBeenCalledWith(expect.objectContaining({
      host: "127.0.0.1", port: 5444, database: `allura_epic30_read_${run}`,
      user: `allura_epic30_receipt_${run}`, password: "distinct-receipt-password",
    }));
    process.env.POSTGRES_RECEIPT_USER = "allura_app";
    expect(() => getEpic30ReceiptPool()).toThrow(/receipt writer configuration refused/);
  });
});
