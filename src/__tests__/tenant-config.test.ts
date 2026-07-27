/**
 * Tenant-Scoped Curator Config Tests — Story 22.4
 *
 * Verifies:
 * - parseTenantConfig returns defaults for null/undefined/empty input
 * - parseTenantConfig validates and applies each field correctly
 * - parseTenantConfig falls back to defaults for invalid values
 * - getTenantConfig reads from the database and parses config
 * - getTenantConfig returns defaults when tenant not found
 * - getEffectiveScoreThreshold applies mode adjustments
 * - resolveScoreThreshold falls back to provided default
 * - group_id validation is enforced
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock environment ──────────────────────────────────────────────────────────

process.env.ALLURA_DEV_AUTH_ENABLED = "true";
// @ts-expect-error — NODE_ENV is read-only in Next.js types but must be set for tests
process.env.NODE_ENV = "test";

// ── Mutable mock state ────────────────────────────────────────────────────────

const queryMock = vi.fn();

// ── Mock postgres connection ──────────────────────────────────────────────────

vi.mock("@/lib/postgres/connection", () => ({
  getPool: vi.fn(() => ({ query: queryMock })),
}));

// ── Import after mocks ─────────────────────────────────────────────────────────

import {
  parseTenantConfig,
  getTenantConfig,
  getEffectiveScoreThreshold,
  resolveScoreThreshold,
  DEFAULT_TENANT_CONFIG,
} from "@/lib/config/tenant-config";
import { GroupIdValidationError } from "@/lib/validation/group-id";

beforeEach(() => {
  queryMock.mockReset();
});

// ── parseTenantConfig ──────────────────────────────────────────────────────────

describe("Story 22.4 — parseTenantConfig", () => {
  it("returns defaults for null input", () => {
    const config = parseTenantConfig(null);
    expect(config).toEqual(DEFAULT_TENANT_CONFIG);
  });

  it("returns defaults for undefined input", () => {
    const config = parseTenantConfig(undefined);
    expect(config).toEqual(DEFAULT_TENANT_CONFIG);
  });

  it("returns defaults for empty object", () => {
    const config = parseTenantConfig({});
    expect(config).toEqual(DEFAULT_TENANT_CONFIG);
  });

  it("applies valid promotion_threshold", () => {
    const config = parseTenantConfig({ promotion_threshold: 0.85 });
    expect(config.promotion_threshold).toBe(0.85);
  });

  it("rejects promotion_threshold below 0", () => {
    const config = parseTenantConfig({ promotion_threshold: -0.1 });
    expect(config.promotion_threshold).toBe(DEFAULT_TENANT_CONFIG.promotion_threshold);
  });

  it("rejects promotion_threshold above 1", () => {
    const config = parseTenantConfig({ promotion_threshold: 1.5 });
    expect(config.promotion_threshold).toBe(DEFAULT_TENANT_CONFIG.promotion_threshold);
  });

  it("rejects non-number promotion_threshold", () => {
    const config = parseTenantConfig({ promotion_threshold: "high" });
    expect(config.promotion_threshold).toBe(DEFAULT_TENANT_CONFIG.promotion_threshold);
  });

  it("applies valid auto_approval_mode", () => {
    for (const mode of ["conservative", "balanced", "aggressive"] as const) {
      const config = parseTenantConfig({ auto_approval_mode: mode });
      expect(config.auto_approval_mode).toBe(mode);
    }
  });

  it("rejects invalid auto_approval_mode string", () => {
    const config = parseTenantConfig({ auto_approval_mode: "yolo" });
    expect(config.auto_approval_mode).toBe(DEFAULT_TENANT_CONFIG.auto_approval_mode);
  });

  it("applies valid curator_schedule_hours", () => {
    const config = parseTenantConfig({ curator_schedule_hours: 6 });
    expect(config.curator_schedule_hours).toBe(6);
  });

  it("rejects curator_schedule_hours of 0", () => {
    const config = parseTenantConfig({ curator_schedule_hours: 0 });
    expect(config.curator_schedule_hours).toBe(DEFAULT_TENANT_CONFIG.curator_schedule_hours);
  });

  it("rejects curator_schedule_hours above 168 (1 week)", () => {
    const config = parseTenantConfig({ curator_schedule_hours: 200 });
    expect(config.curator_schedule_hours).toBe(DEFAULT_TENANT_CONFIG.curator_schedule_hours);
  });

  it("applies drift_audit_enabled boolean", () => {
    const config = parseTenantConfig({ drift_audit_enabled: false });
    expect(config.drift_audit_enabled).toBe(false);
  });

  it("rejects non-boolean drift_audit_enabled", () => {
    const config = parseTenantConfig({ drift_audit_enabled: "yes" });
    expect(config.drift_audit_enabled).toBe(DEFAULT_TENANT_CONFIG.drift_audit_enabled);
  });

  it("applies all fields together", () => {
    const config = parseTenantConfig({
      promotion_threshold: 0.9,
      auto_approval_mode: "conservative",
      curator_schedule_hours: 12,
      drift_audit_enabled: false,
    });
    expect(config).toEqual({
      promotion_threshold: 0.9,
      auto_approval_mode: "conservative",
      curator_schedule_hours: 12,
      drift_audit_enabled: false,
    });
  });
});

// ── getTenantConfig ────────────────────────────────────────────────────────────

describe("Story 22.4 — getTenantConfig", () => {
  it("reads config from the database and parses it", async () => {
    queryMock.mockResolvedValue({
      rowCount: 1,
      rows: [{ config: { promotion_threshold: 0.85, auto_approval_mode: "aggressive" } }],
    });

    const config = await getTenantConfig("allura-faithmeats");
    expect(config.promotion_threshold).toBe(0.85);
    expect(config.auto_approval_mode).toBe("aggressive");
  });

  it("returns defaults when tenant not found", async () => {
    queryMock.mockResolvedValue({ rowCount: 0, rows: [] });

    const config = await getTenantConfig("allura-unknown");
    expect(config).toEqual(DEFAULT_TENANT_CONFIG);
  });

  it("returns defaults when config column is null", async () => {
    queryMock.mockResolvedValue({
      rowCount: 1,
      rows: [{ config: null }],
    });

    const config = await getTenantConfig("allura-system");
    expect(config).toEqual(DEFAULT_TENANT_CONFIG);
  });

  it("returns defaults when config is empty object", async () => {
    queryMock.mockResolvedValue({
      rowCount: 1,
      rows: [{ config: {} }],
    });

    const config = await getTenantConfig("allura-system");
    expect(config).toEqual(DEFAULT_TENANT_CONFIG);
  });

  it("rejects invalid group_id format", async () => {
    await expect(getTenantConfig("invalid")).rejects.toThrow(GroupIdValidationError);
  });

  it("queries with the correct SQL and parameters", async () => {
    queryMock.mockResolvedValue({ rowCount: 0, rows: [] });

    await getTenantConfig("allura-system");

    expect(queryMock).toHaveBeenCalledTimes(1);
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toContain("SELECT config FROM tenants");
    expect(sql).toContain("WHERE group_id = $1");
    expect(sql).toContain("AND active = TRUE");
    expect(params).toEqual(["allura-system"]);
  });
});

// ── getEffectiveScoreThreshold ─────────────────────────────────────────────────

describe("Story 22.4 — getEffectiveScoreThreshold", () => {
  it("returns base threshold for balanced mode", async () => {
    queryMock.mockResolvedValue({
      rowCount: 1,
      rows: [{ config: { promotion_threshold: 0.7, auto_approval_mode: "balanced" } }],
    });

    const threshold = await getEffectiveScoreThreshold("allura-system");
    expect(threshold).toBe(0.7);
  });

  it("adds 0.10 for conservative mode", async () => {
    queryMock.mockResolvedValue({
      rowCount: 1,
      rows: [{ config: { promotion_threshold: 0.7, auto_approval_mode: "conservative" } }],
    });

    const threshold = await getEffectiveScoreThreshold("allura-system");
    expect(threshold).toBeCloseTo(0.8, 10);
  });

  it("subtracts 0.10 for aggressive mode", async () => {
    queryMock.mockResolvedValue({
      rowCount: 1,
      rows: [{ config: { promotion_threshold: 0.7, auto_approval_mode: "aggressive" } }],
    });

    const threshold = await getEffectiveScoreThreshold("allura-system");
    expect(threshold).toBeCloseTo(0.6, 10);
  });

  it("clamps result to 0.0 minimum", async () => {
    queryMock.mockResolvedValue({
      rowCount: 1,
      rows: [{ config: { promotion_threshold: 0.05, auto_approval_mode: "aggressive" } }],
    });

    const threshold = await getEffectiveScoreThreshold("allura-system");
    expect(threshold).toBe(0.0);
  });

  it("clamps result to 1.0 maximum", async () => {
    queryMock.mockResolvedValue({
      rowCount: 1,
      rows: [{ config: { promotion_threshold: 0.95, auto_approval_mode: "conservative" } }],
    });

    const threshold = await getEffectiveScoreThreshold("allura-system");
    expect(threshold).toBe(1.0);
  });

  it("returns default threshold (0.7) when tenant not found", async () => {
    queryMock.mockResolvedValue({ rowCount: 0, rows: [] });

    const threshold = await getEffectiveScoreThreshold("allura-unknown");
    // Default is 0.7 + balanced adjustment (0.0) = 0.7
    expect(threshold).toBe(0.7);
  });
});

// ── resolveScoreThreshold ──────────────────────────────────────────────────────

describe("Story 22.4 — resolveScoreThreshold", () => {
  it("returns tenant-configured threshold with mode adjustment", async () => {
    queryMock.mockResolvedValue({
      rowCount: 1,
      rows: [{ config: { promotion_threshold: 0.8, auto_approval_mode: "conservative" } }],
    });

    const threshold = await resolveScoreThreshold("allura-system");
    expect(threshold).toBeCloseTo(0.9, 10); // 0.8 + 0.10
  });

  it("falls back to provided default when tenant not found", async () => {
    queryMock.mockResolvedValue({ rowCount: 0, rows: [] });

    const threshold = await resolveScoreThreshold("allura-unknown", 0.85);
    expect(threshold).toBe(0.85);
  });

  it("falls back to default when config has no promotion_threshold", async () => {
    queryMock.mockResolvedValue({
      rowCount: 1,
      rows: [{ config: { auto_approval_mode: "balanced" } }],
    });

    const threshold = await resolveScoreThreshold("allura-system", 0.6);
    expect(threshold).toBe(0.6);
  });

  it("falls back to default when promotion_threshold is out of range", async () => {
    queryMock.mockResolvedValue({
      rowCount: 1,
      rows: [{ config: { promotion_threshold: 1.5 } }],
    });

    const threshold = await resolveScoreThreshold("allura-system", 0.7);
    expect(threshold).toBe(0.7);
  });

  it("uses default fallback of 0.7 when no fallback provided", async () => {
    queryMock.mockResolvedValue({ rowCount: 0, rows: [] });

    const threshold = await resolveScoreThreshold("allura-unknown");
    expect(threshold).toBe(0.7);
  });

  it("rejects invalid group_id format", async () => {
    await expect(resolveScoreThreshold("invalid")).rejects.toThrow(GroupIdValidationError);
  });
});