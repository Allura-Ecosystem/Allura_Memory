/**
 * Regression test for a real production bug found 2026-08-27: migration
 * 31's fn_pattern_proposals_append_only_guard() used
 * `jsonb_object_keys(to_jsonb(NEW) - to_jsonb(OLD))`. `jsonb - jsonb` is not
 * a valid PostgreSQL operator, so this trigger raised an error on every
 * real UPDATE -- including the legitimate HITL review-gate transition
 * (status + reviewed_at) that /api/genesis/proposals/approve and /reject
 * depend on. Fixed in migrations 31 (fresh bootstraps) and 43 (forward-fix
 * for already-bootstrapped databases) with explicit per-column
 * IS DISTINCT FROM comparisons.
 *
 * There was previously zero test coverage of this trigger's UPDATE path at
 * all -- genesis-engine.test.ts only exercises the INSERT path with a
 * mocked control plane. This is the first test to hit the real trigger.
 */
import { afterAll, describe, expect, it } from "vitest";
import { withTenantTransaction } from "@/lib/db/tenant-transaction";
import { closePool, getAppPool, getPool } from "@/lib/postgres/connection";

const TENANT = "allura-pattern-proposals-e2e";
const PRINCIPAL = "test-principal-pattern-proposals";

// Live PostgreSQL is required. The test is included by vitest.config.live-db.ts.
const describeLive = process.env.POSTGRES_PASSWORD ? describe : describe.skip;

describeLive("pattern_proposals append-only guard (migrations 31 + 43)", () => {
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

  it("allows the HITL review-gate transition (status + reviewed_at) as the application role", async () => {
    const insertResult = await getPool().query(
      `INSERT INTO pattern_proposals (group_id, pattern_description, pattern_type, frequency, confidence)
       VALUES ($1, 'regression test pattern', 'workflow', 3, 0.9)
       RETURNING id`,
      [TENANT],
    );
    const id = insertResult.rows[0].id;

    // This is exactly the shape of pgUpdatePatternProposal's UPDATE
    // (src/control-plane/target-resolver.ts) -- the path
    // /api/genesis/proposals/approve and /reject depend on.
    const update = await withTenantTransaction(
      { tenantId: TENANT, principalId: PRINCIPAL },
      async (client) => {
        return client.query(
          `UPDATE pattern_proposals SET status = 'approved', reviewed_at = NOW() WHERE id = $1 RETURNING status, reviewed_at`,
          [id],
        );
      },
      appPool,
    );

    expect(update.rows[0].status).toBe("approved");
    expect(update.rows[0].reviewed_at).not.toBeNull();
  });

  it("rejects an UPDATE that touches a column other than status/reviewed_at", async () => {
    const insertResult = await getPool().query(
      `INSERT INTO pattern_proposals (group_id, pattern_description, pattern_type, frequency, confidence)
       VALUES ($1, 'regression test pattern 2', 'workflow', 3, 0.9)
       RETURNING id`,
      [TENANT],
    );
    const id = insertResult.rows[0].id;

    await expect(
      withTenantTransaction(
        { tenantId: TENANT, principalId: PRINCIPAL },
        async (client) => client.query(`UPDATE pattern_proposals SET confidence = 0.5 WHERE id = $1`, [id]),
        appPool,
      ),
    ).rejects.toThrow(/append-only/i);
  });

  it("rejects DELETE", async () => {
    const insertResult = await getPool().query(
      `INSERT INTO pattern_proposals (group_id, pattern_description, pattern_type, frequency, confidence)
       VALUES ($1, 'regression test pattern 3', 'workflow', 3, 0.9)
       RETURNING id`,
      [TENANT],
    );
    const id = insertResult.rows[0].id;

    await expect(getPool().query(`DELETE FROM pattern_proposals WHERE id = $1`, [id])).rejects.toThrow(
      /append-only/i,
    );
  });
});
