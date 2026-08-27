import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { tenantQuery, withTenantTransaction } from "@/lib/db/tenant-transaction";
import { closePool, getAppPool } from "@/lib/postgres/connection";

const RUN_ID = randomUUID().replaceAll("-", "");
const TENANT_A = `allura-tenant-isolation-a-${RUN_ID}`;
const TENANT_B = `allura-tenant-isolation-b-${RUN_ID}`;
const PRINCIPAL = `test-principal-24-3-${RUN_ID}`;
const WORKSPACE_A = `workspace-a-${RUN_ID}`;
const WORKSPACE_B = `workspace-b-${RUN_ID}`;

const describeLive = process.env.POSTGRES_PASSWORD ? describe : describe.skip;

describeLive("database-enforced tenant isolation (AC-3..AC-6, AC-9)", () => {
  const appPool = getAppPool();

  afterAll(async () => {
    // closePool() (not appPool.end() directly): getAppPool()/getOwnerPool()
    // are module-level singletons (src/lib/postgres/connection.ts), and a
    // raw .end() leaves the singleton reference pointing at a now-dead pool
    // for any other e2e file sharing this worker process. closePool() nulls
    // both singleton references before awaiting, and is idempotent-safe if
    // another file's teardown already ran it.
    await closePool();
  });

  it("returns only rows matching the active tenant context", async () => {
    // Seed one workspace and one memory row per tenant. The workspace row must
    // exist before the memory insert because Migration 40's composite FK
    // allura_memories(group_id, workspace_id) REFERENCES workspaces(group_id, workspace_id)
    // requires the scoped workspace to be present.
    await withTenantTransaction(
      { tenantId: TENANT_A, workspaceId: WORKSPACE_A, principalId: PRINCIPAL },
      async (client) => {
        await client.query(
          `INSERT INTO workspaces (group_id, workspace_id, name) VALUES ($1, $2, 'tenant A workspace')`,
          [TENANT_A, WORKSPACE_A],
        );
        await client.query(
          `INSERT INTO allura_memories (group_id, workspace_id, workspace_scope_state, session_id, user_id, memory_type, content, metadata)
           VALUES ($1, $2, 'workspace_scoped', $3, $4, 'episodic', 'tenant A memory', '{}')`,
          [TENANT_A, WORKSPACE_A, "session-a", PRINCIPAL],
        );
      },
      appPool,
    );

    await withTenantTransaction(
      { tenantId: TENANT_B, workspaceId: WORKSPACE_B, principalId: PRINCIPAL },
      async (client) => {
        await client.query(
          `INSERT INTO workspaces (group_id, workspace_id, name) VALUES ($1, $2, 'Tenant B workspace')`,
          [TENANT_B, WORKSPACE_B],
        );
        await client.query(
          `INSERT INTO allura_memories (group_id, workspace_id, workspace_scope_state, session_id, user_id, memory_type, content, metadata)
           VALUES ($1, $2, 'workspace_scoped', $3, $4, 'episodic', 'tenant B memory', '{}')`,
          [TENANT_B, WORKSPACE_B, "session-b", PRINCIPAL],
        );
      },
      appPool,
    );

    // Tenant A should see only its own row.
    const aQuery = await tenantQuery(
      { tenantId: TENANT_A, workspaceId: WORKSPACE_A, principalId: PRINCIPAL },
      "SELECT content FROM allura_memories WHERE memory_type = 'episodic' ORDER BY content",
      undefined,
      appPool,
    );
    expect(aQuery.rows.map((r) => r.content)).toEqual(["tenant A memory"]);

    // Tenant B should see only its own row.
    const bQuery = await tenantQuery(
      { tenantId: TENANT_B, workspaceId: WORKSPACE_B, principalId: PRINCIPAL },
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
        { tenantId: TENANT_A, workspaceId: WORKSPACE_A, principalId: PRINCIPAL },
        async (client) => {
          await client.query(
            `INSERT INTO allura_memories (group_id, workspace_id, workspace_scope_state, session_id, user_id, memory_type, content, metadata)
             VALUES ($1, $2, 'workspace_scoped', $3, $4, 'episodic', 'forged tenant', '{}')`,
            [TENANT_B, WORKSPACE_B, "session-forge", PRINCIPAL],
          );
        },
        appPool,
      ),
    ).rejects.toThrow();
  });

  it("does not leak tenant context between pooled connections", async () => {
    const results: string[] = [];

    async function tenantWork(tenantId: string, workspaceId: string, label: string) {
      await withTenantTransaction(
        { tenantId, workspaceId, principalId: PRINCIPAL },
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
      tenantWork(TENANT_A, WORKSPACE_A, "A1"),
      tenantWork(TENANT_B, WORKSPACE_B, "B1"),
      tenantWork(TENANT_A, WORKSPACE_A, "A2"),
      tenantWork(TENANT_B, WORKSPACE_B, "B2"),
    ]);

    expect(results.sort()).toEqual(["A1:1", "A2:1", "B1:1", "B2:1"]);
  });
});
