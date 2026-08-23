import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePool, getConnectionConfig, getPool } from "./connection";

/**
 * PostgreSQL Connection Layer tests
 * Unit tests (getConnectionConfig) run without PostgreSQL.
 * Integration tests (getPool, closePool, Pool Error Handling) require running PostgreSQL.
 */

const shouldRunE2E = process.env.RUN_E2E_TESTS === "true";

describe("PostgreSQL Connection Layer", () => {
  beforeAll(async () => {
    // Ensure environment is configured for tests
    process.env.POSTGRES_HOST = process.env.POSTGRES_HOST || "localhost";
    process.env.POSTGRES_PORT = process.env.POSTGRES_PORT || "5432";
    process.env.POSTGRES_DB = process.env.POSTGRES_DB || "memory";
    process.env.POSTGRES_USER = process.env.POSTGRES_USER || "ronin4life";
    process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || "KaminaTHC*";
  });

  afterAll(async () => {
    // Clean up pool after all tests
    try {
      await closePool();
    } catch {
      // Pool may not be initialized if tests were skipped
    }
  });

  describe("getConnectionConfig", () => {
    it("should build connection config from environment variables", () => {
      const config = getConnectionConfig();

      expect(config.host).toBe(process.env.POSTGRES_HOST || "localhost");
      expect(config.port).toBe(parseInt(process.env.POSTGRES_PORT || "5432", 10));
      expect(config.database).toBe(process.env.POSTGRES_DB || "memory");
      expect(config.user).toBe(process.env.POSTGRES_USER || "ronin4life");
      expect(config.password).toBe(process.env.POSTGRES_PASSWORD || "KaminaTHC*");
    });

    it("should include pool safety settings", () => {
      const config = getConnectionConfig();

      expect(config.connectionTimeoutMillis).toBeDefined();
      expect(config.connectionTimeoutMillis).toBeGreaterThanOrEqual(1000);
      expect(config.idleTimeoutMillis).toBeDefined();
      expect(config.idleTimeoutMillis).toBeGreaterThanOrEqual(1000);
    });

    it("should use default values when env vars are not set", () => {
      const originalHost = process.env.POSTGRES_HOST;
      const originalPort = process.env.POSTGRES_PORT;

      delete process.env.POSTGRES_HOST;
      delete process.env.POSTGRES_PORT;

      const config = getConnectionConfig();

      // Restore environment
      if (originalHost !== undefined) process.env.POSTGRES_HOST = originalHost;
      if (originalPort !== undefined) process.env.POSTGRES_PORT = originalPort;

      expect(config.host).toBe("localhost");
      expect(config.port).toBe(5432);
    });
  });

  describe.skipIf(!shouldRunE2E)("getPool", () => {
    it("should return a singleton Pool instance", () => {
      const pool1 = getPool();
      const pool2 = getPool();

      expect(pool1).toBe(pool2);
    });

    it("should return a connected pool that can query", async () => {
      const pool = getPool();

      // A simple query should succeed
      const result = await pool.query("SELECT 1 as test");

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].test).toBe(1);
    });
  });

  describe.skipIf(!shouldRunE2E)("closePool", () => {
    it("should close the pool and allow reconnection", async () => {
      const pool1 = getPool();

      await closePool();

      // Get a new pool after closing
      const pool2 = getPool();

      // Should be able to query again
      const result = await pool2.query("SELECT 1 as test");

      expect(result.rows).toHaveLength(1);
    });
  });

  describe("Pool Error Handling", () => {
    it("should handle connection errors gracefully", async () => {
      // Temporarily use invalid credentials
      const originalUser = process.env.POSTGRES_USER;
      const originalPassword = process.env.POSTGRES_PASSWORD;

      process.env.POSTGRES_USER = "invalid_user";
      process.env.POSTGRES_PASSWORD = "invalid_password";

      // Close existing pool to force new connection
      await closePool();

      // Getting a pool with invalid credentials should either:
      // 1. Return a pool that fails on query (graceful error)
      // 2. Throw during pool creation
      // We expect it to NOT crash the process

      const pool = getPool();

      // Restore credentials before test assertion
      if (originalUser !== undefined) process.env.POSTGRES_USER = originalUser;
      if (originalPassword !== undefined) process.env.POSTGRES_PASSWORD = originalPassword;

      // Close invalid pool
      await closePool();
    });

    it("should throw when POSTGRES_PASSWORD is missing", () => {
      const originalPassword = process.env.POSTGRES_PASSWORD;
      delete process.env.POSTGRES_PASSWORD;

      expect(() => getConnectionConfig()).toThrow("POSTGRES_PASSWORD environment variable is required");

      // Restore
      if (originalPassword !== undefined) process.env.POSTGRES_PASSWORD = originalPassword;
    });

    it("requires explicit restricted application credentials for workspace-governed services", () => {
      const originalAppUser = process.env.POSTGRES_APP_USER;
      const originalAppPassword = process.env.POSTGRES_APP_PASSWORD;
      delete process.env.POSTGRES_APP_USER;
      delete process.env.POSTGRES_APP_PASSWORD;

      expect(() => getConnectionConfig({ requireAppRole: true })).toThrow(
        "POSTGRES_APP_USER and POSTGRES_APP_PASSWORD are required",
      );

      if (originalAppUser !== undefined) process.env.POSTGRES_APP_USER = originalAppUser;
      if (originalAppPassword !== undefined) process.env.POSTGRES_APP_PASSWORD = originalAppPassword;
    });
  });
});