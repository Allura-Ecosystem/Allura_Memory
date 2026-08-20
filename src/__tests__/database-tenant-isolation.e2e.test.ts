import { afterAll, describe, expect, it } from "vitest";
import { tenantQuery, withTenantTransaction } from "@/lib/db/tenant-transaction";
import { getAppPool } from "@/lib/postgres/connection";

const TENANT_A = "allura-tenant-isolation-a";
const TENANT_B = "allura-tenant-isolation-b";
const PRINCIPAL = "test-principal-24-3";

const describeLive = process.env.POSTGRES_PASSWORD ? describe : describe.skip;

describeLive("database-enforced tenant isolation (AC-3..AC-6, AC-9)", () => {
  const appPool = getAppPool();

  afterAll(async () => {
    await appPool.end();
  });

  it("returns only rows matching the active tenant context", async () => {
    // Seed one row per tenant.
    await withTenantTransaction(
      { tenantId: TENANT_A, principalId: PRINCIPAL },
      async (client) => {
        await client.query(
          `INSERT INTO allura_memories (group_id, session_id, user_id, memory_type, content, metadata)
           VALUES ($1, $2, $3, 'episodic', 'tenant A memory', '{}')`,
          [TENANT_A, "session-a", PRINCIPAL],
        );
      },
      appPool,
    );

    await withTenantTransaction(
      { tenantId: TENANT_B, principalId: PRINCIPAL },
      async (client) => {
        await client.query(
          `INSERT INTO allura_memories (group_id, session_id, user_id, memory_type, content, metadata)
           VALUES ($1, $2, $3, 'episodic', 'tenant B memory', '{}')`,
          [TENANT_B, "session-b", PRINCIPAL],
        );
      },
      appPool,
    );

    // Tenant A should see only its own row.
    const aQuery = await tenantQuery(
      { tenantId: TENANT_A, principalId: PRINCIPAL },
      "SELECT content FROM allura_memories WHERE memory_type = 'episodic' ORDER BY content",
      undefined,
      appPool,
    );
    expect(aQuery.rows.map((r) => r.content)).toEqual(["tenant A memory"]);

    // Tenant B should see only its own row.
    const bQuery = await tenantQuery(
      { tenantId: TENANT_B, principalId: PRINCIPAL },
      "SELECT content FROM allura_memories WHERE memory_type = 'episodic' ORDER BY content",
      undefined,
      appPool,
    );
    expect(bQuery.rows.map((r) => r.content)).toEqual(["tenant B memory"]);
  });

  it("fails closed when no tenant context is set", async () => {
    const client = await appPool.connect();
    try {
      // Deliberately do not set app.current_tenant.
      const result = await client.query(
        "SELECT count(*)::int AS n FROM allura_memories WHERE memory_type = 'episodic'",
      );
      expect(result.rows[0].n).toBe(0);
    } finally {
      client.release();
    }
  });

  it("rejects an INSERT whose group_id does not match the tenant context", async () => {
    await expect(
      withTenantTransaction(
        { tenantId: TENANT_A, principalId: PRINCIPAL },
        async (client) => {
          await client.query(
            `INSERT INTO allura_memories (group_id, session_id, user_id, memory_type, content, metadata)
             VALUES ($1, $2, $3, 'episodic', 'forged tenant', '{}')`,
            [TENANT_B, "session-forge", PRINCIPAL],
          );
        },
        appPool,
      ),
    ).rejects.toThrow();
  });

  it("does not leak tenant context between pooled connections", async () => {
    const results: string[] = [];

    async function tenantWork(tenantId: string, label: string) {
      await withTenantTransaction(
        { tenantId, principalId: PRINCIPAL },
        async (client) => {
          const r = await client.query(
            "SELECT content FROM allura_memories WHERE memory_type = 'episodic' AND group_id = $1",
            [tenantId],
          );
          results.push(`${label}:${r.rows.length}`);
        },
        appPool,
      );
    }

    // Interleave tenant A and B on the same pool.
    await Promise.all([
      tenantWork(TENANT_A, "A1"),
      tenantWork(TENANT_B, "B1"),
      tenantWork(TENANT_A, "A2"),
      tenantWork(TENANT_B, "B2"),
    ]);

    expect(results.sort()).toEqual(["A1:1", "A2:1", "B1:1", "B2:1"]);
  });
});
