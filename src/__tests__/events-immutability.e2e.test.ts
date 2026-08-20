import { afterAll, describe, expect, it } from "vitest";
import { tenantQuery, withTenantTransaction } from "@/lib/db/tenant-transaction";
import { getAppPool, getPool } from "@/lib/postgres/connection";

const TENANT_A = "allura-tenant-isolation-a";
const TENANT_B = "allura-tenant-isolation-b";
const PRINCIPAL = "test-principal-24-3";

// Live PostgreSQL is required. The test is included by vitest.config.live-db.ts.
const describeLive = process.env.POSTGRES_PASSWORD ? describe : describe.skip;

describeLive("events ledger immutability (AC-7)", () => {
  const appPool = getAppPool();

  afterAll(async () => {
    await appPool.end();
  });

  it("rejects UPDATE and DELETE on events when connected as the application role", async () => {
    // Insert an event as the application role with tenant context.
    const insertResult = await withTenantTransaction(
      { tenantId: TENANT_A, principalId: PRINCIPAL },
      async (client) => {
        return await client.query(
          `INSERT INTO events (group_id, event_type, agent_id, status, metadata, session_id)
           VALUES ($1, 'tenant_isolation_test', $2, 'completed', '{"source":"24.3-test"}', $3)
           RETURNING id`,
          [TENANT_A, PRINCIPAL, "test-session"],
        );
      },
      appPool,
    );

    const eventId = insertResult.rows[0].id;
    expect(typeof eventId).toBe("string");

    // Attempt UPDATE as application role: must fail.
    await expect(
      withTenantTransaction(
        { tenantId: TENANT_A, principalId: PRINCIPAL },
        async (client) => {
          return await client.query("UPDATE events SET status = 'failed' WHERE id = $1", [eventId]);
        },
        appPool,
      ),
    ).rejects.toThrow();

    // Attempt DELETE as application role: must fail.
    await expect(
      withTenantTransaction(
        { tenantId: TENANT_A, principalId: PRINCIPAL },
        async (client) => {
          return await client.query("DELETE FROM events WHERE id = $1", [eventId]);
        },
        appPool,
      ),
    ).rejects.toThrow();

    // The row must still exist.
    const check = await tenantQuery(
      { tenantId: TENANT_A, principalId: PRINCIPAL },
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
