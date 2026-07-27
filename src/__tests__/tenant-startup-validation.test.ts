/**
 * Tenant Startup Validation Tests — Story 22.3
 *
 * Verifies:
 * - Valid tenant starts successfully (no throw)
 * - Invalid tenant fails closed with clear error
 * - Inactive tenant fails closed
 * - Missing DEFAULT_GROUP_ID falls back to allura-system with warning
 * - Validation runs after DB connection is established
 * - bootstrapMemoryServer calls the validator
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

vi.mock("@/lib/ruvector/connection", () => ({
  isRuVectorEnabled: vi.fn(() => false),
  getRuVectorPool: vi.fn(),
}));

vi.mock("@/lib/ruvector/embedding-service", () => ({
  warmupEmbedding: vi.fn(() => Promise.resolve(true)),
}));

vi.mock("@/lib/neo4j/connection", () => ({
  readTransaction: vi.fn(),
  writeTransaction: vi.fn(),
}));

// ── Import after mocks ─────────────────────────────────────────────────────────

import {
  resolveDefaultGroupId,
  validateTenantAtStartup,
  resolveAndValidateStartupTenant,
  TenantValidationError,
  DEFAULT_FALLBACK_GROUP_ID,
} from "@/lib/config/tenant-validator";
import { bootstrapMemoryServer } from "@/mcp/startup";

beforeEach(() => {
  queryMock.mockReset();
  delete process.env.DEFAULT_GROUP_ID;
});

// ── resolveDefaultGroupId ─────────────────────────────────────────────────────

describe("Story 22.3 — resolveDefaultGroupId", () => {
  it("returns the env var value when set", () => {
    process.env.DEFAULT_GROUP_ID = "allura-faithmeats";
    const result = resolveDefaultGroupId();
    expect(result.groupId).toBe("allura-faithmeats");
    expect(result.warning).toBeUndefined();
  });

  it("falls back to allura-system with warning when env var not set", () => {
    delete process.env.DEFAULT_GROUP_ID;
    const result = resolveDefaultGroupId();
    expect(result.groupId).toBe(DEFAULT_FALLBACK_GROUP_ID);
    expect(result.warning).toContain("DEFAULT_GROUP_ID env var is not set");
    expect(result.warning).toContain(DEFAULT_FALLBACK_GROUP_ID);
  });

  it("falls back when env var is empty string", () => {
    process.env.DEFAULT_GROUP_ID = "   ";
    const result = resolveDefaultGroupId();
    expect(result.groupId).toBe(DEFAULT_FALLBACK_GROUP_ID);
    expect(result.warning).toBeDefined();
  });
});

// ── validateTenantAtStartup ───────────────────────────────────────────────────

describe("Story 22.3 — validateTenantAtStartup", () => {
  it("does not throw for a registered, active tenant", async () => {
    queryMock.mockResolvedValue({ rowCount: 1, rows: [{ active: true }] });
    await expect(validateTenantAtStartup("allura-system")).resolves.toBeUndefined();
  });

  it("throws TenantValidationError for unregistered tenant", async () => {
    queryMock.mockResolvedValue({ rowCount: 0, rows: [] });
    await expect(validateTenantAtStartup("allura-unknown")).rejects.toThrow(
      TenantValidationError
    );
    await expect(validateTenantAtStartup("allura-unknown")).rejects.toThrow(
      "not a registered tenant"
    );
  });

  it("throws TenantValidationError for inactive tenant", async () => {
    queryMock.mockResolvedValue({ rowCount: 1, rows: [{ active: false }] });
    await expect(validateTenantAtStartup("allura-inactive")).rejects.toThrow(
      TenantValidationError
    );
    await expect(validateTenantAtStartup("allura-inactive")).rejects.toThrow(
      "inactive"
    );
  });

  it("error message includes the group_id for unregistered tenant", async () => {
    queryMock.mockResolvedValue({ rowCount: 0, rows: [] });
    let caught: unknown = null;
    try {
      await validateTenantAtStartup("allura-ghost");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(TenantValidationError);
    const msg = (caught as TenantValidationError).message;
    expect(msg).toContain("allura-ghost");
    expect(msg).toContain("POST /api/tenants");
  });
});

// ── resolveAndValidateStartupTenant ───────────────────────────────────────────

describe("Story 22.3 — resolveAndValidateStartupTenant", () => {
  it("resolves and validates successfully for a registered tenant", async () => {
    process.env.DEFAULT_GROUP_ID = "allura-faithmeats";
    queryMock.mockResolvedValue({ rowCount: 1, rows: [{ active: true }] });
    const result = await resolveAndValidateStartupTenant();
    expect(result.groupId).toBe("allura-faithmeats");
    expect(result.warning).toBeUndefined();
  });

  it("includes warning when falling back to default", async () => {
    delete process.env.DEFAULT_GROUP_ID;
    queryMock.mockResolvedValue({ rowCount: 1, rows: [{ active: true }] });
    const result = await resolveAndValidateStartupTenant();
    expect(result.groupId).toBe(DEFAULT_FALLBACK_GROUP_ID);
    expect(result.warning).toContain("DEFAULT_GROUP_ID env var is not set");
  });

  it("throws for unregistered tenant", async () => {
    process.env.DEFAULT_GROUP_ID = "allura-ghost";
    queryMock.mockResolvedValue({ rowCount: 0, rows: [] });
    await expect(resolveAndValidateStartupTenant()).rejects.toThrow(
      TenantValidationError
    );
  });
});

// ── bootstrapMemoryServer integration ─────────────────────────────────────────

describe("Story 22.3 — bootstrapMemoryServer tenant validation", () => {
  it("calls tenant validator after connection warmup", async () => {
    const validateTenantFn = vi.fn(() =>
      Promise.resolve({ groupId: "allura-system" })
    );
    await bootstrapMemoryServer({
      resetBudgetStateFn: vi.fn(),
      warmConnectionsFn: vi.fn(() => Promise.resolve()),
      warmEmbeddingFn: vi.fn(() => Promise.resolve(true)),
      validateTenantFn,
    });
    expect(validateTenantFn).toHaveBeenCalledTimes(1);
  });

  it("fails closed when tenant validation throws", async () => {
    const validateTenantFn = vi.fn(() =>
      Promise.reject(new TenantValidationError("Tenant 'allura-ghost' is inactive."))
    );
    await expect(
      bootstrapMemoryServer({
        resetBudgetStateFn: vi.fn(),
        warmConnectionsFn: vi.fn(() => Promise.resolve()),
        warmEmbeddingFn: vi.fn(() => Promise.resolve(true)),
        validateTenantFn,
      })
    ).rejects.toThrow(TenantValidationError);
  });

  it("succeeds when tenant validation passes", async () => {
    const validateTenantFn = vi.fn(() =>
      Promise.resolve({ groupId: "allura-system" })
    );
    await expect(
      bootstrapMemoryServer({
        resetBudgetStateFn: vi.fn(),
        warmConnectionsFn: vi.fn(() => Promise.resolve()),
        warmEmbeddingFn: vi.fn(() => Promise.resolve(true)),
        validateTenantFn,
      })
    ).resolves.toBeUndefined();
  });
});