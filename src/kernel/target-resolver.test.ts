/**
 * Target Resolver Tests
 *
 * TDD: tests written before implementation.
 * Verifies that resolveTarget maps syscall target strings to real DB operations.
 */

import { describe, expect, it, vi } from "vitest";
import type { TargetOperation } from "./target-resolver";

// ─────────────────────────────────────────────────────────────────────────────
// MOCKS
// ─────────────────────────────────────────────────────────────────────────────

vi.mock("@/lib/postgres/connection", () => ({
  getPool: vi.fn(() => ({
    query: vi
      .fn()
      .mockResolvedValue({ rows: [{ id: "test-id" }], rowCount: 1 }),
  })),
}));

vi.mock("@/lib/config/tenant-existence", () => ({
  assertRegisteredTenant: vi.fn().mockResolvedValue(undefined),
}));

// ─────────────────────────────────────────────────────────────────────────────
// TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe("resolveTarget", () => {
  // Lazy import so mocks are in place before module is loaded
  const getResolver = async () => {
    const mod = await import("./target-resolver");
    return mod.resolveTarget;
  };

  // ── 1. pg:events insert ───────────────────────────────────────────────────
  it("pg:events insert resolves successfully", async () => {
    const resolveTarget = await getResolver();

    const op: TargetOperation = {
      intent: "mutate",
      target: "pg:events",
      type: "insert",
      data: {
        group_id: "allura-system",
        agent_id: "woz-builder",
        event_type: "BUILD_COMPLETE",
        metadata: { task: "target-resolver" },
      },
    };

    const result = await resolveTarget(op);
    expect(result.success).toBe(true);
    expect(result.affected_rows).toBe(1);
  });

  // ── 2. pg:events update rejected (append-only) ────────────────────────────
  it("pg:events update rejected with append-only error", async () => {
    const resolveTarget = await getResolver();

    const op: TargetOperation = {
      intent: "mutate",
      target: "pg:events",
      type: "update",
      data: { group_id: "allura-system", status: "done" },
    };

    await expect(resolveTarget(op)).rejects.toThrow("append-only");
  });

  // ── 3. pg:events delete rejected (append-only) ────────────────────────────
  it("pg:events delete rejected with append-only error", async () => {
    const resolveTarget = await getResolver();

    const op: TargetOperation = {
      intent: "mutate",
      target: "pg:events",
      type: "delete_op",
      data: { group_id: "allura-system", id: "some-id" },
    };

    await expect(resolveTarget(op)).rejects.toThrow("append-only");
  });

  // ── 4. Missing group_id rejected ─────────────────────────────────────────
  it("missing group_id is rejected", async () => {
    const resolveTarget = await getResolver();

    const op: TargetOperation = {
      intent: "mutate",
      target: "pg:events",
      type: "insert",
      data: {
        agent_id: "woz-builder",
        event_type: "BUILD_COMPLETE",
      },
    };

    await expect(resolveTarget(op)).rejects.toThrow("group_id");
  });

  // ── 5. pg:memories query resolves successfully ────────────────────────────
  it("pg:memories query resolves successfully", async () => {
    const resolveTarget = await getResolver();

    const op: TargetOperation = {
      intent: "query",
      target: "pg:memories",
      query: { group_id: "allura-system", user_id: "woz-builder" },
      limit: 10,
      offset: 0,
    };

    const result = await resolveTarget(op);
    expect(result.success).toBe(true);
    expect(Array.isArray(result.rows)).toBe(true);
  });

  // ── 6. Unknown target prefix rejected ────────────────────────────────────
  it("unknown target prefix throws an error containing 'Unknown target'", async () => {
    const resolveTarget = await getResolver();

    const op: TargetOperation = {
      intent: "mutate",
      target: "redis:cache",
      type: "insert",
      data: { group_id: "allura-system", key: "val" },
    };

    await expect(resolveTarget(op)).rejects.toThrow("Unknown target");
  });
});
