/**
 * Test Guards — Environment-based test gating
 *
 * Provides consistent environment-variable-based guards for tests
 * that require external dependencies (databases, browsers, servers).
 *
 * Usage:
 *   import { shouldRunE2E, shouldRunBrowser, shouldRunIntegration } from "./test-guards";
 *   describe.skipIf(!shouldRunE2E)("My E2E test", () => { ... });
 */

/** True when RUN_E2E_TESTS=true — enables PostgreSQL live tests */
export const shouldRunE2E = process.env.RUN_E2E_TESTS === "true";

/** True when RUN_BROWSER_TESTS=true — enables Playwright/browser automation tests */
export const shouldRunBrowser = process.env.RUN_BROWSER_TESTS === "true";

/** True when RUN_INTEGRATION_TESTS=true — enables MCP Docker + server integration tests */
export const shouldRunIntegration = process.env.RUN_INTEGRATION_TESTS === "true";

/**
 * Check if PostgreSQL is reachable at the current env config.
 * Useful for beforeAll() health checks in E2E tests.
 */
export async function isPostgresReachable(): Promise<boolean> {
  try {
    const { getPool, closePool } = await import("../lib/postgres/connection");
    const pool = getPool();
    await pool.query("SELECT 1");
    await closePool();
    return true;
  } catch {
    return false;
  }
}