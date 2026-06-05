/**
 * Syscalls Tests
 *
 * TDD: tests written before implementation.
 * Verifies that syscall_mutate and syscall_query route through resolveTarget.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SyscallContext, MutationRequest, QueryRequest } from "./syscalls";

// ─────────────────────────────────────────────────────────────────────────────
// MOCKS
// ─────────────────────────────────────────────────────────────────────────────

vi.mock("./target-resolver", () => ({
  resolveTarget: vi.fn().mockResolvedValue({
    success: true,
    affected_rows: 1,
  }),
}));

// Policy gate: bypass in unit tests — policy logic is tested in policy.test.ts
vi.mock("./policy", () => ({
  evaluatePoliciesOrThrow: vi.fn(), // no-op
}));

vi.stubEnv(
  "RUVIX_KERNEL_SECRET",
  "test-secret-key-for-ruvix-kernel-proof-engine-32chars"
);

// ─────────────────────────────────────────────────────────────────────────────
// FIXTURES
// ─────────────────────────────────────────────────────────────────────────────

const ctx: SyscallContext = {
  actor: "brooks-architect",
  group_id: "allura-system",
  permission_tier: "kernel",
};

// ─────────────────────────────────────────────────────────────────────────────
// TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe("syscall_mutate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("routes insert through resolveTarget with correct intent and target", async () => {
    const { resolveTarget } = await import("./target-resolver");
    const { syscall_mutate } = await import("./syscalls");

    const request: MutationRequest = {
      type: "insert",
      target: "pg:events",
      data: {
        event_type: "BUILD_COMPLETE",
        agent_id: "woz",
        content: "Kernel syscalls wired",
      },
    };

    const result = await syscall_mutate(request, ctx);

    expect(result.success).toBe(true);
    expect(resolveTarget).toHaveBeenCalledOnce();

    const callArg = vi.mocked(resolveTarget).mock.calls[0]![0];
    expect(callArg.intent).toBe("mutate");
    expect(callArg.target).toBe("pg:events");
    expect(callArg.type).toBe("insert");
    // group_id must be injected from claims
    expect((callArg.data as Record<string, unknown>)["group_id"]).toBe(
      "allura-system"
    );
  });

  it("returns an auditId matching pattern audit-allura-system-mutate-*", async () => {
    vi.mocked(await import("./target-resolver")).resolveTarget.mockResolvedValue(
      { success: true, affected_rows: 1 }
    );

    const { syscall_mutate } = await import("./syscalls");

    const request: MutationRequest = {
      type: "insert",
      target: "pg:events",
      data: { event_type: "TEST" },
    };

    const result = await syscall_mutate(request, ctx);

    expect(result.success).toBe(true);
    expect(result.auditId).toMatch(/^audit-allura-system-mutate-/);
  });

  it("returns success:false when resolveTarget reports failure", async () => {
    vi.mocked(await import("./target-resolver")).resolveTarget.mockResolvedValue(
      { success: false }
    );

    const { syscall_mutate } = await import("./syscalls");

    const request: MutationRequest = {
      type: "insert",
      target: "pg:events",
      data: { event_type: "TEST" },
    };

    const result = await syscall_mutate(request, ctx);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe("syscall_query", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("routes through resolveTarget and returns rows", async () => {
    const mockRows = [{ id: "row-1", content: "test" }];
    vi.mocked(await import("./target-resolver")).resolveTarget.mockResolvedValue(
      { success: true, rows: mockRows }
    );

    const { syscall_query } = await import("./syscalls");

    const request: QueryRequest = {
      target: "pg:events",
      query: { agent_id: "woz" },
      limit: 10,
    };

    const result = await syscall_query(request, ctx);

    const { resolveTarget } = await import("./target-resolver");

    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockRows);
    expect(resolveTarget).toHaveBeenCalledOnce();

    const callArg = vi.mocked(resolveTarget).mock.calls[0]![0];
    expect(callArg.intent).toBe("query");
    expect(callArg.target).toBe("pg:events");
    expect(callArg.limit).toBe(10);
    // group_id must be injected
    expect((callArg.query as Record<string, unknown>)["group_id"]).toBe(
      "allura-system"
    );
  });

  it("returns an empty array when resolveTarget returns no rows", async () => {
    vi.mocked(await import("./target-resolver")).resolveTarget.mockResolvedValue(
      { success: true }
    );

    const { syscall_query } = await import("./syscalls");

    const result = await syscall_query({ target: "pg:events" }, ctx);

    expect(result.success).toBe(true);
    expect(result.data).toEqual([]);
  });
});

describe("syscall_trace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should route trace through target resolver as pg:events insert", async () => {
    vi.mocked(await import("./target-resolver")).resolveTarget.mockResolvedValueOnce(
      { success: true, affected_rows: 1 }
    );

    const { syscall_trace } = await import("./syscalls");
    const { resolveTarget } = await import("./target-resolver");

    const result = await syscall_trace(
      {
        group_id: "allura-system",
        agent_id: "brooks",
        trace_type: "contribution",
        content: "test",
      },
      ctx
    );

    expect(result.success).toBe(true);
    expect(result.data?.trace_id).toBeDefined();
    expect(resolveTarget).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: "mutate",
        target: "pg:events",
        type: "insert",
      })
    );
  });

  it("returns success:false when resolveTarget reports failure for trace", async () => {
    vi.mocked(await import("./target-resolver")).resolveTarget.mockResolvedValueOnce(
      { success: false }
    );

    const { syscall_trace } = await import("./syscalls");

    const result = await syscall_trace(
      { group_id: "allura-system", agent_id: "brooks", content: "test" },
      ctx
    );

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("injects group_id from claims into the trace data payload", async () => {
    vi.mocked(await import("./target-resolver")).resolveTarget.mockResolvedValueOnce(
      { success: true, affected_rows: 1 }
    );

    const { syscall_trace } = await import("./syscalls");
    const { resolveTarget } = await import("./target-resolver");

    await syscall_trace({ content: "test" }, ctx);

    const callArg = vi.mocked(resolveTarget).mock.calls[0]![0];
    expect((callArg.data as Record<string, unknown>)["group_id"]).toBe(
      "allura-system"
    );
  });
});
