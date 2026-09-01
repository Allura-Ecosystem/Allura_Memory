import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { tenantQuery, withTenantTransaction } from "@/lib/db/tenant-transaction";
import { closePool, getAppPool, getPool } from "@/lib/postgres/connection";

const TENANT_A = "allura-tenant-isolation-a";
const TENANT_B = "allura-tenant-isolation-b";
const PRINCIPAL = "test-principal-24-3";
const WORKSPACE_A = "workspace-tenant-isolation-a";

// Live PostgreSQL is required. The test is included by vitest.config.live-db.ts.
// getAppPool() calls getConnectionConfig({ requireAppRole: true, ... }),
// which throws synchronously when POSTGRES_APP_USER/POSTGRES_APP_PASSWORD
// are unset -- not just when POSTGRES_PASSWORD is unset. The gate checks all
// three so describeLive only resolves to `describe` when getAppPool() can
// actually succeed, and appPool is built inside beforeAll (never in the
// describe factory body) so a skipped suite's factory can never throw
// during collection.
const describeLive = process.env.POSTGRES_PASSWORD && process.env.POSTGRES_APP_USER && process.env.POSTGRES_APP_PASSWORD
  ? describe
  : describe.skip;

describeLive("events ledger immutability (AC-7)", () => {
  let appPool: Pool;

  beforeAll(() => {
    appPool = getAppPool();
  });

  afterAll(async () => {
    // closePool() (not appPool.end() directly): getAppPool()/getOwnerPool()
    // are module-level singletons (src/lib/postgres/connection.ts), and a
    // raw .end() leaves the singleton reference pointing at a now-dead pool
    // for any other e2e file sharing this worker process. closePool() nulls
    // both singleton references before awaiting, and is idempotent-safe if
    // another file's teardown already ran it.
    await closePool();
  });

  it("rejects UPDATE and DELETE on events when connected as the application role", async () => {
    await getPool().query(
      `INSERT INTO workspaces (workspace_id, group_id, name)
       VALUES ($1, $2, 'Events immutability workspace')
       ON CONFLICT (workspace_id) DO NOTHING`,
      [WORKSPACE_A, TENANT_A],
    );
    // Insert an event as the application role with tenant/workspace context.
    const insertResult = await withTenantTransaction(
      { tenantId: TENANT_A, workspaceId: WORKSPACE_A, principalId: PRINCIPAL },
      async (client) => {
        return await client.query(
          `INSERT INTO events (group_id, workspace_id, event_type, agent_id, status, metadata, session_id)
           VALUES ($1, $2, 'tenant_isolation_test', $3, 'completed', '{"source":"24.3-test"}', $4)
           RETURNING id`,
          [TENANT_A, WORKSPACE_A, PRINCIPAL, "test-session"],
        );
      },
      appPool,
    );

    const eventId = insertResult.rows[0].id;
    expect(typeof eventId).toBe("string");

    // Attempt UPDATE as application role: must fail.
    await expect(
      withTenantTransaction(
        { tenantId: TENANT_A, workspaceId: WORKSPACE_A, principalId: PRINCIPAL },
        async (client) => {
          return await client.query("UPDATE events SET status = 'failed' WHERE id = $1", [eventId]);
        },
        appPool,
      ),
    ).rejects.toThrow();

    // Attempt DELETE as application role: must fail.
    await expect(
      withTenantTransaction(
        { tenantId: TENANT_A, workspaceId: WORKSPACE_A, principalId: PRINCIPAL },
        async (client) => {
          return await client.query("DELETE FROM events WHERE id = $1", [eventId]);
        },
        appPool,
      ),
    ).rejects.toThrow();

    // The row must still exist.
    const check = await tenantQuery(
      { tenantId: TENANT_A, workspaceId: WORKSPACE_A, principalId: PRINCIPAL },
      "SELECT id FROM events WHERE id = $1",
      [eventId],
      appPool,
    );
    expect(check.rows.length).toBe(1);
  });

  it("allows break-glass mutation after SET ROLE allura_breakglass", async () => {
    const ownerPool = getPool();
    const insertResult = await ownerPool.query(
      `INSERT INTO events (group_id, event_type, agent_id, status, metadata, session_id)
       VALUES ($1, 'tenant_isolation_test', $2, 'completed', '{"source":"24.3-breakglass"}', $3)
       RETURNING id`,
      [TENANT_B, PRINCIPAL, "breakglass-session"],
    );
    const eventId = insertResult.rows[0].id;

    const client = await ownerPool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET ROLE allura_breakglass");
      await client.query("UPDATE events SET status = 'failed' WHERE id = $1", [eventId]);
      await client.query("DELETE FROM events WHERE id = $1", [eventId]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      await client.query("SET ROLE NONE").catch(() => undefined);
      client.release();
    }

    const check = await ownerPool.query("SELECT id FROM events WHERE id = $1", [eventId]);
    expect(check.rows.length).toBe(0);
  });
});
