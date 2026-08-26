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
  };

  afterEach(async () => {
    const { closePool } = await import("./connection");
    await closePool();
    vi.resetModules();
    vi.clearAllMocks();

    process.env.POSTGRES_PASSWORD = originalEnvironment.password;
    process.env.POSTGRES_APP_USER = originalEnvironment.appUser;
    process.env.POSTGRES_APP_PASSWORD = originalEnvironment.appPassword;
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
});
