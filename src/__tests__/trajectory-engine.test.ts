/**
 * Unit tests for the SONA Trajectory Engine (Story 1.3)
 *
 * These tests exercise the pure-logic surface of the trajectory engine:
 * - defaultTaskType mapping
 * - hashPayload determinism and null handling
 * - recordTrajectory validation (group_id rejection, duration clamping)
 * - recordTrajectoryAsync non-blocking behavior
 * - withTrajectory success/failure wrapping
 *
 * The controlPlane syscall_mutate is mocked so no DB is touched — this keeps the
 * tests in the unit lane (no external services).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock the controlPlane syscall_mutate so we never touch the DB / proof engine ──
//
// vi.mock factories are hoisted to the top of the file, so any variables
// they reference must be created with vi.hoisted (which is also hoisted).

const { mockMutate } = vi.hoisted(() => ({
  mockMutate: vi.fn(),
}));

vi.mock("@/control-plane/syscalls", () => ({
  syscall_mutate: mockMutate,
  SyscallContext: {}, // type-only export; just need the symbol present
}));

// Stub the proof/policy modules that syscalls.ts imports transitively so
// the mock is self-contained. These are only needed if syscall_mutate is
// called for real, but mocking them prevents env-dependent initialization.
vi.mock("@/control-plane/proof", () => ({
  createProof: vi.fn(() => ({ intent: "mutate", subject: "test", actor: "test", claims: {} })),
  verifyProofOrThrow: vi.fn(() => ({ group_id: "allura-test", actor: "test", intent: "mutate", subject: "test", nonce: "n", timestamp: 0 })),
  getControlPlaneSecretKey: vi.fn(() => "test-secret-key"),
}));

vi.mock("@/control-plane/policy", () => ({
  evaluatePoliciesOrThrow: vi.fn(),
  Policy: {},
  PolicyContext: {},
}));

vi.mock("@/control-plane/target-resolver", () => ({
  resolveTarget: vi.fn(async () => ({ success: true, affected_rows: 1 })),
}));

// ── Import the module under test (after mocks are registered) ─────────────────

import {
  defaultTaskType,
  hashPayload,
  recordTrajectory,
  recordTrajectoryAsync,
  type TaskType,
  type TrajectoryAction,
  withTrajectory,
} from "@/lib/sona/trajectory-engine";

// ── Helpers ────────────────────────────────────────────────────────────────────

function resetMocks() {
  mockMutate.mockReset();
  mockMutate.mockResolvedValue({
    success: true,
    data: { affected_rows: 1, auditId: "test-audit" },
    auditId: "test-audit",
  });
}

beforeEach(async () => {
  // Flush any pending setImmediate-scheduled callbacks from a previous
  // test's fire-and-forget recording BEFORE resetting the mock. This
  // prevents stale async recordings from leaking into call counts.
  await flushAsync();
  resetMocks();
  // Silence console.error during expected-error tests
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
  // Flush any pending async trajectory recordings from THIS test so they
  // don't leak into the next test's mock call count.
  await flushAsync();
  vi.restoreAllMocks();
});

/** Flush pending setImmediate-scheduled callbacks. */
async function flushAsync() {
  // setImmediate fires on the next iteration of the event loop; awaiting
  // a resolved promise wrapped in setImmediate guarantees it runs. We
  // flush twice to cover nested setImmediate chains (e.g. withTrajectory
  // → recordTrajectoryAsync → recordTrajectory).
  for (let i = 0; i < 3; i++) {
    await new Promise<void>((resolve) => setImmediate(() => resolve()));
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("defaultTaskType", () => {
  it("maps memory_add to ingest", () => {
    expect(defaultTaskType("memory_add")).toBe("ingest");
  });

  it("maps memory_search to retrieve", () => {
    expect(defaultTaskType("memory_search")).toBe("retrieve");
  });

  it("maps memory_get to retrieve", () => {
    expect(defaultTaskType("memory_get")).toBe("retrieve");
  });

  it("maps memory_list to retrieve", () => {
    expect(defaultTaskType("memory_list")).toBe("retrieve");
  });

  it("maps memory_list_deleted to retrieve", () => {
    expect(defaultTaskType("memory_list_deleted")).toBe("retrieve");
  });

  it("maps memory_delete to lifecycle", () => {
    expect(defaultTaskType("memory_delete")).toBe("lifecycle");
  });

  it("maps memory_update to ingest", () => {
    expect(defaultTaskType("memory_update")).toBe("ingest");
  });

  it("maps memory_promote to curate", () => {
    expect(defaultTaskType("memory_promote")).toBe("curate");
  });

  it("maps memory_restore to ingest", () => {
    expect(defaultTaskType("memory_restore")).toBe("ingest");
  });

  it("maps memory_export to retrieve", () => {
    expect(defaultTaskType("memory_export")).toBe("retrieve");
  });

  it("maps curator_approve to curate", () => {
    expect(defaultTaskType("curator_approve")).toBe("curate");
  });

  it("maps curator_reject to curate", () => {
    expect(defaultTaskType("curator_reject")).toBe("curate");
  });

  it("maps curator_score to curate", () => {
    expect(defaultTaskType("curator_score")).toBe("curate");
  });

  it("maps curator_propose to curate", () => {
    expect(defaultTaskType("curator_propose")).toBe("curate");
  });

  it("covers all TrajectoryAction values", () => {
    const allActions: TrajectoryAction[] = [
      "memory_add",
      "memory_search",
      "memory_get",
      "memory_list",
      "memory_list_deleted",
      "memory_delete",
      "memory_update",
      "memory_promote",
      "memory_restore",
      "memory_export",
      "curator_approve",
      "curator_reject",
      "curator_score",
      "curator_propose",
    ];
    for (const action of allActions) {
      const bucket = defaultTaskType(action);
      const validBuckets: TaskType[] = ["ingest", "retrieve", "curate", "govern", "lifecycle", "unknown"];
      expect(validBuckets).toContain(bucket);
    }
  });
});

describe("hashPayload", () => {
  it("returns null for null input", () => {
    expect(hashPayload(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(hashPayload(undefined)).toBeNull();
  });

  it("returns a 16-char hex digest for a string", () => {
    const hash = hashPayload("hello world");
    expect(hash).not.toBeNull();
    expect(hash).toMatch(/^[a-f0-9]{16}$/);
  });

  it("is deterministic for the same input", () => {
    expect(hashPayload("test")).toBe(hashPayload("test"));
  });

  it("differs for different inputs", () => {
    expect(hashPayload("test1")).not.toBe(hashPayload("test2"));
  });

  it("handles object payloads", () => {
    const hash = hashPayload({ foo: "bar", count: 42 });
    expect(hash).not.toBeNull();
    expect(hash).toMatch(/^[a-f0-9]{16}$/);
  });

  it("handles array payloads", () => {
    const hash = hashPayload([1, 2, 3]);
    expect(hash).not.toBeNull();
    expect(hash).toMatch(/^[a-f0-9]{16}$/);
  });

  it("handles bigint values without throwing", () => {
    const hash = hashPayload({ big: BigInt(123) });
    expect(hash).not.toBeNull();
    expect(hash).toMatch(/^[a-f0-9]{16}$/);
  });

  it("handles circular references by falling back to type hash", () => {
    const obj: Record<string, unknown> = {};
    obj.self = obj;
    const hash = hashPayload(obj);
    expect(hash).not.toBeNull();
    expect(hash).toMatch(/^[a-f0-9]{16}$/);
  });
});

describe("recordTrajectory", () => {
  it("rejects an invalid group_id and returns recorded=false", async () => {
    const result = await recordTrajectory({
      group_id: "invalid-no-allura-prefix",
      agent_id: "test-agent",
      action: "memory_add",
      success: true,
      duration_ms: 100,
    });
    expect(result.recorded).toBe(false);
    expect(result.error).toBeDefined();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("rejects an empty group_id", async () => {
    const result = await recordTrajectory({
      group_id: "",
      agent_id: "test-agent",
      action: "memory_add",
      success: true,
      duration_ms: 100,
    });
    expect(result.recorded).toBe(false);
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("writes through syscall_mutate with a valid group_id", async () => {
    const result = await recordTrajectory({
      group_id: "allura-test",
      agent_id: "test-agent",
      action: "memory_add",
      input: "some content",
      success: true,
      duration_ms: 150,
    });
    expect(result.recorded).toBe(true);
    expect(mockMutate).toHaveBeenCalledTimes(1);

    const call = mockMutate.mock.calls[0];
    const mutationReq = call[0];
    expect(mutationReq.type).toBe("insert");
    expect(mutationReq.target).toBe("pg:agent_trajectories");
    expect(mutationReq.data).toMatchObject({
      group_id: "allura-test",
      agent_id: "test-agent",
      action: "memory_add",
      task_type: "ingest",
      success: true,
      duration_ms: 150,
    });
    // input_hash should be populated
    expect(mutationReq.data.input_hash).not.toBeNull();
  });

  it("clamps negative duration_ms to 0", async () => {
    const result = await recordTrajectory({
      group_id: "allura-test",
      agent_id: "test-agent",
      action: "memory_search",
      success: true,
      duration_ms: -50,
    });
    expect(result.recorded).toBe(true);
    const call = mockMutate.mock.calls[0];
    expect(call[0].data.duration_ms).toBe(0);
  });

  it("truncates fractional duration_ms to integer", async () => {
    const result = await recordTrajectory({
      group_id: "allura-test",
      agent_id: "test-agent",
      action: "memory_search",
      success: true,
      duration_ms: 42.7,
    });
    expect(result.recorded).toBe(true);
    const call = mockMutate.mock.calls[0];
    expect(call[0].data.duration_ms).toBe(42);
  });

  it("uses the default task_type when not specified", async () => {
    await recordTrajectory({
      group_id: "allura-test",
      agent_id: "test-agent",
      action: "curator_approve",
      success: true,
      duration_ms: 10,
    });
    const call = mockMutate.mock.calls[0];
    expect(call[0].data.task_type).toBe("curate");
  });

  it("uses the explicit task_type when provided", async () => {
    await recordTrajectory({
      group_id: "allura-test",
      agent_id: "test-agent",
      action: "memory_add",
      task_type: "govern",
      success: true,
      duration_ms: 10,
    });
    const call = mockMutate.mock.calls[0];
    expect(call[0].data.task_type).toBe("govern");
  });

  it("sets input_hash and output_hash to null when payloads are absent", async () => {
    await recordTrajectory({
      group_id: "allura-test",
      agent_id: "test-agent",
      action: "memory_search",
      success: true,
      duration_ms: 10,
    });
    const call = mockMutate.mock.calls[0];
    expect(call[0].data.input_hash).toBeNull();
    expect(call[0].data.output_hash).toBeNull();
  });

  it("returns recorded=false when syscall_mutate fails (no throw)", async () => {
    mockMutate.mockResolvedValueOnce({
      success: false,
      error: "controlPlane policy denied",
    });

    const result = await recordTrajectory({
      group_id: "allura-test",
      agent_id: "test-agent",
      action: "memory_add",
      success: true,
      duration_ms: 10,
    });

    expect(result.recorded).toBe(false);
    expect(result.error).toBe("controlPlane policy denied");
  });

  it("returns recorded=false when syscall_mutate throws (defensive)", async () => {
    mockMutate.mockRejectedValueOnce(new Error("unexpected controlPlane blowup"));

    const result = await recordTrajectory({
      group_id: "allura-test",
      agent_id: "test-agent",
      action: "memory_add",
      success: true,
      duration_ms: 10,
    });

    expect(result.recorded).toBe(false);
    expect(result.error).toBe("unexpected controlPlane blowup");
  });

  it("passes group_id in the SyscallContext", async () => {
    await recordTrajectory({
      group_id: "allura-myteam",
      agent_id: "test-agent",
      action: "memory_add",
      success: true,
      duration_ms: 10,
    });
    const context = mockMutate.mock.calls[0][1];
    expect(context.group_id).toBe("allura-myteam");
    expect(context.actor).toBe("test-agent");
  });
});

describe("recordTrajectoryAsync", () => {
  it("does not block the caller (returns synchronously)", () => {
    // Should return void immediately without awaiting
    const result = recordTrajectoryAsync({
      group_id: "allura-test",
      agent_id: "test-agent",
      action: "memory_add",
      success: true,
      duration_ms: 5,
    });
    expect(result).toBeUndefined();
  });

  it("eventually calls syscall_mutate on the next tick", async () => {
    mockMutate.mockClear();
    recordTrajectoryAsync({
      group_id: "allura-test",
      agent_id: "async-agent",
      action: "memory_search",
      success: true,
      duration_ms: 5,
    });
    // Wait for the setImmediate-scheduled microtask
    await flushAsync();
    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(mockMutate.mock.calls[0][0].data.agent_id).toBe("async-agent");
  });

  it("swallows errors from recordTrajectory without throwing", async () => {
    mockMutate.mockRejectedValueOnce(new Error("async controlPlane failure"));
    // Should not throw
    recordTrajectoryAsync({
      group_id: "allura-test",
      agent_id: "test-agent",
      action: "memory_add",
      success: true,
      duration_ms: 5,
    });
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    // If we reach here, the async failure was swallowed — pass
    expect(true).toBe(true);
  });
});

describe("withTrajectory", () => {
  it("returns the wrapped operation's result on success", async () => {
    const result = await withTrajectory(
      {
        group_id: "allura-test",
        agent_id: "test-agent",
        action: "memory_add",
      },
      async () => "operation-result"
    );
    expect(result).toBe("operation-result");
  });

  it("records a successful trajectory", async () => {
    mockMutate.mockClear();
    await withTrajectory(
      {
        group_id: "allura-test",
        agent_id: "test-agent",
        action: "memory_add",
        input: "content",
      },
      async () => 42
    );
    // Wait for the async recording
    await flushAsync();
    expect(mockMutate).toHaveBeenCalledTimes(1);
    const data = mockMutate.mock.calls[0][0].data;
    expect(data.success).toBe(true);
    expect(data.action).toBe("memory_add");
    expect(data.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it("re-throws the wrapped operation's error", async () => {
    await expect(
      withTrajectory(
        {
          group_id: "allura-test",
          agent_id: "test-agent",
          action: "memory_add",
        },
        async () => {
          throw new Error("operation failed");
        }
      )
    ).rejects.toThrow("operation failed");
  });

  it("records a failed trajectory when the operation throws", async () => {
    mockMutate.mockClear();
    await expect(
      withTrajectory(
        {
          group_id: "allura-test",
          agent_id: "test-agent",
          action: "memory_search",
        },
        async () => {
          throw new Error("search blew up");
        }
      )
    ).rejects.toThrow();

    // Wait for the async recording
    await flushAsync();
    expect(mockMutate).toHaveBeenCalledTimes(1);
    const data = mockMutate.mock.calls[0][0].data;
    expect(data.success).toBe(false);
    expect(data.action).toBe("memory_search");
  });

  it("passes the task_type through to the trajectory record", async () => {
    mockMutate.mockClear();
    await withTrajectory(
      {
        group_id: "allura-test",
        agent_id: "test-agent",
        action: "memory_add",
        task_type: "govern",
      },
      async () => "ok"
    );
    await flushAsync();
    const data = mockMutate.mock.calls[0][0].data;
    expect(data.task_type).toBe("govern");
  });

  it("does not block on the trajectory recording (fire-and-forget)", async () => {
    // Make syscall_mutate slow
    mockMutate.mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(() => resolve({ success: true, data: { affected_rows: 1, auditId: "slow" } }), 500))
    );
    const start = Date.now();
    const result = await withTrajectory(
      {
        group_id: "allura-test",
        agent_id: "test-agent",
        action: "memory_add",
      },
      async () => "fast-result"
    );
    const elapsed = Date.now() - start;
    expect(result).toBe("fast-result");
    // withTrajectory returns as soon as the operation completes, not when
    // the trajectory recording finishes. We allow some slack for the event
    // loop but it should be well under 500ms.
    expect(elapsed).toBeLessThan(200);
  });
});