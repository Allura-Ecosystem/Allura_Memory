/**
 * Story 26.7 AC-4 — adversarial tenant isolation for the Bumblebee operator
 * module.
 *
 * "A forged tenant cannot read or mutate another tenant's alerts or policy
 * drafts." This exercises the REAL read layer (src/lib/bumblebee/queries.ts)
 * against a REAL PostgreSQL instance with RLS enforced -- nothing mocked. Two
 * tenants are seeded with genuinely distinct data, and every surface is then
 * read as each tenant to prove neither can see the other.
 *
 * The forging is deliberately done the way an attacker would actually try it:
 * by presenting a scope object naming the victim tenant. There is no code
 * path that lets a caller supply a group_id that disagrees with the RLS GUCs
 * and win, because `withWorkspaceTransaction` sets both from the same scope.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  getBumblebeeSummary,
  listExposures,
  listIncidents,
  listReceipts,
  listSources,
} from "@/lib/bumblebee/queries";
import type { ResolvedWorkspaceScope } from "@/lib/db/workspace-scope";
import { closePool, getPool } from "@/lib/postgres/connection";

const TENANT_A = "allura-bumblebee-iso-a";
const TENANT_B = "allura-bumblebee-iso-b";
const WORKSPACE_A = "ws-bumblebee-iso-a";
const WORKSPACE_B = "ws-bumblebee-iso-b";

const scopeA: ResolvedWorkspaceScope = {
  tenantId: TENANT_A,
  workspaceId: WORKSPACE_A,
  principalId: "principal-a",
};
const scopeB: ResolvedWorkspaceScope = {
  tenantId: TENANT_B,
  workspaceId: WORKSPACE_B,
  principalId: "principal-b",
};

/** Stable per-tenant approval_ref so the receipt seed is idempotent. */
function approvalRefFor(tenant: string): string {
  return tenant === TENANT_A
    ? "aaaaaaaa-0000-4000-8000-000000000001"
    : "bbbbbbbb-0000-4000-8000-000000000002";
}

// Live PostgreSQL is required. Included by vitest.config.live-db.ts.
const describeLive = process.env.POSTGRES_PASSWORD ? describe : describe.skip;

describeLive("Bumblebee operator module — adversarial tenant isolation (Story 26.7 AC-4)", () => {
  beforeAll(async () => {
    const pool = getPool();

    for (const [tenant, workspace] of [
      [TENANT_A, WORKSPACE_A],
      [TENANT_B, WORKSPACE_B],
    ]) {
      await pool.query(
        `INSERT INTO workspaces (workspace_id, group_id, name)
         VALUES ($1, $2, $3) ON CONFLICT (workspace_id) DO NOTHING`,
        [workspace, tenant, `Bumblebee isolation ${tenant}`],
      );

      // One inventory record per tenant, with a tenant-identifying package
      // name so a leak is unambiguous rather than a matter of counting.
      await pool.query(
        `INSERT INTO inventory_records
           (id, group_id, workspace_id, artifact_type, ecosystem, package, version, hash,
            publisher, workflow_reference, source_ref, trust_state, freshness_state)
         VALUES ($1, $2, $3, 'lockfile', 'npm', $4, '1.0.0', $5, 'npm registry',
                 'bun.lock', 'bun.lock', 'verified', 'fresh')
         ON CONFLICT (group_id, workspace_id, id) DO NOTHING`,
        [`inv-${tenant}`, tenant, workspace, `secret-package-of-${tenant}`, `hash-${tenant}`],
      );

      await pool.query(
        `INSERT INTO threat_alerts
           (id, group_id, workspace_id, inventory_ref, artifact_ref, advisory_refs,
            match_type, confidence, severity, evidence_ids, dedup_key, lifecycle_state)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, '["adv-1"]'::jsonb, 'package_version', 1,
                 'critical', '["ev-1"]'::jsonb, $5, 'acknowledged')
         ON CONFLICT (group_id, workspace_id, dedup_key) DO NOTHING`,
        [tenant, workspace, `inv-${tenant}`, `secret-artifact-of-${tenant}`, `dedup-${tenant}`],
      );

      await pool.query(
        `INSERT INTO mitigation_receipts
           (id, group_id, workspace_id, draft_id, approval_ref, action, actor_id, actor_role,
            rationale, policy_reference, policy_version, evidence_ids)
         VALUES (gen_random_uuid(), $1, $2, $3, $5, 'approved_for_activation',
                 'admin-1', 'admin', $4, 'policy-v1', '1.0.0', '["ev-1"]'::jsonb)
         ON CONFLICT (group_id, workspace_id, draft_id, approval_ref, action) DO NOTHING`,
        [tenant, workspace, `draft-of-${tenant}`, `rationale-of-${tenant}`, approvalRefFor(tenant)],
      );
    }
  });

  afterAll(async () => {
    // Deliberately NO row cleanup. threat_alerts and mitigation_receipts are
    // append-only by design -- their triggers reject DELETE even for the
    // owner role, and an early version of this teardown proved it by failing
    // with "threat_alerts is immutable except lifecycle_state: DELETE is not
    // permitted". Rather than weaken an immutability guarantee to make a test
    // tidy, every seed above is idempotent (stable ids / deterministic
    // approval_ref + ON CONFLICT DO NOTHING), so re-runs converge on exactly
    // one row per tenant instead of accumulating.
    await closePool();
  });

  it("shows each tenant only its own sources", async () => {
    const aRows = await listSources(scopeA);
    const bRows = await listSources(scopeB);

    expect(aRows.map((r) => r.package)).toContain(`secret-package-of-${TENANT_A}`);
    expect(aRows.map((r) => r.package)).not.toContain(`secret-package-of-${TENANT_B}`);

    expect(bRows.map((r) => r.package)).toContain(`secret-package-of-${TENANT_B}`);
    expect(bRows.map((r) => r.package)).not.toContain(`secret-package-of-${TENANT_A}`);
  });

  it("shows each tenant only its own exposures", async () => {
    const aRows = await listExposures(scopeA);
    const bRows = await listExposures(scopeB);

    expect(aRows.map((r) => r.artifact_ref)).toContain(`secret-artifact-of-${TENANT_A}`);
    expect(aRows.map((r) => r.artifact_ref)).not.toContain(`secret-artifact-of-${TENANT_B}`);
    expect(bRows.map((r) => r.artifact_ref)).not.toContain(`secret-artifact-of-${TENANT_A}`);
  });

  it("shows each tenant only its own incidents", async () => {
    const aRows = await listIncidents(scopeA);
    expect(aRows.map((r) => r.artifact_ref)).toContain(`secret-artifact-of-${TENANT_A}`);
    expect(aRows.map((r) => r.artifact_ref)).not.toContain(`secret-artifact-of-${TENANT_B}`);
  });

  it("shows each tenant only its own receipts", async () => {
    const aRows = await listReceipts(scopeA);
    const bRows = await listReceipts(scopeB);

    expect(aRows.map((r) => r.rationale)).toContain(`rationale-of-${TENANT_A}`);
    expect(aRows.map((r) => r.rationale)).not.toContain(`rationale-of-${TENANT_B}`);
    expect(bRows.map((r) => r.rationale)).not.toContain(`rationale-of-${TENANT_A}`);
  });

  it("counts only the caller's own rows in the summary", async () => {
    const summaryA = await getBumblebeeSummary(scopeA);
    const summaryB = await getBumblebeeSummary(scopeB);

    // Each tenant seeded exactly one of each. If isolation leaked, these
    // would be 2.
    expect(summaryA.sources).toBe(1);
    expect(summaryB.sources).toBe(1);
    expect(summaryA.incidents).toBe(1);
    expect(summaryB.incidents).toBe(1);
  });

  it("returns nothing for a forged tenant that does not exist", async () => {
    const forged: ResolvedWorkspaceScope = {
      tenantId: "allura-attacker-not-real",
      workspaceId: "ws-attacker",
      principalId: "attacker",
    };

    // Fails closed: an unknown scope reads an empty world, never everything.
    await expect(listSources(forged)).resolves.toEqual([]);
    await expect(listExposures(forged)).resolves.toEqual([]);
    await expect(listReceipts(forged)).resolves.toEqual([]);
  });

  it("cannot reach tenant B's rows by pairing tenant A's id with tenant B's workspace", async () => {
    // The most plausible real forgery: a caller who knows both identifiers
    // and tries to mix them. RLS requires BOTH GUCs to match the row.
    const mixed: ResolvedWorkspaceScope = {
      tenantId: TENANT_A,
      workspaceId: WORKSPACE_B,
      principalId: "principal-a",
    };

    await expect(listSources(mixed)).resolves.toEqual([]);
    await expect(listExposures(mixed)).resolves.toEqual([]);
    await expect(listReceipts(mixed)).resolves.toEqual([]);
  });

  it("exposes no mutation path at all — the read layer is SELECT-only", async () => {
    // Structural assertion: if someone later adds a write to this module,
    // this test fails and forces the governed path to be used instead.
    const source = await import("fs/promises").then((fs) =>
      fs.readFile("src/lib/bumblebee/queries.ts", "utf8"),
    );
    expect(source).not.toMatch(/\b(INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM)\b/i);
  });
});
