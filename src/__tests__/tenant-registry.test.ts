/**
 * Tenant Registry Tests — Story 22.1
 *
 * Verifies:
 * - The tenants table migration SQL exists and follows the pattern
 * - The seed data includes all 4 existing tenants
 * - The target-resolver rejects unregistered group_ids on writes
 * - The target-resolver accepts registered group_ids on writes
 * - Inactive tenants are rejected
 * - System tables (tenants, schema_versions) are exempt from validation
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// ── Mock the database pool ────────────────────────────────────────────────────

const queryMock = vi.fn();

vi.mock("@/lib/postgres/connection", () => ({
  getPool: vi.fn(() => ({ query: queryMock })),
}));

vi.mock("@/lib/neo4j/connection", () => ({
  readTransaction: vi.fn(),
  writeTransaction: vi.fn(),
}));

// Import after mocks
import { assertRegisteredTenant, isRegisteredTenant, getTenant } from "@/lib/config/tenant-existence";

beforeEach(() => {
  queryMock.mockReset();
});

// ── Migration SQL file tests ──────────────────────────────────────────────────

describe("Story 22.1 — Migration SQL", () => {
  const migrationPath = join(
    process.cwd(),
    "docker/postgres-init/33-tenant-registry.sql"
  );

  it("migration file exists at docker/postgres-init/33-tenant-registry.sql", () => {
    const sql = readFileSync(migrationPath, "utf-8");
    expect(sql).toBeDefined();
    expect(sql.length).toBeGreaterThan(0);
  });

  it("creates tenants table with correct columns", () => {
    const sql = readFileSync(migrationPath, "utf-8");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS tenants");
    expect(sql).toContain("group_id");
    expect(sql).toContain("TEXT        PRIMARY KEY");
    expect(sql).toContain("name");
    expect(sql).toContain("description");
    expect(sql).toContain("owner_agent_id");
    expect(sql).toContain("config");
    expect(sql).toContain("JSONB");
    expect(sql).toContain("active");
    expect(sql).toContain("BOOLEAN");
    expect(sql).toContain("created_at");
    expect(sql).toContain("TIMESTAMPTZ");
  });

  it("has CHECK constraint for group_id format ^allura-[a-z0-9-]+$", () => {
    const sql = readFileSync(migrationPath, "utf-8");
    expect(sql).toContain("chk_tenants_group_id_format");
    expect(sql).toContain("^allura-[a-z0-9-]+$");
  });

  it("seeds all 4 existing tenants", () => {
    const sql = readFileSync(migrationPath, "utf-8");
    expect(sql).toContain("allura-system");
    expect(sql).toContain("allura-faithmeats");
    expect(sql).toContain("allura-difference-driven");
    expect(sql).toContain("allura-coding");
    expect(sql).toContain("ON CONFLICT (group_id) DO NOTHING");
  });

  it("is idempotent (uses IF NOT EXISTS and ON CONFLICT)", () => {
    const sql = readFileSync(migrationPath, "utf-8");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS");
    expect(sql).toContain("ON CONFLICT (group_id) DO NOTHING");
    expect(sql).toContain("IF NOT EXISTS");
  });
});

// ── Tenant existence validation tests ─────────────────────────────────────────

describe("Story 22.1 — isRegisteredTenant", () => {
  it("returns true for a registered, active tenant", async () => {
    queryMock.mockResolvedValue({ rowCount: 1, rows: [{ active: true }] });
    const result = await isRegisteredTenant("allura-system");
    expect(result).toBe(true);
    expect(queryMock).toHaveBeenCalledWith(
      "SELECT 1 FROM tenants WHERE group_id = $1 AND active = TRUE",
      ["allura-system"]
    );
  });

  it("returns false for an unregistered tenant", async () => {
    queryMock.mockResolvedValue({ rowCount: 0, rows: [] });
    const result = await isRegisteredTenant("allura-unknown");
    expect(result).toBe(false);
  });

  it("throws GroupIdValidationError for invalid group_id format", async () => {
    await expect(isRegisteredTenant("invalid")).rejects.toThrow();
  });
});

describe("Story 22.1 — getTenant", () => {
  it("returns the tenant record when found", async () => {
    const mockRow = {
      group_id: "allura-faithmeats",
      name: "Faith Meats",
      description: "Halal meat processing",
      owner_agent_id: "brooks",
      config: { promotion_threshold: 0.85 },
      active: true,
      created_at: new Date("2026-07-26"),
    };
    queryMock.mockResolvedValue({ rowCount: 1, rows: [mockRow] });
    const result = await getTenant("allura-faithmeats");
    expect(result).not.toBeNull();
    expect(result?.group_id).toBe("allura-faithmeats");
    expect(result?.name).toBe("Faith Meats");
    expect(result?.active).toBe(true);
  });

  it("returns null when tenant not found", async () => {
    queryMock.mockResolvedValue({ rowCount: 0, rows: [] });
    const result = await getTenant("allura-nonexistent");
    expect(result).toBeNull();
  });
});

describe("Story 22.1 — assertRegisteredTenant", () => {
  it("does not throw for a registered, active tenant", async () => {
    queryMock.mockResolvedValue({ rowCount: 1, rows: [{ active: true }] });
    await expect(assertRegisteredTenant("allura-system")).resolves.toBeUndefined();
  });

  it("throws descriptive error for unregistered tenant", async () => {
    queryMock.mockResolvedValue({ rowCount: 0, rows: [] });
    await expect(assertRegisteredTenant("allura-unknown")).rejects.toThrow(
      "not a registered tenant"
    );
  });

  it("throws descriptive error for inactive tenant", async () => {
    queryMock.mockResolvedValue({ rowCount: 1, rows: [{ active: false }] });
    await expect(assertRegisteredTenant("allura-inactive")).rejects.toThrow(
      "inactive"
    );
  });
});

// ── Target resolver tenant validation tests ───────────────────────────────────

describe("Story 22.1 — Target resolver tenant validation", () => {
  it("rejects writes for unregistered group_id via pgMutate", async () => {
    queryMock.mockResolvedValue({ rowCount: 0, rows: [] });
    const { resolveTarget } = await import("@/kernel/target-resolver");
    await expect(
      resolveTarget({
        intent: "mutate",
        target: "pg:memories",
        type: "insert",
        data: { group_id: "allura-unregistered", content: "test" },
      })
    ).rejects.toThrow("not a registered tenant");
  });

  it("allows writes to tenants table (exempt from validation)", async () => {
    // The tenants table should NOT trigger tenant validation
    queryMock.mockResolvedValue({ rowCount: 1, rows: [] });
    const { resolveTarget } = await import("@/kernel/target-resolver");
    const result = await resolveTarget({
      intent: "mutate",
      target: "pg:tenants",
      type: "insert",
      data: {
        group_id: "allura-new-tenant",
        name: "New Tenant",
        description: "Test",
        owner_agent_id: "admin",
      },
    });
    expect(result.success).toBe(true);
  });
});