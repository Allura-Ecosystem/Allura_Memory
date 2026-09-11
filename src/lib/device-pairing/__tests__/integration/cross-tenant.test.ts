import { afterAll, beforeAll, expect, it } from "vitest";

import { clearAuthConfig, getAuthConfig } from "@/lib/auth/config";
import { clearDevicePairingConfig, getDeviceAuthAudience, getDeviceAuthOrigin } from "@/lib/device-pairing/config";
import { createDeviceToken, revokeToken } from "@/lib/mcp-token/repository";
import { closePool } from "@/lib/postgres/connection";
import { setLockMode } from "@/lib/workspace/repository";
import { createLiveDatabase, createSigningKey, seedApprovedDevice } from "./live-fixtures";
import { describeMigrationLive, type MigrationDatabase } from "../migrations/postgres-test-harness";

describeMigrationLive("29.19 integration cross-tenant", () => {
  let db: MigrationDatabase;
  let originalDatabase: string | undefined;

  beforeAll(async () => {
    db = await createLiveDatabase("cross-tenant");
    originalDatabase = process.env.POSTGRES_DB;
    process.env.POSTGRES_DB = db.databaseName;
    await closePool();
    await seedApprovedDevice(db, {
      groupId: "allura-live-tenant-a", workspaceId: "ws-live-tenant-a", principalId: "principal-live-tenant-a",
      deviceId: "dev-live-tenant-a", signingKey: createSigningKey("kid-tenant-a"),
    });
    await seedApprovedDevice(db, {
      groupId: "allura-live-tenant-b", workspaceId: "ws-live-tenant-b", principalId: "principal-live-tenant-b",
      deviceId: "dev-live-tenant-b", signingKey: createSigningKey("kid-tenant-b"),
    });
  }, 120_000);
  afterAll(async () => {
    await closePool();
    if (originalDatabase === undefined) delete process.env.POSTGRES_DB;
    else process.env.POSTGRES_DB = originalDatabase;
    await db?.close();
  });

  it("cannot revoke a different tenant's device credential even when its opaque token ID is known", async () => {
    const client = await db.owner.connect();
    try {
      const token = await createDeviceToken(client, {
        paired_device_id: "dev-live-tenant-b", membership_role: "admin", lock_mode: "normal",
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      });
      await expect(revokeToken(token.record.id, "allura-live-tenant-a")).resolves.toBe(false);
      const persisted = await client.query("SELECT group_id, revoked_at FROM mcp_tokens WHERE id = $1", [token.record.id]);
      expect(persisted.rows).toEqual([{ group_id: "allura-live-tenant-b", revoked_at: null }]);
    } finally {
      client.release();
    }
  });

  it("cannot lock another tenant's opaque workspace target", async () => {
    await expect(setLockMode("allura-live-tenant-a", "ws-live-tenant-b", "full_lockdown")).resolves.toBeNull();
    const persisted = await db.owner.query(
      "SELECT group_id, lock_mode FROM workspaces WHERE workspace_id = $1",
      ["ws-live-tenant-b"],
    );
    expect(persisted.rows).toEqual([{ group_id: "allura-live-tenant-b", lock_mode: "normal" }]);
  });

  it("restores each live-fixture device-auth environment key and config cache after close", async () => {
    const keys = [
      "ALLURA_DEVICE_AUTH_ORIGIN",
      "ALLURA_DEVICE_AUTH_AUDIENCE",
      "ALLURA_MCP_BASE_URL",
      "ALLURA_MCP_TOKEN_SECRET",
    ] as const;
    const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    try {
      process.env.ALLURA_DEVICE_AUTH_ORIGIN = "https://before.integration.test";
      process.env.ALLURA_DEVICE_AUTH_AUDIENCE = "https://before.integration.test/device-auth";
      process.env.ALLURA_MCP_BASE_URL = "https://before-mcp.integration.test";
      delete process.env.ALLURA_MCP_TOKEN_SECRET;
      clearAuthConfig();
      clearDevicePairingConfig();

      const expected = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
      const fixture = await createLiveDatabase("fixture-env-restore");
      expect(getDeviceAuthOrigin()).toBe("https://device.integration.test");
      expect(getDeviceAuthAudience()).toBe("https://device.integration.test/device-auth");
      expect(getAuthConfig().ALLURA_MCP_BASE_URL).toBe("https://mcp.integration.test");

      await fixture.close();

      expect(Object.fromEntries(keys.map((key) => [key, process.env[key]]))).toEqual(expected);
      expect(Object.hasOwn(process.env, "ALLURA_MCP_TOKEN_SECRET")).toBe(false);
      expect(getDeviceAuthOrigin()).toBe("https://before.integration.test");
      expect(getDeviceAuthAudience()).toBe("https://before.integration.test/device-auth");
      expect(getAuthConfig().ALLURA_MCP_BASE_URL).toBe("https://before-mcp.integration.test");
    } finally {
      for (const key of keys) {
        if (original[key] === undefined) delete process.env[key];
        else process.env[key] = original[key];
      }
      clearAuthConfig();
      clearDevicePairingConfig();
    }
  });

  it("restores exact device-auth state and clears cached config when disposable setup fails", async () => {
    const keys = [
      "ALLURA_DEVICE_AUTH_ORIGIN",
      "ALLURA_DEVICE_AUTH_AUDIENCE",
      "ALLURA_MCP_BASE_URL",
      "ALLURA_MCP_TOKEN_SECRET",
    ] as const;
    const original = Object.fromEntries(
      keys.map((key) => [key, { present: Object.hasOwn(process.env, key), value: process.env[key] }]),
    );
    const originalPassword = { present: Object.hasOwn(process.env, "POSTGRES_PASSWORD"), value: process.env.POSTGRES_PASSWORD };
    try {
      process.env.ALLURA_DEVICE_AUTH_ORIGIN = "https://catch-before.integration.test";
      process.env.ALLURA_DEVICE_AUTH_AUDIENCE = "https://catch-before.integration.test/device-auth";
      process.env.ALLURA_MCP_BASE_URL = "https://catch-before-mcp.integration.test";
      delete process.env.ALLURA_MCP_TOKEN_SECRET;
      clearAuthConfig();
      clearDevicePairingConfig();

      const expectedEnv = Object.fromEntries(
        keys.map((key) => [key, { present: Object.hasOwn(process.env, key), value: process.env[key] }]),
      );
      const expectedOrigin = getDeviceAuthOrigin();
      const expectedAudience = getDeviceAuthAudience();
      const expectedMcpBaseUrl = getAuthConfig().ALLURA_MCP_BASE_URL;

      process.env.POSTGRES_PASSWORD = "intentionally-invalid-fixture-catch-password";
      await expect(createLiveDatabase("fixture-catch-no-leak")).rejects.toThrow();

      expect(Object.fromEntries(
        keys.map((key) => [key, { present: Object.hasOwn(process.env, key), value: process.env[key] }]),
      )).toEqual(expectedEnv);
      expect(Object.hasOwn(process.env, "ALLURA_MCP_TOKEN_SECRET")).toBe(false);
      expect(getDeviceAuthOrigin()).toBe(expectedOrigin);
      expect(getDeviceAuthAudience()).toBe(expectedAudience);
      expect(getAuthConfig().ALLURA_MCP_BASE_URL).toBe(expectedMcpBaseUrl);
      const leaked = await db.owner.query(
        "SELECT datname FROM pg_database WHERE datname LIKE 'allura_291_fixture-catch-no-leak_%'",
      );
      expect(leaked.rows).toEqual([]);
    } finally {
      if (originalPassword.present) process.env.POSTGRES_PASSWORD = originalPassword.value;
      else delete process.env.POSTGRES_PASSWORD;
      for (const key of keys) {
        const previous = original[key];
        if (previous.present) process.env[key] = previous.value;
        else delete process.env[key];
      }
      clearAuthConfig();
      clearDevicePairingConfig();
    }
  });
});
